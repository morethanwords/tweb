import { MTDocument } from "../types";
import { $rootScope } from "../lib/utils";
import appMessagesManager from "../lib/appManagers/appMessagesManager";
import appDocsManager from "../lib/appManagers/appDocsManager";
import opusDecodeController from "../lib/opusDecodeController";

class AppAudio {
  private container: HTMLElement;
  private audios: {[mid: string]: HTMLAudioElement} = {};
  private playingAudio: HTMLAudioElement;

  private prevMid: number;
  private nextMid: number;

  constructor() {
    this.container = document.createElement('div');
    //this.container.style.cssText = 'position: absolute; top: -10000px; left: -10000px;';
    this.container.style.cssText = 'display: none;';
    document.body.append(this.container);
  }

  public addAudio(doc: MTDocument, mid: number) {
    if(this.audios[mid]) return this.audios[mid];

    const audio = document.createElement('audio');
    const source = document.createElement('source');
    source.type = doc.type == 'voice' && !opusDecodeController.isPlaySupported() ? 'audio/wav' : doc.mime_type;
    
    audio.autoplay = false;
    audio.volume = 1;
    audio.append(source);

    audio.addEventListener('playing', (e) => {
      if(this.playingAudio != audio) {
        if(this.playingAudio && !this.playingAudio.paused) {
          this.playingAudio.pause();
        }
  
        this.playingAudio = audio;
        this.loadSiblingsAudio(doc.type as 'voice' | 'audio', mid);
      }

      // audio_pause не успеет сработать без таймаута
      setTimeout(() => {
        $rootScope.$broadcast('audio_play', {doc, mid});
      }, 0);
    });

    audio.addEventListener('pause', this.onPause);
    audio.addEventListener('ended', this.onEnded);
    
    const onError = (e: Event) => {
      if(this.nextMid == mid) {
        this.loadSiblingsAudio(doc.type as 'voice' | 'audio', mid).then(() => {
          if(this.nextMid && this.audios[this.nextMid]) {
            this.audios[this.nextMid].play();
          }
        })
      }
    };

    audio.addEventListener('error', onError);

    const downloadPromise: Promise<any> = !doc.supportsStreaming ? appDocsManager.downloadDocNew(doc.id) : Promise.resolve();

    downloadPromise.then(() => {
      this.container.append(audio);
      source.src = doc.url;
    }, onError);

    return this.audios[mid] = audio;
  }

  onPause = (e: Event) => {
    $rootScope.$broadcast('audio_pause');
  };

  onEnded = (e: Event) => {
    this.onPause(e);

    if(this.nextMid) {
      this.audios[this.nextMid].play();
    }
  };

  private loadSiblingsAudio(type: 'voice' | 'audio', mid: number) {
    const audio = this.playingAudio;
    const message = appMessagesManager.getMessage(mid);
    this.prevMid = this.nextMid = 0;

    return appMessagesManager.getSearch(message.peerID, '', {
      _: type == 'audio' ? 'inputMessagesFilterMusic' : 'inputMessagesFilterVoice'
    }, mid, 3, 0, 2).then(value => {
      if(this.playingAudio != audio) {
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
        this.addAudio(message.media.document, mid);
      });
      
      console.log('loadSiblingsAudio', audio, type, mid, value, this.prevMid, this.nextMid);
    });
  }
  
  public toggle() {
    if(!this.playingAudio) return;

    if(this.playingAudio.paused) {
      this.playingAudio.play();
    } else {
      this.playingAudio.pause();
    }
  }
}

const appAudio = new AppAudio();
// @ts-ignore
if(process.env.NODE_ENV != 'production') {
  (window as any).appAudio = appAudio;
}
export default appAudio;