import { MTDocument } from "../types";
import { $rootScope } from "../lib/utils";
import appMessagesManager from "../lib/appManagers/appMessagesManager";
import appDocsManager from "../lib/appManagers/appDocsManager";

// TODO: если удалить сообщение, и при этом аудио будет играть - оно не остановится, и можно будет по нему перейти вникуда

type HTMLMediaElement = HTMLAudioElement | HTMLVideoElement;

type MediaType = 'voice' | 'audio' | 'round';

class AppMediaPlaybackController {
  private container: HTMLElement;
  private media: {[mid: string]: HTMLMediaElement} = {};
  private playingMedia: HTMLMediaElement;
  
  public willBePlayedMedia: HTMLMediaElement;

  private prevMid: number;
  private nextMid: number;

  constructor() {
    this.container = document.createElement('div');
    //this.container.style.cssText = 'position: absolute; top: -10000px; left: -10000px;';
    this.container.style.cssText = 'display: none;';
    document.body.append(this.container);
  }

  public addMedia(doc: MTDocument, mid: number): HTMLMediaElement {
    if(this.media[mid]) return this.media[mid];

    const media = document.createElement(doc.type == 'round' ? 'video' : 'audio');
    //const source = document.createElement('source');
    //source.type = doc.type == 'voice' && !opusDecodeController.isPlaySupported() ? 'audio/wav' : doc.mime_type;
    
    media.autoplay = false;
    media.volume = 1;
    //media.append(source);

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

    const downloadPromise: Promise<any> = !doc.supportsStreaming ? appDocsManager.downloadDocNew(doc.id) : Promise.resolve();

    downloadPromise.then(() => {
      //if(doc.type != 'round') {
        this.container.append(media);
      //}

      //source.src = doc.url;
      media.src = doc.url;
    }, onError);

    return this.media[mid] = media;
  }

  onPause = (e: Event) => {
    $rootScope.$broadcast('audio_pause');
  };

  onEnded = (e: Event) => {
    this.onPause(e);

    if(this.nextMid) {
      this.media[this.nextMid].play();
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
        this.addMedia(message.media.document, mid);
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

  public mediaExists(mid: number) {
    return !!this.media[mid];
  }
}

const appMediaPlaybackController = new AppMediaPlaybackController();
// @ts-ignore
if(process.env.NODE_ENV != 'production') {
  (window as any).appMediaPlaybackController = appMediaPlaybackController;
}
export default appMediaPlaybackController;