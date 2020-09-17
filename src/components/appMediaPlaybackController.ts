import { $rootScope } from "../lib/utils";
import appMessagesManager from "../lib/appManagers/appMessagesManager";
import appDocsManager, {MyDocument} from "../lib/appManagers/appDocsManager";
import { isSafari } from "../lib/config";
import { CancellablePromise, deferredPromise } from "../lib/polyfill";

// TODO: если удалить сообщение, и при этом аудио будет играть - оно не остановится, и можно будет по нему перейти вникуда

// TODO: Safari: проверить стрим, включить его и сразу попробовать включить видео или другую песню
// TODO: Safari: попробовать замаскировать подгрузку последнего чанка
// TODO: Safari: пофиксить момент, когда заканчивается песня и пытаешься включить её заново - прогресс сразу в конце

type HTMLMediaElement = HTMLAudioElement | HTMLVideoElement;

type MediaType = 'voice' | 'audio' | 'round';

class AppMediaPlaybackController {
  private container: HTMLElement;
  private media: {[mid: string]: HTMLMediaElement} = {};
  private playingMedia: HTMLMediaElement;

  private waitingMediaForLoad: {[mid: string]: CancellablePromise<void>} = {};
  
  public willBePlayedMedia: HTMLMediaElement;

  private prevMid: number;
  private nextMid: number;

  constructor() {
    this.container = document.createElement('div');
    //this.container.style.cssText = 'position: absolute; top: -10000px; left: -10000px;';
    this.container.style.cssText = 'display: none;';
    document.body.append(this.container);
  }

  public addMedia(doc: MyDocument, mid: number, autoload = true): HTMLMediaElement {
    if(this.media[mid]) return this.media[mid];

    const media = document.createElement(doc.type == 'round' ? 'video' : 'audio');
    //const source = document.createElement('source');
    //source.type = doc.type == 'voice' && !opusDecodeController.isPlaySupported() ? 'audio/wav' : doc.mime_type;

    if(doc.type == 'round') {
      media.setAttribute('playsinline', '');
    }

    media.dataset.mid = '' + mid;
    media.dataset.type = doc.type;
    
    //media.autoplay = true;
    media.volume = 1;
    //media.append(source);

    this.container.append(media);

    media.addEventListener('playing', () => {
      if(this.playingMedia != media) {
        if(this.playingMedia && !this.playingMedia.paused) {
          this.playingMedia.pause();
        }
  
        this.playingMedia = media;
        this.loadSiblingsMedia(doc.type as MediaType, mid);
      }

      // audio_pause не успеет сработать без таймаута
      setTimeout(() => {
        $rootScope.$broadcast('audio_play', {doc, mid});
      }, 0);
    });

    media.addEventListener('pause', this.onPause);
    media.addEventListener('ended', this.onEnded);
    
    const onError = (e: Event) => {
      if(this.nextMid == mid) {
        this.loadSiblingsMedia(doc.type as MediaType, mid).then(() => {
          if(this.nextMid && this.media[this.nextMid]) {
            this.media[this.nextMid].play();
          }
        });
      }
    };

    media.addEventListener('error', onError);

    const deferred = deferredPromise<void>();
    if(autoload) {
      deferred.resolve();
    } else {
      this.waitingMediaForLoad[mid] = deferred;
    }

    // если что - загрузит voice или round заранее, так правильнее
    const downloadPromise: Promise<any> = !doc.supportsStreaming ? appDocsManager.downloadDocNew(doc) : Promise.resolve();
    Promise.all([deferred, downloadPromise]).then(() => {
      //media.autoplay = true;
      //console.log('will set media url:', media, doc, doc.type, doc.url);

      if(doc.type == 'audio' && doc.supportsStreaming && isSafari) {
        this.handleSafariStreamable(media);
      }

      media.src = doc.url;
    }, onError);
    
    return this.media[mid] = media;
  }

  // safari подгрузит последний чанк и песня включится,
  // при этом этот чанк нельзя руками отдать из SW, потому что браузер тогда теряется
  private handleSafariStreamable(media: HTMLMediaElement) {
    media.addEventListener('play', () => {
      /* if(media.readyState == 4) { // https://developer.mozilla.org/ru/docs/Web/API/XMLHttpRequest/readyState
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

  public resolveWaitingForLoadMedia(mid: number) {
    const promise = this.waitingMediaForLoad[mid];
    if(promise) {
      promise.resolve();
      delete this.waitingMediaForLoad[mid];
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

  onPause = (e: Event) => {
    $rootScope.$broadcast('audio_pause');
  };

  onEnded = (e: Event) => {
    this.onPause(e);

    //console.log('on media end');

    if(this.nextMid) {
      const media = this.media[this.nextMid];

      /* if(isSafari) {
        media.autoplay = true;
      } */

      this.resolveWaitingForLoadMedia(this.nextMid);

      setTimeout(() => {
        media.play()//.catch(() => {});
      }, 0);
    }
  };

  private loadSiblingsMedia(type: MediaType, mid: number) {
    const media = this.playingMedia;
    const message = appMessagesManager.getMessage(mid);
    this.prevMid = this.nextMid = 0;

    return appMessagesManager.getSearch(message.peerID, '', {
      //_: type == 'audio' ? 'inputMessagesFilterMusic' : (type == 'round' ? 'inputMessagesFilterRoundVideo' : 'inputMessagesFilterVoice')
      _: type == 'audio' ? 'inputMessagesFilterMusic' : 'inputMessagesFilterRoundVoice'
    }, mid, 3, 0, 2).then(value => {
      if(this.playingMedia != media) {
        return;
      }
 
      for(let m of value.history) {
        if(m > mid) {
          this.nextMid = m;
        } else if(m < mid) {
          this.prevMid = m;
          break;
        }
      }

      [this.prevMid, this.nextMid].filter(Boolean).forEach(mid => {
        const message = appMessagesManager.getMessage(mid);
        this.addMedia(message.media.document, mid, false);
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
// @ts-ignore
if(process.env.NODE_ENV != 'production') {
  (window as any).appMediaPlaybackController = appMediaPlaybackController;
}
export default appMediaPlaybackController;