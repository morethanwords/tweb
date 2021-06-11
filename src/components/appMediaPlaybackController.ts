/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import rootScope from "../lib/rootScope";
import appMessagesManager from "../lib/appManagers/appMessagesManager";
import appDocsManager, {MyDocument} from "../lib/appManagers/appDocsManager";
import { CancellablePromise, deferredPromise } from "../helpers/cancellablePromise";
import { isSafari } from "../helpers/userAgent";
import { MOUNT_CLASS_TO } from "../config/debug";
import appDownloadManager from "../lib/appManagers/appDownloadManager";

// TODO: если удалить сообщение, и при этом аудио будет играть - оно не остановится, и можно будет по нему перейти вникуда

// TODO: Safari: проверить стрим, включить его и сразу попробовать включить видео или другую песню
// TODO: Safari: попробовать замаскировать подгрузку последнего чанка
// TODO: Safari: пофиксить момент, когда заканчивается песня и пытаешься включить её заново - прогресс сразу в конце

type HTMLMediaElement = HTMLAudioElement | HTMLVideoElement;

type MediaType = 'voice' | 'audio' | 'round';

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

  private currentPeerId: number;
  private prevMid: number;
  private nextMid: number;

  constructor() {
    this.container = document.createElement('div');
    //this.container.style.cssText = 'position: absolute; top: -10000px; left: -10000px;';
    this.container.style.cssText = 'display: none;';
    document.body.append(this.container);
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

    media.dataset.mid = '' + mid;
    media.dataset.type = doc.type;
    
    //media.autoplay = true;
    media.volume = 1;
    //media.append(source);

    this.container.append(media);

    media.addEventListener('playing', () => {
      this.currentPeerId = peerId;

      //console.log('appMediaPlaybackController: video playing', this.currentPeerId, this.playingMedia, media);

      if(this.playingMedia !== media) {
        if(this.playingMedia && !this.playingMedia.paused) {
          this.playingMedia.pause();
        }
  
        this.playingMedia = media;
        this.loadSiblingsMedia(peerId, doc.type as MediaType, mid);
      }

      // audio_pause не успеет сработать без таймаута
      setTimeout(() => {
        rootScope.dispatchEvent('audio_play', {peerId, doc, mid});
      }, 0);
    });

    media.addEventListener('pause', this.onPause);
    media.addEventListener('ended', this.onEnded);
    
    const onError = (e: Event) => {
      //console.log('appMediaPlaybackController: video onError', e);

      if(this.nextMid === mid) {
        this.loadSiblingsMedia(peerId, doc.type as MediaType, mid).then(() => {
          if(this.nextMid && storage[this.nextMid]) {
            storage[this.nextMid].play();
          }
        });
      }
    };

    media.addEventListener('error', onError);

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
        if(doc.type === 'audio' && doc.supportsStreaming && isSafari) {
          this.handleSafariStreamable(media);
        }
  
        const cacheContext = appDownloadManager.getCacheContext(doc);
        media.src = cacheContext.url;
      });
    }, onError);
    
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
    const storage = this.waitingMediaForLoad[peerId] ?? (this.waitingMediaForLoad[peerId] = {});
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
    this.onPause(e);

    //console.log('on media end');

    if(this.nextMid) {
      const media = this.media[this.currentPeerId][this.nextMid];

      /* if(isSafari) {
        media.autoplay = true;
      } */

      this.resolveWaitingForLoadMedia(this.currentPeerId, this.nextMid);

      setTimeout(() => {
        media.play()//.catch(() => {});
      }, 0);
    }
  };

  private loadSiblingsMedia(peerId: number, type: MediaType, mid: number) {
    const media = this.playingMedia;
    this.prevMid = this.nextMid = 0;

    return appMessagesManager.getSearch({
      peerId, 
      query: '', 
      inputFilter: {
        //_: type === 'audio' ? 'inputMessagesFilterMusic' : (type === 'round' ? 'inputMessagesFilterRoundVideo' : 'inputMessagesFilterVoice')
        _: type === 'audio' ? 'inputMessagesFilterMusic' : 'inputMessagesFilterRoundVoice'
      },
      maxId: mid,
      limit: 3,
      backLimit: 2
    }).then(value => {
      if(this.playingMedia !== media) {
        return;
      }
 
      for(const {mid: m} of value.history) {
        if(m > mid) {
          this.nextMid = m;
        } else if(m < mid) {
          this.prevMid = m;
          break;
        }
      }

      [this.prevMid, this.nextMid].filter(Boolean).forEach(mid => {
        const message = appMessagesManager.getMessageByPeer(peerId, mid);
        this.addMedia(peerId, message.media.document, mid, false);
      });
      
      //console.log('loadSiblingsAudio', audio, type, mid, value, this.prevMid, this.nextMid);
    });
  }
  
  public toggle() {
    if(!this.playingMedia) return;

    if(this.playingMedia.paused) {
      this.playingMedia.play();
    } else {
      this.playingMedia.pause();
    }
  }

  public pause() {
    if(!this.playingMedia || this.playingMedia.paused) return;
    this.playingMedia.pause();
  }

  public willBePlayed(media: HTMLMediaElement) {
    this.willBePlayedMedia = media;
  }
}

const appMediaPlaybackController = new AppMediaPlaybackController();
MOUNT_CLASS_TO.appMediaPlaybackController = appMediaPlaybackController;
export default appMediaPlaybackController;
