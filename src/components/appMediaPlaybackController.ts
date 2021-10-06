/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import rootScope from "../lib/rootScope";
import appMessagesManager from "../lib/appManagers/appMessagesManager";
import appDocsManager, {MyDocument} from "../lib/appManagers/appDocsManager";
import { CancellablePromise, deferredPromise } from "../helpers/cancellablePromise";
import { IS_APPLE, IS_SAFARI } from "../environment/userAgent";
import { MOUNT_CLASS_TO } from "../config/debug";
import appDownloadManager from "../lib/appManagers/appDownloadManager";
import simulateEvent from "../helpers/dom/dispatchEvent";
import type { SearchSuperContext } from "./appSearchSuper.";
import { copy, deepEqual } from "../helpers/object";
import { DocumentAttribute, Message, MessageMedia, PhotoSize } from "../layer";
import appPhotosManager from "../lib/appManagers/appPhotosManager";
import { IS_TOUCH_SUPPORTED } from "../environment/touchSupport";
import appAvatarsManager from "../lib/appManagers/appAvatarsManager";
import appPeersManager from "../lib/appManagers/appPeersManager";
import I18n from "../lib/langPack";
import SearchListLoader from "../helpers/searchListLoader";
import { onMediaLoad } from "../helpers/files";

// TODO: Safari: проверить стрим, включить его и сразу попробовать включить видео или другую песню
// TODO: Safari: попробовать замаскировать подгрузку последнего чанка
// TODO: Safari: пофиксить момент, когда заканчивается песня и пытаешься включить её заново - прогресс сразу в конце

export type MediaItem = {mid: number, peerId: number};

type HTMLMediaElement = HTMLAudioElement | HTMLVideoElement;

const SHOULD_USE_SAFARI_FIX = (() => {
  try {
    return IS_SAFARI && +navigator.userAgent.match(/ Version\/(\d+)/)[1] < 14;
  } catch(err) {
    return false;
  }
})();

const SEEK_OFFSET = 10;

export type MediaSearchContext = SearchSuperContext & Partial<{
  isScheduled: boolean,
  useSearch: boolean
}>;

type MediaDetails = {
  peerId: number, 
  mid: number, 
  docId: string, 
  clean?: boolean,
  isScheduled?: boolean, 
  isSingle?: boolean
};

class AppMediaPlaybackController {
  private container: HTMLElement;
  private media: Map<number, Map<number, HTMLMediaElement>> = new Map();
  private scheduled: AppMediaPlaybackController['media'] = new Map();
  private mediaDetails: Map<HTMLMediaElement, MediaDetails> = new Map();
  private playingMedia: HTMLMediaElement;

  private waitingMediaForLoad: Map<number, Map<number, CancellablePromise<void>>> = new Map();
  private waitingScheduledMediaForLoad: AppMediaPlaybackController['waitingMediaForLoad'] = new Map();
  private waitingDocumentsForLoad: {[docId: string]: Set<HTMLMediaElement>} = {};
  
  public willBePlayedMedia: HTMLMediaElement;
  private searchContext: MediaSearchContext;

  private listLoader: SearchListLoader<MediaItem>;

  public volume: number;
  public muted: boolean;
  public playbackRate: number;
  private _volume = 1;
  private _muted = false;
  private _playbackRate = 1;
  private lockedSwitchers: boolean;

  constructor() {
    this.container = document.createElement('div');
    //this.container.style.cssText = 'position: absolute; top: -10000px; left: -10000px;';
    this.container.style.cssText = 'display: none;';
    document.body.append(this.container);

    if(navigator.mediaSession) {
      const actions: {[action in MediaSessionAction]?: MediaSessionActionHandler} = {
        play: this.play,
        pause: this.pause,
        stop: this.stop,
        seekbackward: this.seekBackward,
        seekforward: this.seekForward,
        seekto: this.seekTo,
        previoustrack: this.previous,
        nexttrack: this.next
      };

      for(const action in actions) {
        try {
          navigator.mediaSession.setActionHandler(action as MediaSessionAction, actions[action as MediaSessionAction]);
        } catch(err) {
          console.warn('MediaSession action is not supported:', action);
        }
      }
    }

    rootScope.addEventListener('document_downloaded', (doc) => {
      const set = this.waitingDocumentsForLoad[doc.id];
      if(set) {
        for(const media of set) {
          this.onMediaDocumentLoad(media);
        }
      }
    });

    const properties: {[key: PropertyKey]: PropertyDescriptor} = {};
    const keys = [
      'volume' as const, 
      'muted' as const, 
      'playbackRate' as const
    ];
    keys.forEach(key => {
      const _key = ('_' + key) as `_${typeof key}`;
      properties[key] = {
        get: () => this[_key],
        set: (value: number | boolean) => {
          if(this[_key] === value) {
            return;
          }

          // @ts-ignore
          this[_key] = value;
          if(this.playingMedia) {
            // @ts-ignore
            this.playingMedia[key] = value;
          }

          this.dispatchPlaybackParams();
        }
      };
    });
    Object.defineProperties(this, properties);
  }

  private dispatchPlaybackParams() {
    const {volume, muted, playbackRate} = this;
    rootScope.dispatchEvent('media_playback_params', {
      volume, muted, playbackRate
    });
  }

  public seekBackward = (details: MediaSessionActionDetails) => {
    const media = this.playingMedia;
    if(media) {
      media.currentTime = Math.max(0, media.currentTime - (details.seekOffset || SEEK_OFFSET));
    }
  };

  public seekForward = (details: MediaSessionActionDetails) => {
    const media = this.playingMedia;
    if(media) {
      media.currentTime = Math.min(media.duration, media.currentTime + (details.seekOffset || SEEK_OFFSET));
    }
  };

  public seekTo = (details: MediaSessionActionDetails) => {
    const media = this.playingMedia;
    if(media) {
      media.currentTime = details.seekTime;
    }
  };

  public addMedia(message: Message.message, autoload: boolean, clean?: boolean): HTMLMediaElement {
    const {peerId, mid} = message;

    const isScheduled = !!message.pFlags.is_scheduled;
    const s = isScheduled ? this.scheduled : this.media;
    let storage = s.get(message.peerId);
    if(!storage) {
      s.set(message.peerId, storage = new Map());
    }

    let media = storage.get(mid);
    if(media) {
      return media;
    }

    const doc: MyDocument = appMessagesManager.getMediaFromMessage(message);
    storage.set(mid, media = document.createElement(doc.type === 'round' || doc.type === 'video' ? 'video' : 'audio'));
    //const source = document.createElement('source');
    //source.type = doc.type === 'voice' && !opusDecodeController.isPlaySupported() ? 'audio/wav' : doc.mime_type;

    if(doc.type === 'round') {
      media.setAttribute('playsinline', 'true');
      //media.muted = true;
    }

    const details: MediaDetails = {
      peerId,
      mid,
      docId: doc.id,
      clean,
      isScheduled: message.pFlags.is_scheduled
    };

    this.mediaDetails.set(media, details);

    //media.autoplay = true;
    media.volume = 1;
    //media.append(source);

    this.container.append(media);

    media.addEventListener('play', this.onPlay);
    media.addEventListener('pause', this.onPause);
    media.addEventListener('ended', this.onEnded);

    if(doc.type !== 'audio' && message?.pFlags.media_unread && message.fromId !== rootScope.myId) {
      media.addEventListener('timeupdate', () => {
        appMessagesManager.readMessages(peerId, [mid]);
      }, {once: true});
    }
    
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
      const w = message.pFlags.is_scheduled ? this.waitingScheduledMediaForLoad : this.waitingMediaForLoad;
      let waitingStorage = w.get(peerId);
      if(!waitingStorage) {
        w.set(peerId, waitingStorage = new Map());
      }

      waitingStorage.set(mid, deferred);
    }

    deferred.then(() => {
      //media.autoplay = true;
      //console.log('will set media url:', media, doc, doc.type, doc.url);

      const cacheContext = appDownloadManager.getCacheContext(doc);
      if(doc.supportsStreaming || cacheContext.url) {
        this.onMediaDocumentLoad(media);
      } else {
        let set = this.waitingDocumentsForLoad[doc.id];
        if(!set) {
          set = this.waitingDocumentsForLoad[doc.id] = new Set();
        }

        set.add(media);
        appDocsManager.downloadDoc(doc);
      }
    }/* , onError */);
    
    return media;
  }

  public getMedia(peerId: number, mid: number, isScheduled?: boolean) {
    const s = (isScheduled ? this.scheduled : this.media).get(peerId);
    return s?.get(mid);
  }

  private onMediaDocumentLoad = (media: HTMLMediaElement) => {
    const details = this.mediaDetails.get(media);
    const doc = appDocsManager.getDoc(details.docId);
    if(doc.type === 'audio' && doc.supportsStreaming && SHOULD_USE_SAFARI_FIX) {
      this.handleSafariStreamable(media);
    }

    // setTimeout(() => {
    const cacheContext = appDownloadManager.getCacheContext(doc);
    media.src = cacheContext.url;
    // }, doc.supportsStreaming ? 500e3 : 0);

    const set = this.waitingDocumentsForLoad[doc.id];
    if(set) {
      set.delete(media);

      if(!set.size) {
        delete this.waitingDocumentsForLoad[doc.id];
      }
    }
  };

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

  public resolveWaitingForLoadMedia(peerId: number, mid: number, isScheduled?: boolean) {
    const w = isScheduled ? this.waitingScheduledMediaForLoad : this.waitingMediaForLoad;
    const storage = w.get(peerId);
    if(!storage) {
      return;
    }

    const promise = storage.get(mid);
    if(promise) {
      promise.resolve();
      storage.delete(mid);

      if(!storage.size) {
        w.delete(peerId);
      }
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

  private async setNewMediadata(message: Message.message, playingMedia = this.playingMedia) {
    await onMediaLoad(playingMedia, undefined, false); // have to wait for load, otherwise on macOS won't set

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
      if(peerPhoto) {
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
      if(IS_APPLE) {
        if(IS_TOUCH_SUPPORTED) {
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

  private getMessageByMedia(media: HTMLMediaElement) {
    const details = this.mediaDetails.get(media);
    const {peerId, mid} = details;
    const message = details.isScheduled ? appMessagesManager.getScheduledMessageByPeer(peerId, mid) : appMessagesManager.getMessageByPeer(peerId, mid);
    return message;
  }

  private onPlay = (e?: Event) => {
    const media = e.target as HTMLMediaElement;
    const details = this.mediaDetails.get(media);
    const {peerId, mid} = details;

    //console.log('appMediaPlaybackController: video playing', this.currentPeerId, this.playingMedia, media);

    const message = this.getMessageByMedia(media);

    const previousMedia = this.playingMedia;
    if(previousMedia !== media) {
      this.stop();

      const verify = (element: MediaItem) => element.mid === mid && element.peerId === peerId;
      if(!this.listLoader.current || !verify(this.listLoader.current)) {
        let idx = this.listLoader.previous.findIndex(verify);
        let jumpLength: number;
        if(idx !== -1) {
          jumpLength = -(this.listLoader.previous.length - idx);
        } else {
          idx = this.listLoader.next.findIndex(verify);
          if(idx !== -1) {
            jumpLength = idx + 1;
          }
        }
  
        if(idx !== -1) {
          if(jumpLength) {
            this.listLoader.go(jumpLength, false);
          }
        } else {
          this.setTargets({peerId, mid});
        }
      }

      this.setMedia(media, message);
    }

    // audio_pause не успеет сработать без таймаута
    setTimeout(() => {
      rootScope.dispatchEvent('media_play', {doc: appMessagesManager.getMediaFromMessage(message), message, media});
    }, 0);
  };

  private onPause = (e?: Event) => {
    /* const target = e.target as HTMLMediaElement;
    if(!isInDOM(target)) {
      this.container.append(target);
      target.play();
      return;
    } */

    rootScope.dispatchEvent('media_pause');
  };

  private onEnded = (e?: Event) => {
    if(!e.isTrusted) {
      return;
    }

    this.onPause(e);

    //console.log('on media end');

    this.next();
  };

  public toggle(play?: boolean) {
    if(!this.playingMedia) {
      return false;
    }

    if(play === undefined) {
      play = this.playingMedia.paused;
    }

    if(this.playingMedia.paused !== play) {
      return false;
    }

    if(play) {
      this.playingMedia.play();
    } else {
      this.playingMedia.pause();
    }

    return true;
  }

  public play = () => {
    return this.toggle(true);
  };

  public pause = () => {
    return this.toggle(false);
  };

  public stop = () => {
    const media = this.playingMedia;
    if(!media) {
      return false;
    }

    if(!media.paused) {
      media.pause();
    }

    media.currentTime = 0;
    simulateEvent(media, 'ended');

    const details = this.mediaDetails.get(media);
    if(details?.clean) {
      media.src = '';
      const peerId = details.peerId;
      const s = details.isScheduled ? this.scheduled : this.media;
      const storage = s.get(peerId);
      if(storage) {
        storage.delete(details.mid);
  
        if(!storage.size) {
          s.delete(peerId);
        }
      }
  
      media.remove();

      this.mediaDetails.delete(media);
    }

    this.playingMedia = undefined;

    return true;
  };

  public playItem = (item: MediaItem) => {
    const {peerId, mid} = item;
    const isScheduled = this.searchContext.isScheduled;
    const media = this.getMedia(peerId, mid, isScheduled);

    /* if(isSafari) {
      media.autoplay = true;
    } */

    media.play();
    
    setTimeout(() => {
      this.resolveWaitingForLoadMedia(peerId, mid, isScheduled);
    }, 0);
  };

  public next = () => {
    return !this.lockedSwitchers && this.listLoader.go(1);
  };

  public previous = () => {
    const media = this.playingMedia;
    if(media && media.currentTime > 5) {
      media.currentTime = 0;
      this.toggle(true);
      return;
    }

    return !this.lockedSwitchers && this.listLoader.go(-1);
  };

  public willBePlayed(media: HTMLMediaElement) {
    this.willBePlayedMedia = media;
  }

  public setSearchContext(context: MediaSearchContext) {
    if(deepEqual(this.searchContext, context)) {
      return false;
    }

    this.searchContext = copy(context); // {_: type === 'audio' ? 'inputMessagesFilterMusic' : 'inputMessagesFilterRoundVoice'}
    return true;
  }

  public getSearchContext() {
    return this.searchContext;
  }

  public setTargets(current: MediaItem, prev?: MediaItem[], next?: MediaItem[]) {
    if(!this.listLoader) {
      this.listLoader = new SearchListLoader({
        loadCount: 10,
        loadWhenLeft: 5,
        processItem: (message: Message.message) => {
          this.addMedia(message, false);
          return {peerId: message.peerId, mid: message.mid};
        },
        onJump: (item, older) => {
          this.playItem(item);
        }
      });

      this.listLoader.onEmptied = this.stop;
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

  public setMedia(media: HTMLMediaElement, message: Message.message) {
    this.playingMedia = media;
    this.playingMedia.volume = this.volume;
    this.playingMedia.muted = this.muted;
    this.playingMedia.playbackRate = this.playbackRate;

    if('mediaSession' in navigator) {
      this.setNewMediadata(message);
    }
  }

  public setSingleMedia(media: HTMLMediaElement, message: Message.message) {
    const playingMedia = this.playingMedia;

    const wasPlaying = this.pause();

    this.willBePlayed(undefined);
    this.setMedia(media, message);
    this.toggleSwitchers(false);

    return () => {
      this.toggleSwitchers(true);

      if(playingMedia) {
        if(this.mediaDetails.get(playingMedia)) {
          this.setMedia(playingMedia, this.getMessageByMedia(playingMedia));
        } else {
          this.next() || this.previous();
        }
      }

      if(this.playingMedia === media) {
        this.stop();
      }

      if(wasPlaying) {
        this.play();
      }
    };
  }

  public toggleSwitchers(enabled: boolean) {
    this.lockedSwitchers = !enabled;
  }
}

const appMediaPlaybackController = new AppMediaPlaybackController();
MOUNT_CLASS_TO.appMediaPlaybackController = appMediaPlaybackController;
export default appMediaPlaybackController;
