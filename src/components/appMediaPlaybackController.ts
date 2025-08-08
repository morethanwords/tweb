/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import type {MyDocument} from '../lib/appManagers/appDocsManager';
import type {SearchSuperContext} from './appSearchSuper.';
import rootScope from '../lib/rootScope';
import deferredPromise, {CancellablePromise} from '../helpers/cancellablePromise';
import {IS_APPLE, IS_SAFARI} from '../environment/userAgent';
import {MOUNT_CLASS_TO} from '../config/debug';
import simulateEvent from '../helpers/dom/dispatchEvent';
import {Document, DocumentAttribute, Message, PhotoSize} from '../layer';
import IS_TOUCH_SUPPORTED from '../environment/touchSupport';
import I18n from '../lib/langPack';
import SearchListLoader from '../helpers/searchListLoader';
import copy from '../helpers/object/copy';
import deepEqual from '../helpers/object/deepEqual';
import ListenerSetter from '../helpers/listenerSetter';
import {AppManagers} from '../lib/appManagers/managers';
import getMediaFromMessage from '../lib/appManagers/utils/messages/getMediaFromMessage';
import getPeerTitle from './wrappers/getPeerTitle';
import appDownloadManager from '../lib/appManagers/appDownloadManager';
import onMediaLoad from '../helpers/onMediaLoad';
import EventListenerBase from '../helpers/eventListenerBase';
import animationIntersector from './animationIntersector';
import apiManagerProxy from '../lib/mtproto/mtprotoworker';
import setCurrentTime from '../helpers/dom/setCurrentTime';

// TODO: Safari: проверить стрим, включить его и сразу попробовать включить видео или другую песню
// TODO: Safari: попробовать замаскировать подгрузку последнего чанка
// TODO: Safari: пофиксить момент, когда заканчивается песня и пытаешься включить её заново - прогресс сразу в конце

export type MediaItem = {mid: number, peerId: PeerId};

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
  skipSensitive: boolean,
  useSearch: boolean
}>;

type MediaDetails = {
  peerId: PeerId,
  mid: number,
  docId: DocId,
  doc: MyDocument,
  message: Message.message,
  clean?: boolean,
  isScheduled?: boolean,
  isSingle?: boolean
};

export type PlaybackMediaType = 'voice' | 'video' | 'audio';

export class AppMediaPlaybackController extends EventListenerBase<{
  play: (details: ReturnType<AppMediaPlaybackController['getPlayingDetails']>) => void,
  singleMedia: (media: HTMLMediaElement) => void,
  pause: () => void,
  playbackParams: (params: ReturnType<AppMediaPlaybackController['getPlaybackParams']>) => void,
  stop: () => void,
  toggleVideoAutoplaySound: (value: boolean) => void
}> {
  private container: HTMLElement;
  private media: Map<PeerId, Map<number, HTMLMediaElement>> = new Map();
  private scheduled: AppMediaPlaybackController['media'] = new Map();
  private mediaDetails: Map<HTMLMediaElement, MediaDetails> = new Map();
  private playingMedia: HTMLMediaElement;
  private playingMediaType: PlaybackMediaType;

  private waitingMediaForLoad: Map<PeerId, Map<number, CancellablePromise<void>>> = new Map();
  private waitingScheduledMediaForLoad: AppMediaPlaybackController['waitingMediaForLoad'] = new Map();
  private waitingDocumentsForLoad: {[docId: string]: Set<HTMLMediaElement>} = {};

  public willBePlayedMedia: HTMLMediaElement;
  private searchContext: MediaSearchContext;

  private listLoader: SearchListLoader<MediaItem>;

  public volume: number;
  public muted: boolean;
  public playbackRate: number;
  public loop: boolean;
  public round: boolean;
  private _volume: number;
  private _muted: boolean;
  private _playbackRate: number;
  private _loop: boolean;
  private _round: boolean;
  private lockedSwitchers: boolean;
  private playbackRates: Record<PlaybackMediaType, number> = {
    voice: 1,
    video: 1,
    audio: 1
  };

  private pip: HTMLVideoElement;
  private managers: AppManagers;
  private skipMediaPlayEvent: boolean;

  construct(managers: AppManagers) {
    this.managers = managers;
    this.container = document.createElement('div');
    // this.container.style.cssText = 'position: absolute; top: -10000px; left: -10000px;';
    this.container.style.cssText = 'display: none;';
    document.body.append(this.container);

    if(navigator.mediaSession) {
      const actions: {[action in MediaSessionAction]?: MediaSessionActionHandler} = {
        play: this.browserPlay,
        pause: this.browserPause,
        stop: this.browserStop,
        seekbackward: this.browserSeekBackward,
        seekforward: this.browserSeekForward,
        seekto: this.browserSeekTo,
        previoustrack: this.browserPrevious,
        nexttrack: this.browserNext
      };

      for(const action in actions) {
        try {
          navigator.mediaSession.setActionHandler(action as MediaSessionAction, actions[action as MediaSessionAction]);
        } catch(err) {
          console.warn('MediaSession action is not supported:', action);
        }
      }
    }

    rootScope.addEventListener('document_downloaded', (docId) => {
      const set = this.waitingDocumentsForLoad[docId];
      if(set) {
        for(const media of set) {
          this.onMediaDocumentLoad(media);
        }
      }
    });

    rootScope.addEventListener('media_play', () => {
      if(this.skipMediaPlayEvent) {
        this.skipMediaPlayEvent = false;
        return;
      }

      if(!this.pause() && this.pip) {
        this.pip.pause();
      }
    });

    const properties: {[key: PropertyKey]: PropertyDescriptor} = {};
    const keys = [
      'volume' as const,
      'muted' as const,
      'playbackRate' as const,
      'loop' as const,
      'round' as const
    ];
    keys.forEach((key) => {
      const _key = ('_' + key) as `_${typeof key}`;
      properties[key] = {
        get: () => this[_key],
        set: (value: number | boolean) => {
          if(this[_key] === value) {
            return;
          }

          // @ts-ignore
          this[_key] = value;
          if(this.playingMedia && (key !== 'loop' || this.playingMediaType === 'audio') && key !== 'round') {
            // @ts-ignore
            this.playingMedia[key] = value;
          }

          if(key === 'playbackRate' && this.playingMediaType !== undefined) {
            this.playbackRates[this.playingMediaType] = value as number;
          }

          this.dispatchPlaybackParams();
        }
      };
    });
    Object.defineProperties(this, properties);

    this.addEventListener('play', ({doc}) => {
      if(doc.type === 'round') {
        animationIntersector.toggleMediaPause(false);
      }
    });

    this.addEventListener('pause', () => {
      animationIntersector.toggleMediaPause(true);
    });
  }

  private dispatchPlaybackParams() {
    this.dispatchEvent('playbackParams', this.getPlaybackParams());
  }

  public getPlaybackParams() {
    const {volume, muted, playbackRate, playbackRates, loop, round} = this;
    return {
      volume,
      muted,
      playbackRate,
      playbackRates,
      loop,
      round
    };
  }

  public setPlaybackParams(params: ReturnType<AppMediaPlaybackController['getPlaybackParams']>) {
    this.playbackRates = params.playbackRates;
    this._volume = params.volume;
    this._muted = params.muted;
    this._playbackRate = params.playbackRate;
    this._loop = params.loop;
    this._round = params.round;
  }

  public seekBackward = (details: MediaSessionActionDetails, media = this.playingMedia) => {
    if(media) {
      setCurrentTime(media, Math.max(0, media.currentTime - (details.seekOffset || SEEK_OFFSET)));
    }
  };

  public seekForward = (details: MediaSessionActionDetails, media = this.playingMedia) => {
    if(media) {
      setCurrentTime(media, Math.min(media.duration, media.currentTime + (details.seekOffset || SEEK_OFFSET)));
    }
  };

  public seekTo = (details: MediaSessionActionDetails, media = this.playingMedia) => {
    if(media) {
      setCurrentTime(media, details.seekTime);
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

    const doc = getMediaFromMessage(message, true) as Document.document;
    storage.set(mid, media = document.createElement(doc.type === 'round' || doc.type === 'video' ? 'video' : 'audio'));
    // const source = document.createElement('source');
    // source.type = doc.type === 'voice' && !opusDecodeController.isPlaySupported() ? 'audio/wav' : doc.mime_type;

    if(doc.type === 'round') {
      media.setAttribute('playsinline', 'true');
      // media.muted = true;
    }

    const details: MediaDetails = {
      peerId,
      mid,
      docId: doc.id,
      doc,
      message,
      clean,
      isScheduled: message.pFlags.is_scheduled
    };

    this.mediaDetails.set(media, details);

    // media.autoplay = true;
    media.volume = 1;
    // media.append(source);

    this.container.append(media);

    media.addEventListener('play', this.onPlay);
    media.addEventListener('pause', this.onPause);
    media.addEventListener('ended', this.onEnded);

    if(doc.type !== 'audio' && message?.pFlags.media_unread && message.fromId !== rootScope.myId) {
      media.addEventListener('timeupdate', () => {
        this.managers.appMessagesManager.readMessages(peerId, [mid]);
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
      // media.autoplay = true;
      // console.log('will set media url:', media, doc, doc.type, doc.url);

      if(doc.supportsStreaming || (apiManagerProxy.getCacheContext(doc)).url) {
        this.onMediaDocumentLoad(media);
      } else {
        let set = this.waitingDocumentsForLoad[doc.id];
        if(!set) {
          set = this.waitingDocumentsForLoad[doc.id] = new Set();
        }

        set.add(media);
        appDownloadManager.downloadMediaURL({media: doc});
      }
    }/* , onError */);

    return media;
  }

  public getMedia(peerId: PeerId, mid: number, isScheduled?: boolean) {
    const s = (isScheduled ? this.scheduled : this.media).get(peerId);
    return s?.get(mid);
  }

  private onMediaDocumentLoad = async(media: HTMLMediaElement) => {
    const details = this.mediaDetails.get(media);
    const doc = await this.managers.appDocsManager.getDoc(details.docId);
    if(doc.type === 'audio' && doc.supportsStreaming && SHOULD_USE_SAFARI_FIX) {
      this.handleSafariStreamable(media);
    }

    // setTimeout(() => {
    const cacheContext = apiManagerProxy.getCacheContext(doc);
    media.src = cacheContext.url;

    if(this.playingMedia === media) {
      media.playbackRate = this.playbackRate;

      if(doc.type === 'audio') {
        media.loop = this.loop;
      }
    }
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

      // media.volume = 0;
      const currentTime = media.currentTime;
      // this.setSafariBuffering(media, true);

      media.addEventListener('progress', () => {
        setCurrentTime(media, media.duration - 1);

        media.addEventListener('progress', () => {
          setCurrentTime(media, currentTime);
          // media.volume = 1;
          // this.setSafariBuffering(media, false);

          if(!media.paused) {
            media.play()/* .catch(() => {}) */;
          }
        }, {once: true});
      }, {once: true});
    }/* , {once: true} */);
  }

  public resolveWaitingForLoadMedia(peerId: PeerId, mid: number, isScheduled?: boolean) {
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
    // @ts-ignore
    return !!media.safariBuffering;
  }

  private setSafariBuffering(media: HTMLMediaElement, value: boolean) {
    // @ts-ignore
    media.safariBuffering = value;
  }

  private async setNewMediadata(message: Message.message, playingMedia = this.playingMedia) {
    if(document.pictureInPictureElement) {
      return;
    }

    await onMediaLoad(playingMedia, undefined, false); // have to wait for load, otherwise on macOS won't set

    const doc = getMediaFromMessage(message, true) as MyDocument;
    if(!doc) return; // live

    const artwork: MediaImage[] = [];

    const isVoice = doc.type === 'voice' || doc.type === 'round';
    let title = '', artist = '';

    if(doc.thumbs?.length) {
      const size = doc.thumbs[doc.thumbs.length - 1];
      if(!(size as PhotoSize.photoStrippedSize).bytes) {
        const cacheContext = apiManagerProxy.getCacheContext(doc, size.type);

        if(cacheContext.url) {
          artwork.push({
            src: cacheContext.url,
            sizes: `${(size as PhotoSize.photoSize).w}x${(size as PhotoSize.photoSize).h}`,
            type: 'image/jpeg'
          });
        } else {
          const download = appDownloadManager.downloadMediaURL({media: doc, thumb: size});
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
      const peerPhoto = await this.managers.appPeersManager.getPeerPhoto(peerId);
      if(peerPhoto) {
        // const result = this.managers.appAvatarsManager.loadAvatar(peerId, peerPhoto, 'photo_small');
        // if(result.cached) {
        //   const url = await result.loadPromise;
        //   artwork.push({
        //     src: url,
        //     sizes: '160x160',
        //     type: 'image/jpeg'
        //   });
        // } else {
        //   result.loadPromise.then((url) => {
        //     if(this.playingMedia !== playingMedia || !url) {
        //       return;
        //     }

        //     this.setNewMediadata(message);
        //   });
        // }
      }

      title = await getPeerTitle({peerId, plainText: true, onlyFirstName: false});
      artist = I18n.format(doc.type === 'voice' ? 'AttachAudio' : 'AttachRound', true);
    }

    if(!isVoice) {
      const attribute = doc.attributes.find((attribute) => attribute._ === 'documentAttributeAudio') as DocumentAttribute.documentAttributeAudio;
      title = attribute?.title ?? doc.file_name;
      artist = attribute?.performer;
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
        [72, 96, 144, 192, 256, 384, 512].forEach((size) => {
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

  public setCurrentMediadata() {
    const {playingMedia} = this;
    if(!playingMedia) return;
    const message = this.getMessageByMedia(playingMedia);
    this.setNewMediadata(message, playingMedia);
  }

  private getMessageByMedia(media: HTMLMediaElement): Message.message {
    const details = this.mediaDetails.get(media);
    return details?.message;
    // const {peerId, mid} = details;
    // const message = details.isScheduled ?
    //   this.managers.appMessagesManager.getScheduledMessageByPeer(peerId, mid) :
    //   this.managers.appMessagesManager.getMessageByPeer(peerId, mid);
    // return message;
  }

  public getPlayingDetails() {
    const {playingMedia} = this;
    if(!playingMedia) {
      return;
    }

    const message = this.getMessageByMedia(playingMedia);
    if(!message) {
      return;
    }

    return {
      doc: getMediaFromMessage(message, true) as MyDocument,
      message,
      media: playingMedia,
      playbackParams: this.getPlaybackParams()
    };
  }

  private onPlay = (e?: Event) => {
    const media = e.target as HTMLMediaElement;
    const details = this.mediaDetails.get(media);
    const {peerId, mid} = details;

    // console.log('appMediaPlaybackController: video playing', this.currentPeerId, this.playingMedia, media);

    const pip = this.pip;
    if(pip) {
      pip.pause();
    }

    const message = this.getMessageByMedia(media);

    const previousMedia = this.playingMedia;
    if(previousMedia !== media) {
      this.stop();
      this.setMedia(media, message);

      const verify = (element: MediaItem) => element.mid === mid && element.peerId === peerId;
      const listLoader = this.listLoader;
      const current = listLoader.getCurrent();
      if(!current || !verify(current)) {
        let jumpLength: number;

        for(const withOtherSide of [false, true]) {
          const previous = listLoader.getPrevious(withOtherSide);

          let idx = previous.findIndex(verify);
          if(idx !== -1) {
            jumpLength = -(previous.length - idx);
          } else {
            const next = listLoader.getNext(withOtherSide);
            idx = next.findIndex(verify);
            if(idx !== -1) {
              jumpLength = idx + 1;
            }
          }

          if(jumpLength !== undefined) {
            break;
          }
        }

        if(jumpLength) {
          this.go(jumpLength, false);
        } else {
          this.setTargets({peerId, mid});
        }
      }
    }

    // audio_pause не успеет сработать без таймаута
    setTimeout(() => {
      if(this.playingMedia !== media) {
        return;
      }

      this.dispatchEvent('play', this.getPlayingDetails());
      this.pauseMediaInOtherTabs();
    }, 0);
  };

  private onPause = (e?: Event) => {
    /* const target = e.target as HTMLMediaElement;
    if(!isInDOM(target)) {
      this.container.append(target);
      target.play();
      return;
    } */

    // if(this.pip) {
    //   this.pip.play();
    // }

    this.dispatchEvent('pause');
  };

  private onEnded = (e?: Event) => {
    if(e && !e.isTrusted) {
      return;
    }

    this.onPause(e);

    // console.log('on media end');

    const listLoader = this.listLoader;
    if(
      this.lockedSwitchers ||
      (!this.round && listLoader.current && !listLoader.next.length) ||
      !listLoader.getNext(true).length ||
      !this.next()
    ) {
      this.stop();
      this.dispatchEvent('stop');
    }
  };

  public pauseMediaInOtherTabs() {
    this.skipMediaPlayEvent = true;
    rootScope.dispatchEvent('media_play');
  }

  // public get pip() {
  //   return document.pictureInPictureElement as HTMLVideoElement;
  // }

  public toggle(play?: boolean, media = this.playingMedia) {
    if(!media) {
      return false;
    }

    if(play === undefined) {
      play = media.paused;
    }

    if(media.paused !== play) {
      return false;
    }

    if(play) {
      media.play();
    } else {
      media.pause();
    }

    return true;
  }

  public getPlayingMedia() {
    return this.playingMedia;
  }

  public play = () => {
    return this.toggle(true);
  };

  public pause = () => {
    return this.toggle(false);
  };

  public stop = (media = this.playingMedia, force?: boolean) => {
    if(!media) {
      return false;
    }

    if(!media.paused) {
      media.pause();
    }

    setCurrentTime(media, 0);
    simulateEvent(media, 'ended'); // ! important, will be used to hide controls for audio element

    if(media === this.playingMedia) {
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
      this.playingMediaType = undefined;
    }

    if(force) {
      this.dispatchEvent('stop');
    }

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

  public go = (length: number, dispatchJump?: boolean) => {
    const listLoader = this.listLoader;
    if(this.lockedSwitchers || !listLoader) {
      return;
    }

    if(this.playingMediaType === 'audio') {
      return listLoader.goRound(length, dispatchJump);
    } else {
      return listLoader.go(length, dispatchJump);
    }
  };

  private bindBrowserCallback(cb: (video: HTMLVideoElement, details: MediaSessionActionDetails) => void) {
    const handler: MediaSessionActionHandler = (details) => {
      cb(this.pip, details);
    };

    return handler;
  }

  public browserPlay = this.bindBrowserCallback((video) => this.toggle(true, video));
  public browserPause = this.bindBrowserCallback((video) => this.toggle(false, video));
  public browserStop = this.bindBrowserCallback((video) => this.stop(video));
  public browserSeekBackward = this.bindBrowserCallback((video, details) => this.seekBackward(details, video));
  public browserSeekForward = this.bindBrowserCallback((video, details) => this.seekForward(details, video));
  public browserSeekTo = this.bindBrowserCallback((video, details) => this.seekTo(details, video));
  public browserNext = this.bindBrowserCallback((video) => video || this.next());
  public browserPrevious = this.bindBrowserCallback((video) => video ? this.seekToStart(video) : this.previous());

  public next = () => {
    return this.go(1);
  };

  public previous = () => {
    if(this.seekToStart(this.playingMedia)) {
      return;
    }

    return this.go(-1);
  };

  public seekToStart(media: HTMLMediaElement) {
    if(media?.currentTime > 5) {
      setCurrentTime(media, 0);
      this.toggle(true, media);
      return true;
    }

    return false;
  }

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
    let listLoader = this.listLoader;
    if(!listLoader) {
      listLoader = this.listLoader = new SearchListLoader({
        loadCount: 10,
        loadWhenLeft: 5,
        processItem: (message: Message.message) => {
          this.addMedia(message, false);
          return {peerId: message.peerId, mid: message.mid};
        },
        onJump: (item, older) => {
          this.playItem(item);
        },
        onEmptied: () => {
          this.dispatchEvent('stop');
          this.stop();
        }
      });
    } else {
      listLoader.reset();
    }

    const reverse = this.searchContext.folderId !== undefined ? false : true;
    if(prev) {
      listLoader.setTargets(prev, next, reverse);
    } else {
      listLoader.reverse = reverse;
    }

    listLoader.setSearchContext(this.searchContext);
    listLoader.current = current;

    listLoader.load(true);
    listLoader.load(false);
  }

  private getPlaybackMediaTypeFromMessage(message: Message.message) {
    const doc = getMediaFromMessage(message, true) as MyDocument;
    let mediaType: PlaybackMediaType = 'audio';
    if(doc?.type) {
      if(doc.type === 'voice' || doc.type === 'round') {
        mediaType = 'voice';
      } else if(doc.type === 'video') {
        mediaType = 'video';
      }
    }

    return mediaType;
  }

  public setMedia(media: HTMLMediaElement, message: Message.message, standalone?: boolean) {
    const mediaType = this.getPlaybackMediaTypeFromMessage(message);

    this._playbackRate = this.playbackRates[mediaType];

    this.playingMedia = media;
    this.playingMediaType = mediaType;
    if(!standalone) {
      this.playingMedia.volume = this.volume;
      this.playingMedia.muted = this.muted;
      this.playingMedia.playbackRate = this.playbackRate;
      if(mediaType === 'audio') {
        this.playingMedia.loop = this.loop;
      }
    }

    if('mediaSession' in navigator) {
      this.setNewMediadata(message);
    }
  }

  public setSingleMedia({
    media,
    message,
    standalone
  }: {
    media?: HTMLMediaElement,
    message?: Message.message,
    standalone?: boolean
  } = {}) {
    const playingMedia = this.playingMedia;

    const wasPlaying = this.pause();

    let onPlay: () => void;
    if(media) {
      onPlay = () => {
        const pip = this.pip;
        if(pip) {
          pip.pause();
        }

        this.pauseMediaInOtherTabs();
      };

      if(!media.paused) {
        onPlay();
      }

      media.addEventListener('play', onPlay);
    } else { // maybe it's voice recording
      this.pauseMediaInOtherTabs();
    }

    this.willBePlayed(undefined);
    if(media) this.setMedia(media, message, standalone);
    else this.playingMedia = undefined;
    this.toggleSwitchers(false);

    this.dispatchEvent('singleMedia', media);

    return (playPaused = wasPlaying) => {
      this.toggleSwitchers(true);

      if(playingMedia) {
        if(this.mediaDetails.get(playingMedia)) {
          this.setMedia(playingMedia, this.getMessageByMedia(playingMedia));
        } else {
          this.next() || this.previous();
        }
      }

      // If it's still not cleaned
      if(this.playingMedia === media) {
        this.playingMedia = undefined;
        this.playingMediaType = undefined;
      }

      if(media) {
        media.removeEventListener('play', onPlay);
      }

      // I don't remember what it was for
      // if(media && this.playingMedia === media) {
      //   this.stop();
      // }

      if(playPaused) {
        this.play();
      }
    };
  }

  public toggleSwitchers(enabled: boolean) {
    this.lockedSwitchers = !enabled;
  }

  public setPictureInPicture(video: HTMLVideoElement) {
    this.pip = video;

    // let wasPlaying = this.pause();

    const listenerSetter = new ListenerSetter();
    listenerSetter.add(video)('leavepictureinpicture', () => {
      if(this.pip !== video) {
        return;
      }

      this.pip = undefined;
      // if(wasPlaying) {
      //   this.play();
      // }

      listenerSetter.removeAll();
    }, {once: true});

    listenerSetter.add(video)('play', (e) => {
      if(this.playingMedia !== video) {
        this.pause();
      }

      this.pauseMediaInOtherTabs();
      // if(this.pause()) {
      //   listenerSetter.add(video)('pause', () => {
      //     this.play();
      //   }, {once: true});
      // }
    });
  }
}

const appMediaPlaybackController = new AppMediaPlaybackController();
MOUNT_CLASS_TO.appMediaPlaybackController = appMediaPlaybackController;
export default appMediaPlaybackController;
