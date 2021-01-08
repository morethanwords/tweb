import appDocsManager, {MyDocument} from "../lib/appManagers/appDocsManager";
import { RichTextProcessor } from "../lib/richtextprocessor";
import { formatDate } from "./wrappers";
import ProgressivePreloader from "./preloader";
import { MediaProgressLine } from "../lib/mediaPlayer";
import appMediaPlaybackController from "./appMediaPlaybackController";
import { DocumentAttribute } from "../layer";
import { Download } from "../lib/appManagers/appDownloadManager";
import mediaSizes from "../helpers/mediaSizes";
import { isSafari } from "../helpers/userAgent";
import appMessagesManager from "../lib/appManagers/appMessagesManager";
import rootScope from "../lib/rootScope";
import './middleEllipsis';
import { attachClickEvent, cancelEvent, detachClickEvent } from "../helpers/dom";
import appPeersManager from "../lib/appManagers/appPeersManager";
import { SearchSuperContext } from "./appSearchSuper.";
import { formatDateAccordingToToday } from "../helpers/date";

rootScope.on('messages_media_read', e => {
  const {mids, peerId} = e;

  mids.forEach(mid => {
    (Array.from(document.querySelectorAll('audio-element[message-id="' + mid + '"][peer-id="' + peerId + '"]')) as AudioElement[]).forEach(elem => {
      //console.log('updating avatar:', elem);
      elem.classList.remove('is-unread');
    });
  });
});

// https://github.com/LonamiWebs/Telethon/blob/4393ec0b83d511b6a20d8a20334138730f084375/telethon/utils.py#L1285
export function decodeWaveform(waveform: Uint8Array | number[]) {
  if(!(waveform instanceof Uint8Array)) {
    waveform = new Uint8Array(waveform);
  }

  const bitCount = waveform.length * 8;
  const valueCount = bitCount / 5 | 0;
  if(!valueCount) {
    return new Uint8Array([]);
  }

  let result: Uint8Array;
  try {
    const dataView = new DataView(waveform.buffer);
    result = new Uint8Array(valueCount);
    for(let i = 0; i < valueCount; i++) {
      const byteIndex = i * 5 / 8 | 0;
      const bitShift = i * 5 % 8;
      const value = dataView.getUint16(byteIndex, true);
      result[i] = (value >> bitShift) & 0b00011111;
    }
  } catch(err) {
    result = new Uint8Array([]);
  }

  /* var byteIndex = (valueCount - 1) / 8 | 0;
  var bitShift = (valueCount - 1) % 8;
  if(byteIndex == waveform.length - 1) {
    var value = waveform[byteIndex];
  } else {
    var value = dataView.getUint16(byteIndex, true);
  }
  console.log('decoded waveform, setting last value:', value, byteIndex, bitShift);
  result[valueCount - 1] = (value >> bitShift) & 0b00011111; */
  return result;
}

function wrapVoiceMessage(audioEl: AudioElement) {
  audioEl.classList.add('is-voice');

  const message = audioEl.message;
  const doc = (message.media.document || message.media.webpage.document) as MyDocument;
  const isOut = message.fromId == rootScope.myId && message.peerId != rootScope.myId;
  let isUnread = message && message.pFlags.media_unread;
  if(isUnread) {
    audioEl.classList.add('is-unread');
  }

  const barWidth = 2;
  const barMargin = mediaSizes.isMobile ? 2 : 1;
  const barHeightMin = mediaSizes.isMobile ? 3 : 2;
  const barHeightMax = mediaSizes.isMobile ? 16 : 23;
  const availW = mediaSizes.isMobile ? 152 : 190;

  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.classList.add('audio-waveform');
  svg.setAttributeNS(null, 'width', '' + availW);
  svg.setAttributeNS(null, 'height', '' + barHeightMax);
  svg.setAttributeNS(null, 'viewBox', `0 0 ${availW} ${barHeightMax}`);

  const timeDiv = document.createElement('div');
  timeDiv.classList.add('audio-time');
  audioEl.append(svg, timeDiv);

  let waveform = (doc.attributes.find(attribute => attribute._ == 'documentAttributeAudio') as DocumentAttribute.documentAttributeAudio).waveform || new Uint8Array([]);
  waveform = decodeWaveform(waveform.slice(0, 63));

  //console.log('decoded waveform:', waveform);

  const normValue = Math.max(...waveform);
  const wfSize = waveform.length ? waveform.length : 100;
  const barCount = Math.min((availW / (barWidth + barMargin)) | 0, wfSize);

  let maxValue = 0;
  const maxDelta = barHeightMax - barHeightMin;

  let html = '';
  for(let i = 0, barX = 0, sumI = 0; i < wfSize; ++i) {
    const value = waveform[i] || 0;
    if((sumI + barCount) >= wfSize) { // draw bar
      sumI = sumI + barCount - wfSize;
			if(sumI < (barCount + 1) / 2) {
				if(maxValue < value) maxValue = value;
      }
      
      const bar_value = Math.max(((maxValue * maxDelta) + ((normValue + 1) / 2)) / (normValue + 1), barHeightMin);
      
      const h = `
      <rect x="${barX}" y="${barHeightMax - bar_value}" width="2" height="${bar_value}" rx="1" ry="1"></rect>
      `;
      html += h;

      barX += barWidth + barMargin;

      if(sumI < (barCount + 1) / 2) {
        maxValue = 0;
      } else {
        maxValue = value;
      }
    } else {
      if(maxValue < value) maxValue = value;

      sumI += barCount;
    }
  }

  svg.insertAdjacentHTML('beforeend', html);
  const rects = Array.from(svg.children) as HTMLElement[];

  let progress = audioEl.querySelector('.audio-waveform') as HTMLDivElement;
  
  const onLoad = () => {
    let interval = 0;
    let lastIndex = 0;

    let audio = audioEl.audio;

    if(!audio.paused || (audio.currentTime > 0 && audio.currentTime != audio.duration)) {
      lastIndex = Math.round(audio.currentTime / audio.duration * barCount);
      rects.slice(0, lastIndex + 1).forEach(node => node.classList.add('active'));
    }

    let start = () => {
      clearInterval(interval);
      interval = window.setInterval(() => {
        if(lastIndex > svg.childElementCount || isNaN(audio.duration) || audio.paused) {
          clearInterval(interval);
          return;
        }

        lastIndex = Math.round(audio.currentTime / audio.duration * barCount);
        
        //svg.children[lastIndex].setAttributeNS(null, 'fill', '#000');
        //svg.children[lastIndex].classList.add('active'); #Иногда пропускает полоски..
        rects.slice(0, lastIndex + 1).forEach(node => node.classList.add('active'));
        //++lastIndex;
        //console.log('lastIndex:', lastIndex, audio.currentTime);
        //}, duration * 1000 / svg.childElementCount | 0/* 63 * duration / 10 */);
      }, 20);
    };

    if(!audio.paused) {
      start();
    }

    audioEl.addAudioListener('playing', () => {
      if(isUnread && !isOut && audioEl.classList.contains('is-unread')) {
        audioEl.classList.remove('is-unread');
        appMessagesManager.readMessages(audioEl.message.peerId, [audioEl.message.mid]);
        isUnread = false;
      }

      //rects.forEach(node => node.classList.remove('active'));
      start();
    });

    audioEl.addAudioListener('pause', () => {
      clearInterval(interval);
    });
    
    audioEl.addAudioListener('ended', () => {
      clearInterval(interval);
      rects.forEach(node => node.classList.remove('active'));
    });
    
    let mousedown = false, mousemove = false;
    progress.addEventListener('mouseleave', (e) => {
      if(mousedown) {
        audio.play();
        mousedown = false;
      }
      mousemove = false;
    })
    progress.addEventListener('mousemove', (e) => {
      mousemove = true;
      if(mousedown) scrub(e);
    });
    progress.addEventListener('mousedown', (e) => {
      e.preventDefault();
      if(!audio.paused) {
        audio.pause();
        scrub(e);
        mousedown = true;
      }
    });
    progress.addEventListener('mouseup', (e) => {
      if (mousemove && mousedown) {
        audio.play();
        mousedown = false;
      }
    });
    attachClickEvent(progress, (e) => {
      cancelEvent(e);
      if(!audio.paused) scrub(e);
    });
    
    function scrub(e: MouseEvent | TouchEvent) {
      let offsetX: number;
      if(e instanceof MouseEvent) {
        offsetX = e.offsetX;
      } else { // touch
        const rect = (e.target as HTMLElement).getBoundingClientRect();
        offsetX = e.targetTouches[0].pageX - rect.left;
      }
      
      const scrubTime = offsetX / availW /* width */ * audio.duration;
      lastIndex = Math.round(scrubTime / audio.duration * barCount);
      
      rects.slice(0, lastIndex + 1).forEach(node => node.classList.add('active'));
      for(let i = lastIndex + 1; i < rects.length; ++i) {
        rects[i].classList.remove('active')
      }
      audio.currentTime = scrubTime;
    }
    
    return () => {
      clearInterval(interval);
      progress.remove();
      progress = null;
      audio = null;
    };
  };

  return onLoad;
}

function wrapAudio(audioEl: AudioElement) {
  const withTime = audioEl.withTime;

  const message = audioEl.message;
  const doc: MyDocument = message.media.document || message.media.webpage.document;

  const senderTitle = audioEl.showSender ? appMessagesManager.getSenderToPeerText(message) : '';

  let title = doc.type === 'voice' ? senderTitle : (doc.audioTitle || doc.file_name);
  let subtitle: string;
  
  if(doc.type === 'voice') {
    subtitle = '';
  } else {
    subtitle = doc.audioPerformer ? RichTextProcessor.wrapPlainText(doc.audioPerformer) : '';
    if(withTime) {
      subtitle += (subtitle ? ' • ' : '') + formatDate(doc.date);
    } else if(!subtitle) {
      subtitle = 'Unknown Artist';
    }

    if(audioEl.showSender) {
      subtitle += ' • ' + senderTitle;
    } else {
      subtitle = ' • ' + subtitle;
    }
  }

  let titleAdditionHTML = '';
  if(audioEl.showSender) {
    titleAdditionHTML = `<div class="sent-time">${formatDateAccordingToToday(new Date(message.date * 1000))}</div>`;
  }

  const html = `
  <div class="audio-details">
    <div class="audio-title"><middle-ellipsis-element data-font-weight="${audioEl.dataset.fontWeight}">${title}</middle-ellipsis-element>${titleAdditionHTML}</div>
    <div class="audio-subtitle"><div class="audio-time"></div>${subtitle || '<div></div>'}</div>
  </div>`;
  
  audioEl.insertAdjacentHTML('beforeend', html);

  const onLoad = () => {
    const subtitleDiv = audioEl.querySelector('.audio-subtitle') as HTMLDivElement;
    let launched = false;

    let progressLine = new MediaProgressLine(audioEl.audio, doc.supportsStreaming);

    audioEl.addAudioListener('ended', () => {
      audioEl.classList.remove('audio-show-progress');
      // Reset subtitle
      subtitleDiv.lastChild.replaceWith(subtitle);
      launched = false;
    });

    const onPlaying = () => {
      if(!launched) {
        audioEl.classList.add('audio-show-progress');
        launched = true;

        if(progressLine) {
          subtitleDiv.lastChild.replaceWith(progressLine.container);
        }
      }
    };

    audioEl.addAudioListener('playing', onPlaying);

    if(!audioEl.audio.paused || audioEl.audio.currentTime > 0) {
      onPlaying();
    }

    return () => {
      progressLine.removeListeners();
      progressLine.container.remove();
      progressLine = null;
    };
  };

  return onLoad;
}

export default class AudioElement extends HTMLElement {
  public audio: HTMLAudioElement;
  public preloader: ProgressivePreloader;
  public message: any;
  public withTime = false;
  public voiceAsMusic = false;
  public searchContext: SearchSuperContext;
  public showSender = false;

  private attachedHandlers: {[name: string]: any[]} = {};
  private onTypeDisconnect: () => void;

  constructor() {
    super();
    // элемент создан
  }

  public render() {
    this.classList.add('audio');

    const doc = this.message.media.document || this.message.media.webpage.document;
    const isRealVoice = doc.type == 'voice';
    const isVoice = !this.voiceAsMusic && isRealVoice;
    const uploading = this.message.pFlags.is_outgoing;

    const durationStr = String(doc.duration | 0).toHHMMSS();

    this.innerHTML = `<div class="audio-toggle audio-ico tgico-largeplay">    
                         <div class="part one" x="0" y="0" fill="#fff"></div>
                         <div class="part two" x="0" y="0" fill="#fff"></div>
                      </div>`;

    const downloadDiv = document.createElement('div');
    downloadDiv.classList.add('audio-download');
    if(!uploading && isVoice) {
      downloadDiv.innerHTML = '<div class="tgico-download"></div>';
    }

    if(isVoice || uploading) {
      this.append(downloadDiv);
    }

    const onTypeLoad = isVoice ? wrapVoiceMessage(this) : wrapAudio(this);
    
    const audioTimeDiv = this.querySelector('.audio-time') as HTMLDivElement;
    audioTimeDiv.innerHTML = durationStr;

    const onLoad = (autoload = true) => {
      const audio = this.audio = appMediaPlaybackController.addMedia(this.message.peerId, this.message.media.document || this.message.media.webpage.document, this.message.mid, autoload);

      this.onTypeDisconnect = onTypeLoad();
      
      const toggle = this.querySelector('.audio-toggle') as HTMLDivElement;

      const getTimeStr = () => String(audio.currentTime | 0).toHHMMSS() + (isVoice ? (' / ' + durationStr) : '');

      const onPlaying = () => {
        audioTimeDiv.innerText = getTimeStr();
        if(!audio.paused) {
          //toggle.classList.remove('tgico-largeplay');
          toggle.classList.add('tgico-largepause');
        }
      };

      if(!audio.paused || (audio.currentTime > 0 && audio.currentTime != audio.duration)) {
        onPlaying();
      }

      attachClickEvent(toggle, (e) => {
        cancelEvent(e);
        if(audio.paused) audio.play().catch(() => {});
        else audio.pause();
      });

      this.addAudioListener('ended', () => {
        //toggle.classList.add('tgico-largeplay');
        toggle.classList.remove('tgico-largepause');
      });

      this.addAudioListener('timeupdate', () => {
        if(appMediaPlaybackController.isSafariBuffering(audio)) return;
        audioTimeDiv.innerText = getTimeStr();
      });

      this.addAudioListener('pause', () => {
        //toggle.classList.add('tgico-largeplay');
        toggle.classList.remove('tgico-largepause');
      });

      this.addAudioListener('playing', onPlaying);
    };

    if(!uploading) {
      let preloader: ProgressivePreloader = this.preloader;

      if(isRealVoice) {
        let download: Download;

        const onClick = (e: Event) => {
          if(e) {
            cancelEvent(e);
          }

          if(!download) {
            if(!preloader) {
              preloader = new ProgressivePreloader(null, true);
            }
            
            download = appDocsManager.downloadDoc(doc);
            preloader.attach(downloadDiv, true, download);
            
            download.then(() => {
              downloadDiv.remove();
              detachClickEvent(this, onClick);
              onLoad();
            }).catch(err => {
              if(err.name === 'AbortError') {
                download = null;
              }
            }).finally(() => {
              downloadDiv.classList.remove('downloading');
            });
            
            downloadDiv.classList.add('downloading');
          } else {
            download.cancel();
          }
        };
    
        attachClickEvent(this, onClick);
        onClick(null);
      } else {
        onLoad(false);

        //if(appMediaPlaybackController.mediaExists(mid)) { // чтобы показать прогресс, если аудио уже было скачано
          //onLoad();
        //} else {
          const r = (e: Event) => {
            if(this.audio.src) {
              return;
            }
            //onLoad();
            //cancelEvent(e);
            appMediaPlaybackController.resolveWaitingForLoadMedia(this.message.peerId, this.message.mid);
  
            appMediaPlaybackController.willBePlayed(this.audio); // prepare for loading audio
  
            if(!preloader) {
              preloader = new ProgressivePreloader(null, false);
            }

            if(isSafari) {
              this.audio.autoplay = true;
              this.audio.play().catch(() => {});
            }
    
            preloader.attach(downloadDiv, false);
            this.append(downloadDiv);
    
            new Promise<void>((resolve) => {
              if(this.audio.readyState >= 2) resolve();
              else this.addAudioListener('canplay', resolve);
            }).then(() => {
              downloadDiv.remove();
  
              //setTimeout(() => {
                // release loaded audio
                if(appMediaPlaybackController.willBePlayedMedia === this.audio) {
                  this.audio.play();
                  appMediaPlaybackController.willBePlayedMedia = null;
                }
              //}, 10e3);
            });
          };

          if(!this.audio.src) {
            attachClickEvent(this, r, {once: true, capture: true, passive: false});
          }
        //}
      }
    } else {
      this.preloader.attach(downloadDiv, false);
      //onLoad();
    }
  }

  /* connectedCallback() {
    // браузер вызывает этот метод при добавлении элемента в документ
    // (может вызываться много раз, если элемент многократно добавляется/удаляется)
  } */

  public addAudioListener(name: string, callback: any) {
    if(!this.attachedHandlers[name]) this.attachedHandlers[name] = [];
    this.attachedHandlers[name].push(callback);
    this.audio.addEventListener(name, callback);
  }

  disconnectedCallback() {
    // браузер вызывает этот метод при удалении элемента из документа
    // (может вызываться много раз, если элемент многократно добавляется/удаляется)
    if(this.onTypeDisconnect) {
      this.onTypeDisconnect();
      this.onTypeDisconnect = null;
    }

    for(let name in this.attachedHandlers) {
      for(let callback of this.attachedHandlers[name]) {
        this.audio.removeEventListener(name, callback);
      }
      
      delete this.attachedHandlers[name];
    }

    this.preloader = null;
  }
}

customElements.define("audio-element", AudioElement);