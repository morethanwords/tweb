/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import rootScope from "../lib/rootScope";
import appMessagesManager from "../lib/appManagers/appMessagesManager";
import appDocsManager, {MyDocument} from "../lib/appManagers/appDocsManager";
import { CancellablePromise, deferredPromise } from "../helpers/cancellablePromise";
import { isApple, isSafari } from "../helpers/userAgent";
import { MOUNT_CLASS_TO } from "../config/debug";
import appDownloadManager from "../lib/appManagers/appDownloadManager";
import simulateEvent from "../helpers/dom/dispatchEvent";
import type { SearchSuperContext } from "./appSearchSuper.";
import { copy, deepEqual } from "../helpers/object";
import { DocumentAttribute, Message, MessageMedia, PhotoSize } from "../layer";
import appPhotosManager from "../lib/appManagers/appPhotosManager";
import { isTouchSupported } from "../helpers/touchSupport";
import appAvatarsManager from "../lib/appManagers/appAvatarsManager";
import appPeersManager from "../lib/appManagers/appPeersManager";
import I18n from "../lib/langPack";
import { SearchListLoader } from "./appMediaViewer";

// TODO: если удалить сообщение, и при этом аудио будет играть - оно не остановится, и можно будет по нему перейти вникуда

// TODO: Safari: проверить стрим, включить его и сразу попробовать включить видео или другую песню
// TODO: Safari: попробовать замаскировать подгрузку последнего чанка
// TODO: Safari: пофиксить момент, когда заканчивается песня и пытаешься включить её заново - прогресс сразу в конце

export type MediaItem = {mid: number, peerId: number};

type HTMLMediaElement = HTMLAudioElement | HTMLVideoElement;

const SHOULD_USE_SAFARI_FIX = (() => {
  try {
    return isSafari && +navigator.userAgent.match(/ Version\/(\d+)/)[1] < 14;
  } catch(err) {
    return false;
  }
})();

const SEEK_OFFSET = 10;

class AppMediaPlaybackController {
  private container: HTMLElement;
  private media: {
    [peerId: string]: {
      [mid: string]: HTMLMediaElement
    }
  } = {};
  private playingMedia: HTMLMediaElement;

  private waitingMediaForLoad: {
    [peerId: string]: {
      [mid: string]: CancellablePromise<void>
    }
  } = {};
  
  public willBePlayedMedia: HTMLMediaElement;
  private searchContext: SearchSuperContext;

  private listLoader: SearchListLoader<MediaItem>;

  constructor() {
    this.container = document.createElement('div');
    //this.container.style.cssText = 'position: absolute; top: -10000px; left: -10000px;';
    this.container.style.cssText = 'display: none;';
    document.body.append(this.container);

    if(navigator.mediaSession) {
      navigator.mediaSession.setActionHandler('play', this.play);
      navigator.mediaSession.setActionHandler('pause', this.pause);
      navigator.mediaSession.setActionHandler('stop', this.stop);
      navigator.mediaSession.setActionHandler('seekbackward', (details) => {
        const media = this.playingMedia
        if(media) {
          media.currentTime = Math.max(0, media.currentTime - (details.seekOffset || SEEK_OFFSET));
        }
      });
      navigator.mediaSession.setActionHandler('seekforward', (details) => {
        const media = this.playingMedia
        if(media) {
          media.currentTime = Math.min(media.duration, media.currentTime + (details.seekOffset || SEEK_OFFSET));
        }
      });
      navigator.mediaSession.setActionHandler('seekto', (details) => {
        const media = this.playingMedia
        if(media) {
          media.currentTime = details.seekTime;
        }
      });
      navigator.mediaSession.setActionHandler('previoustrack', this.previous);
      navigator.mediaSession.setActionHandler('nexttrack', this.next);
    }
  }

  public addMedia(peerId: number, doc: MyDocument, mid: number, autoload = true): HTMLMediaElement {
    const storage = this.media[peerId] ?? (this.media[peerId] = {});
    if(storage[mid]) return storage[mid];

    const media = document.createElement(doc.type === 'round' ? 'video' : 'audio');
    //const source = document.createElement('source');
    //source.type = doc.type === 'voice' && !opusDecodeController.isPlaySupported() ? 'audio/wav' : doc.mime_type;

    if(doc.type === 'round') {
      media.setAttribute('playsinline', 'true');
      //media.muted = true;
    }

    media.dataset.peerId = '' + peerId;
    media.dataset.mid = '' + mid;
    media.dataset.type = doc.type;
    
    //media.autoplay = true;
    media.volume = 1;
    //media.append(source);

    this.container.append(media);

    media.addEventListener('play', this.onPlay);
    media.addEventListener('pause', this.onPause);
    media.addEventListener('ended', this.onEnded);
    
    /* const onError = (e: Event) => {
      //console.log('appMediaPlaybackController: video onError', e);

      if(this.nextMid === mid) {
        this.loadSiblingsMedia(peerId, doc.type as MediaType, mid).then(() => {
          if(this.nextMid && storage[this.nextMid]) {
            storage[this.nextMid].play();
          }
        });
      }
    };

    media.addEventListener('error', onError); */

    const deferred = deferredPromise<void>();
    if(autoload) {
      deferred.resolve();
    } else {
      const waitingStorage = this.waitingMediaForLoad[peerId] ?? (this.waitingMediaForLoad[peerId] = {});
      waitingStorage[mid] = deferred;
    }

    deferred.then(() => {
      //media.autoplay = true;
      //console.log('will set media url:', media, doc, doc.type, doc.url);

      ((!doc.supportsStreaming ? appDocsManager.downloadDoc(doc) : Promise.resolve()) as Promise<any>).then(() => {
        if(doc.type === 'audio' && doc.supportsStreaming && SHOULD_USE_SAFARI_FIX) {
          this.handleSafariStreamable(media);
        }
  
        // setTimeout(() => {
        const cacheContext = appDownloadManager.getCacheContext(doc);
        media.src = cacheContext.url;
        // }, doc.supportsStreaming ? 500e3 : 0);
      });
    }/* , onError */);
    
    return storage[mid] = media;
  }

  // safari подгрузит последний чанк и песня включится,
  // при этом этот чанк нельзя руками отдать из SW, потому что браузер тогда теряется
  private handleSafariStreamable(media: HTMLMediaElement) {
    media.addEventListener('play', () => {
      /* if(media.readyState === 4) { // https://developer.mozilla.org/ru/docs/Web/API/XMLHttpRequest/readyState
        return;
      } */

      //media.volume = 0;
      const currentTime = media.currentTime;
      //this.setSafariBuffering(media, true);

      media.addEventListener('progress', () => {
        media.currentTime = media.duration - 1;

        media.addEventListener('progress', () => {
          media.currentTime = currentTime;
          //media.volume = 1;
          //this.setSafariBuffering(media, false);

          if(!media.paused) {
            media.play()/* .catch(() => {}) */;
          }
        }, {once: true});
      }, {once: true});
    }/* , {once: true} */);
  }

  public resolveWaitingForLoadMedia(peerId: number, mid: number) {
    const storage = this.waitingMediaForLoad[peerId];
    if(!storage) {
      return;
    }

    const promise = storage[mid];
    if(promise) {
      promise.resolve();
      delete storage[mid];
    }
  }
  
  /**
   * Only for audio
   */
  public isSafariBuffering(media: HTMLMediaElement) {
    /// @ts-ignore
    return !!media.safariBuffering;
  }

  private setSafariBuffering(media: HTMLMediaElement, value: boolean) {
    // @ts-ignore
    media.safariBuffering = value;
  }

  private async setNewMediadata(message: Message.message) {
    const playingMedia = this.playingMedia; 
    const doc = (message.media as MessageMedia.messageMediaDocument).document as MyDocument;
    
    const artwork: MediaImage[] = [];

    const isVoice = doc.type === 'voice' || doc.type === 'round';
    let title = '', artist = '';

    if(doc.thumbs?.length) {
      const size = doc.thumbs[doc.thumbs.length - 1];
      if(!(size as PhotoSize.photoStrippedSize).bytes) {
        const cacheContext = appDownloadManager.getCacheContext(doc, size.type);

        if(cacheContext.url) {
          artwork.push({
            src: cacheContext.url,
            sizes: `${(size as PhotoSize.photoSize).w}x${(size as PhotoSize.photoSize).h}`,
            type: 'image/jpeg'
          });
        } else {
          const download = appPhotosManager.preloadPhoto(doc, size);
          download.then(() => {
            if(this.playingMedia !== playingMedia || !cacheContext.url) {
              return;
            }

            this.setNewMediadata(message);
          });
        }
      }
    } else if(isVoice) {
      const peerId = message.fromId || message.peerId;
      const peerPhoto = appPeersManager.getPeerPhoto(peerId);
      const result = appAvatarsManager.loadAvatar(peerId, peerPhoto, 'photo_small');
      if(result.cached) {
        const url = await result.loadPromise;
        artwork.push({
          src: url,
          sizes: '160x160',
          type: 'image/jpeg'
        });
      } else {
        result.loadPromise.then((url) => {
          if(this.playingMedia !== playingMedia || !url) {
            return;
          }

          this.setNewMediadata(message);
        });
      }

      title = appPeersManager.getPeerTitle(peerId, true, false);
      artist = I18n.format(doc.type === 'voice' ? 'AttachAudio' : 'AttachRound', true);
    }

    if(!isVoice) {
      const attribute = doc.attributes.find(attribute => attribute._ === 'documentAttributeAudio') as DocumentAttribute.documentAttributeAudio;
      title = attribute && attribute.title || doc.file_name;
      artist = attribute && attribute.performer;
    }

    if(!artwork.length) {
      if(isApple) {
        if(isTouchSupported) {
          artwork.push({
            src: `assets/img/apple-touch-icon-precomposed.png`,
            sizes: '180x180',
            type: 'image/png'
          });
        } else {
          artwork.push({
            src: `assets/img/apple-touch-icon.png`,
            sizes: '180x180',
            type: 'image/png'
          });
        }
      } else {
        [72, 96, 144, 192, 256, 384, 512].forEach(size => {
          const sizes = `${size}x${size}`;
          artwork.push({
            src: `assets/img/android-chrome-${sizes}.png`,
            sizes,
            type: 'image/png'
          });
        });
      }
    }

    const metadata = new MediaMetadata({
      title,
      artist,
      artwork
    });

    navigator.mediaSession.metadata = metadata;
  }

  onPlay = (e?: Event) => {
    const media = e.target as HTMLMediaElement;
    const peerId = +media.dataset.peerId;
    const mid = +media.dataset.mid;

    //console.log('appMediaPlaybackController: video playing', this.currentPeerId, this.playingMedia, media);

    const message = appMessagesManager.getMessageByPeer(peerId, mid);

    const previousMedia = this.playingMedia;
    if(previousMedia !== media) {
      this.stop();

      this.playingMedia = media;

      if('mediaSession' in navigator) {
        this.setNewMediadata(message);
      }
    }

    // audio_pause не успеет сработать без таймаута
    setTimeout(() => {
      rootScope.dispatchEvent('audio_play', {peerId, doc: message.media.document, mid});
    }, 0);
  };

  onPause = (e?: Event) => {
    /* const target = e.target as HTMLMediaElement;
    if(!isInDOM(target)) {
      this.container.append(target);
      target.play();
      return;
    } */

    rootScope.dispatchEvent('audio_pause');
  };

  onEnded = (e?: Event) => {
    if(!e.isTrusted) {
      return;
    }

    this.onPause(e);

    //console.log('on media end');

    this.next();
  };

  public toggle(play?: boolean) {
    if(!this.playingMedia) {
      return;
    }

    if(play === undefined) {
      play = this.playingMedia.paused;
    }

    if(this.playingMedia.paused !== play) {
      return;
    }

    if(play) {
      this.playingMedia.play();
    } else {
      this.playingMedia.pause();
    }
  }

  public play = () => {
    return this.toggle(true);
  };

  public pause = () => {
    return this.toggle(false);
  };

  public stop = () => {
    const media = this.playingMedia;
    if(media) {
      if(!media.paused) {
        media.pause();
      }

      media.currentTime = 0;
      simulateEvent(media, 'ended');

      // this.playingMedia = undefined;
    }
  };

  public playItem = (item: MediaItem) => {
    const {peerId, mid} = item;
    const media = this.media[peerId][mid];

    /* if(isSafari) {
      media.autoplay = true;
    } */

    this.resolveWaitingForLoadMedia(peerId, mid);

    setTimeout(() => {
      media.play()//.catch(() => {});
    }, 0);
  };

  public next = () => {
    this.listLoader.go(1);
  };

  public previous = () => {
    const media = this.playingMedia;
    if(media && media.currentTime > 5) {
      media.currentTime = 0;
      this.toggle(true);
      return;
    }

    this.listLoader.go(-1);
  };

  public willBePlayed(media: HTMLMediaElement) {
    this.willBePlayedMedia = media;
  }

  public setSearchContext(context: SearchSuperContext) {
    if(deepEqual(this.searchContext, context)) {
      return false;
    }

    this.searchContext = copy(context); // {_: type === 'audio' ? 'inputMessagesFilterMusic' : 'inputMessagesFilterRoundVoice'}
    return true;
  }

  public setTargets(current: MediaItem, prev?: MediaItem[], next?: MediaItem[]) {
    if(!this.listLoader) {
      this.listLoader = new SearchListLoader({
        loadCount: 10,
        loadWhenLeft: 5,
        processItem: (item: Message.message) => {
          const {peerId, mid} = item;
          this.addMedia(peerId, (item.media as MessageMedia.messageMediaDocument).document as MyDocument, mid, false);
          return {peerId, mid};
        },
        onJump: (item, older) => {
          this.playItem(item);
        }
      });
    } else {
      this.listLoader.reset();
    }

    const reverse = this.searchContext.folderId !== undefined ? false : true;
    if(prev) {
      this.listLoader.setTargets(prev, next, reverse);
    } else {
      this.listLoader.reverse = reverse;
    }

    this.listLoader.setSearchContext(this.searchContext);
    this.listLoader.current = current;

    this.listLoader.load(true);
    this.listLoader.load(false);
  }
}

const appMediaPlaybackController = new AppMediaPlaybackController();
MOUNT_CLASS_TO.appMediaPlaybackController = appMediaPlaybackController;
export default appMediaPlaybackController;
