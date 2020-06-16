import appDocsManager from "../lib/appManagers/appDocsManager";
import { RichTextProcessor } from "../lib/richtextprocessor";
import { formatDate } from "./wrappers";
import ProgressivePreloader from "./preloader";
import { CancellablePromise } from "../lib/polyfill";
import { MediaProgressLine } from "../lib/mediaPlayer";
import appAudio from "./appAudio";
import { MTDocument } from "../types";

// https://github.com/LonamiWebs/Telethon/blob/4393ec0b83d511b6a20d8a20334138730f084375/telethon/utils.py#L1285
export function decodeWaveform(waveform: Uint8Array | number[]) {
  if(!(waveform instanceof Uint8Array)) {
    waveform = new Uint8Array(waveform);
  }

  var bitCount = waveform.length * 8;
  var valueCount = bitCount / 5 | 0;
  if(!valueCount) {
    return new Uint8Array([]);
  }

  var dataView = new DataView(waveform.buffer);
  var result = new Uint8Array(valueCount);
  for(var i = 0; i < valueCount; i++) {
    var byteIndex = i * 5 / 8 | 0;
    var bitShift = i * 5 % 8;
    var value = dataView.getUint16(byteIndex, true);
    result[i] = (value >> bitShift) & 0b00011111;
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

function wrapVoiceMessage(doc: MTDocument, audioEl: AudioElement) {
  audioEl.classList.add('is-voice');

  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.classList.add('audio-waveform');
  svg.setAttributeNS(null, 'width', '190');
  svg.setAttributeNS(null, 'height', '23');
  svg.setAttributeNS(null, 'viewBox', '0 0 190 23');

  const timeDiv = document.createElement('div');
  timeDiv.classList.add('audio-time');
  audioEl.append(svg, timeDiv);

  const barWidth = 2;
  const barMargin = 1;
  const barHeightMin = 2;
  const barHeightMax = 23;

  let waveform = doc.attributes[0].waveform || [];
  waveform = decodeWaveform(waveform.slice());

  //console.log('decoded waveform:', waveform);

  const normValue = Math.max(...waveform);
  const wfSize = waveform.length ? waveform.length : 100;
  const availW = 190;
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
      interval = setInterval(() => {
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
    progress.addEventListener('click', (e) => {
      if(!audio.paused) scrub(e);
    });
    
    function scrub(e: MouseEvent) {
      const scrubTime = e.offsetX / availW /* width */ * audio.duration;
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

function wrapAudio(doc: MTDocument, audioEl: AudioElement) {
  const withTime = !!+audioEl.getAttribute('with-time');

  const title = doc.audioTitle || doc.file_name;
  let subtitle = doc.audioPerformer ? RichTextProcessor.wrapPlainText(doc.audioPerformer) : '';

  if(withTime) {
    subtitle += (subtitle ? ' · ' : '') + formatDate(doc.date);
  } else if(!subtitle) {
    subtitle = 'Unknown Artist';
  }

  const html = `
  <div class="audio-details">
    <div class="audio-title">${title}</div>
    <div class="audio-subtitle">${subtitle}</div>
    <div class="audio-time"></div>
  </div>`;
  
  audioEl.insertAdjacentHTML('beforeend', html);

  const onLoad = () => {
    const subtitleDiv = audioEl.querySelector('.audio-subtitle') as HTMLDivElement;
    let launched = false;

    let progressLine = new MediaProgressLine(audioEl.audio);

    audioEl.addAudioListener('ended', () => {
      audioEl.classList.remove('audio-show-progress');
      // Reset subtitle
      subtitleDiv.innerHTML = subtitle;
      launched = false;
    });

    const onPlaying = () => {
      if(!launched) {
        audioEl.classList.add('audio-show-progress');
        launched = true;

        subtitleDiv.innerHTML = '';
        if(progressLine) {
          subtitleDiv.append(progressLine.container);
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

  private attachedHandlers: {[name: string]: any[]} = {};
  private onTypeDisconnect: () => void;

  constructor() {
    super();
    // элемент создан
  }

  connectedCallback() {
    // браузер вызывает этот метод при добавлении элемента в документ
    // (может вызываться много раз, если элемент многократно добавляется/удаляется)

    this.classList.add('audio');

    const mid = +this.getAttribute('message-id');
    const docID = this.getAttribute('doc-id');
    const doc = appDocsManager.getDoc(docID);
    const uploading = +doc.id < 0;

    const durationStr = String(doc.duration | 0).toHHMMSS(true);

    this.innerHTML = `
    <div class="audio-toggle audio-ico tgico-largeplay"></div>
    <div class="audio-download">${uploading ? '' : '<div class="tgico-download"></div>'}</div>`;

    const onTypeLoad = doc.type == 'voice' ? wrapVoiceMessage(doc, this) : wrapAudio(doc, this);

    const downloadDiv = this.querySelector('.audio-download') as HTMLDivElement;
    const audioTimeDiv = this.querySelector('.audio-time') as HTMLDivElement;
    audioTimeDiv.innerHTML = durationStr;

    let preloader: ProgressivePreloader;
    let promise: CancellablePromise<Blob>;

    const onLoad = () => {
      const audio = this.audio = appAudio.addAudio(doc, mid);

      this.onTypeDisconnect = onTypeLoad();
      
      const toggle = this.querySelector('.audio-toggle') as HTMLDivElement;

      const onPlaying = () => {
        audioTimeDiv.innerText = String(audio.currentTime | 0).toHHMMSS(true) + ' / ' + durationStr;
        if(!audio.paused) {
          toggle.classList.remove('tgico-largeplay');
          toggle.classList.add('tgico-largepause');
        }
      };

      if(!audio.paused || (audio.currentTime > 0 && audio.currentTime != audio.duration)) {
        onPlaying();
        audioTimeDiv.innerText = String(audio.currentTime | 0).toHHMMSS(true) + ' / ' + durationStr;
      }

      toggle.addEventListener('click', () => {
        if(audio.paused) audio.play();
        else audio.pause();
      });
      
      this.addAudioListener('ended', () => {
        toggle.classList.add('tgico-largeplay');
        toggle.classList.remove('tgico-largepause');
      });

      this.addAudioListener('timeupdate', () => {
        audioTimeDiv.innerText = String(audio.currentTime | 0).toHHMMSS(true) + ' / ' + durationStr;
      });

      this.addAudioListener('pause', () => {
        toggle.classList.add('tgico-largeplay');
        toggle.classList.remove('tgico-largepause');
      });

      this.addAudioListener('playing', onPlaying);
    };

    if(!uploading) {
      const onClick = () => {
        if(!promise) {
          if(!preloader) {
            preloader = new ProgressivePreloader(null, true);
          }
          
          promise = appDocsManager.downloadDoc(doc.id);
          preloader.attach(downloadDiv, true, promise);
          
          promise.then(() => {
            preloader = null;
            downloadDiv.classList.remove('downloading');
            downloadDiv.remove();
            this.removeEventListener('click', onClick);
            onLoad();
          });
          
          downloadDiv.classList.add('downloading');
        } else {
          downloadDiv.classList.remove('downloading');
          promise.cancel();
          promise = null;
        }
      };
  
      this.addEventListener('click', onClick);
      this.click();
    } else {
      onLoad();
    }
  }

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
  }

  static get observedAttributes(): string[] {
    return [/* массив имён атрибутов для отслеживания их изменений */];
  }

  attributeChangedCallback(name: string, oldValue: string, newValue: string) {
    // вызывается при изменении одного из перечисленных выше атрибутов
  }

  adoptedCallback() {
    // вызывается, когда элемент перемещается в новый документ
    // (происходит в document.adoptNode, используется очень редко)
  }

  // у элемента могут быть ещё другие методы и свойства
}

customElements.define("audio-element", AudioElement);