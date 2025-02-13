/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import type {MyDocument} from '../lib/appManagers/appDocsManager';
import ProgressivePreloader from './preloader';
import appMediaPlaybackController, {MediaItem, MediaSearchContext} from './appMediaPlaybackController';
import {DocumentAttribute, Message} from '../layer';
import mediaSizes from '../helpers/mediaSizes';
import {IS_SAFARI} from '../environment/userAgent';
import rootScope from '../lib/rootScope';
import cancelEvent from '../helpers/dom/cancelEvent';
import {attachClickEvent} from '../helpers/dom/clickEvent';
import LazyLoadQueue from './lazyLoadQueue';
import deferredPromise, {CancellablePromise} from '../helpers/cancellablePromise';
import ListenerSetter, {Listener} from '../helpers/listenerSetter';
import noop from '../helpers/noop';
import findUpClassName from '../helpers/dom/findUpClassName';
import {joinElementsWith} from '../lib/langPack';
import {MiddleEllipsisElement} from './middleEllipsis';
import {formatFullSentTime} from '../helpers/date';
import throttleWithRaf from '../helpers/schedulers/throttleWithRaf';
import {NULL_PEER_ID} from '../lib/mtproto/mtproto_config';
import formatBytes from '../helpers/formatBytes';
import {animateSingle} from '../helpers/animation';
import clamp from '../helpers/number/clamp';
import toHHMMSS from '../helpers/string/toHHMMSS';
import MediaProgressLine from './mediaProgressLine';
import setInnerHTML from '../helpers/dom/setInnerHTML';
import {AppManagers} from '../lib/appManagers/managers';
import wrapEmojiText from '../lib/richTextProcessor/wrapEmojiText';
import wrapSenderToPeer from './wrappers/senderToPeer';
import wrapSentTime from './wrappers/sentTime';
import getMediaFromMessage from '../lib/appManagers/utils/messages/getMediaFromMessage';
import appDownloadManager from '../lib/appManagers/appDownloadManager';
import wrapPhoto from './wrappers/photo';
import {doubleRaf} from '../helpers/schedulers';
import safePlay from '../helpers/dom/safePlay';
import {_tgico} from '../helpers/tgico';
import Icon from './icon';
import setCurrentTime from '../helpers/dom/setCurrentTime';
import makeError from '../helpers/makeError';

const UNMOUNT_PRELOADER = true;

rootScope.addEventListener('messages_media_read', ({mids, peerId}) => {
  mids.forEach((mid) => {
    const attr = `[data-mid="${mid}"][data-peer-id="${peerId}"]`;
    (Array.from(document.querySelectorAll(`audio-element.is-unread${attr}, .media-round.is-unread${attr}`)) as AudioElement[]).forEach((elem) => {
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

  return result;
}

function createWaveformBars(waveform: Uint8Array, duration: number) {
  const barWidth = 2;
  const barMargin = 2;
  const barHeightMin = 4;
  const barHeightMax = mediaSizes.isMobile && false ? 16 : 23;

  const minW = mediaSizes.isMobile ? 152 : 190;
  const maxW = mediaSizes.isMobile ? 190 : 256;
  const availW = clamp(duration / 60 * maxW, minW, maxW);

  const normValue = Math.max(...waveform);
  const wfSize = waveform.length;
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

      const h = `<rect class="audio-waveform-bar" x="${barX}" y="${barHeightMax - bar_value}" width="${barWidth}" height="${bar_value}" rx="1" ry="1"></rect>`;
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

  let container: HTMLElement, svg: SVGSVGElement;

  if(!html) {

  } else {
    container = document.createElement('div');
    container.classList.add('audio-waveform');

    svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.classList.add('audio-waveform-bars');
    svg.setAttributeNS(null, 'width', '' + availW);
    svg.setAttributeNS(null, 'height', '' + barHeightMax);
    svg.setAttributeNS(null, 'viewBox', `0 0 ${availW} ${barHeightMax}`);
    svg.insertAdjacentHTML('beforeend', html);

    container.append(svg);
  }

  return {svg, container, availW};
}

async function wrapVoiceMessage(audioEl: AudioElement) {
  audioEl.classList.add('is-voice');

  const message = audioEl.message;
  const doc = getMediaFromMessage(message) as MyDocument;

  if(message.pFlags.out) {
    audioEl.classList.add('is-out');
  }

  let waveform = (doc.attributes.find((attribute) => attribute._ === 'documentAttributeAudio') as DocumentAttribute.documentAttributeAudio)?.waveform || new Uint8Array([]);
  waveform = decodeWaveform(waveform.slice(0, 63));

  const {svg, container: svgContainer, availW} = createWaveformBars(waveform, doc.duration);

  let fakeSvgContainer: HTMLElement;
  if(svgContainer) {
    fakeSvgContainer = svgContainer.cloneNode(true) as HTMLElement;
    fakeSvgContainer.classList.add('audio-waveform-fake');
    svgContainer.classList.add('audio-waveform-background');
  }

  const waveformContainer = document.createElement('div');
  waveformContainer.classList.add('audio-waveform-container');

  if(svgContainer) {
    waveformContainer.append(svgContainer, fakeSvgContainer);
  }

  const timeDiv = document.createElement('div');
  timeDiv.classList.add('audio-time');
  audioEl.append(waveformContainer, timeDiv);

  if(audioEl.customAudioToTextButton) {
    audioEl.classList.add('can-transcribe');
    audioEl.append(audioEl.customAudioToTextButton);
  } else if(audioEl.transcriptionState !== undefined) {
    audioEl.classList.add('can-transcribe');
    const speechRecognitionDiv = document.createElement('div');
    speechRecognitionDiv.classList.add('audio-to-text-button');
    const speechRecognitionIcon = Icon('transcribe');
    const speechRecognitionLoader = document.createElement('div');
    speechRecognitionLoader.classList.add('loader');
    speechRecognitionLoader.innerHTML = '<svg class="audio-transcribe-outline" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 24"><rect class="audio-transcribe-outline-rect" fill="transparent" stroke-width="3" stroke-linejoin="round" rx="6" ry="6" stroke="var(--message-primary-color)" stroke-dashoffset="1" stroke-dasharray="32,68" width="32" height="24"></rect></svg>'
    speechRecognitionDiv.append(speechRecognitionIcon);

    speechRecognitionDiv.onclick = () => {
      const speechTextDiv = (findUpClassName(audioEl, 'document-wrapper') || findUpClassName(audioEl, 'quote-text')).querySelector<HTMLElement>('.audio-transcribed-text');
      if(audioEl.transcriptionState === 0) {
        if(speechTextDiv) {
          speechTextDiv.classList.remove('hide');
          speechRecognitionIcon.classList.remove(_tgico('transcribe'));
          speechRecognitionIcon.classList.add(_tgico('up'));
          // TODO: State to enum
          audioEl.transcriptionState = 2;
        } else {
          const message = audioEl.message;
          if(message.pFlags.is_outgoing) {
            return;
          }

          audioEl.transcriptionState = 1;
          !speechRecognitionLoader.parentElement && speechRecognitionDiv.append(speechRecognitionLoader);
          doubleRaf().then(() => {
            if(audioEl.transcriptionState === 1) {
              speechRecognitionLoader.classList.add('active');
            }
          });

          audioEl.managers.appMessagesManager.transcribeAudio(message).catch(noop);
        }
      } else if(audioEl.transcriptionState === 2) {
        // Hide transcription
        speechTextDiv.classList.add('hide');
        speechRecognitionIcon.classList.remove(_tgico('up'));
        speechRecognitionIcon.classList.add(_tgico('transcribe'));
        audioEl.transcriptionState = 0;
      }
    };

    audioEl.append(speechRecognitionDiv);
  }

  let progress = svg as any as HTMLElement, progressLine: MediaProgressLine;
  if(!progress) {
    progressLine = new MediaProgressLine();

    waveformContainer.append(progressLine.container);
  }

  const onLoad = () => {
    let audio = audioEl.audio;

    const setAnimation = () => {
      animateSingle(() => {
        if(!audio) return false;
        onTimeUpdate();
        return !audio.paused;
      }, audioEl);
    };

    const onTimeUpdate = () => {
      if(fakeSvgContainer) {
        fakeSvgContainer.style.width = (audio.currentTime / audio.duration * 100) + '%';
      }
    };

    if(!audio.paused || (audio.currentTime > 0 && audio.currentTime !== audio.duration)) {
      onTimeUpdate();
    }

    const throttledTimeUpdate = throttleWithRaf(onTimeUpdate);
    audioEl.addAudioListener('timeupdate', throttledTimeUpdate);
    audioEl.addAudioListener('ended', throttledTimeUpdate);
    audioEl.addAudioListener('play', setAnimation);

    progress && audioEl.readyPromise.then(() => {
      let mousedown = false, mousemove = false;
      progress.addEventListener('mouseleave', (e) => {
        if(mousedown) {
          audioEl.togglePlay(undefined, true);
          mousedown = false;
        }
        mousemove = false;
      });
      progress.addEventListener('mousemove', (e) => {
        mousemove = true;
        if(mousedown) scrub(e);
      });
      progress.addEventListener('mousedown', (e) => {
        e.preventDefault();
        if(e.button !== 0) return;
        if(!audio.paused) {
          audioEl.togglePlay(undefined, false);
        }

        scrub(e);
        mousedown = true;
      });
      progress.addEventListener('mouseup', (e) => {
        if(mousemove && mousedown) {
          audioEl.togglePlay(undefined, true);
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
        setCurrentTime(audio, scrubTime);
      }
    }, noop);

    !progress && progressLine.setMedia({
      media: audio,
      streamable: doc.supportsStreaming,
      duration: doc.duration
    });

    return () => {
      progress?.remove();
      progress = null;
      audio = null;
    };
  };

  return onLoad;
}

async function wrapAudio(audioEl: AudioElement) {
  const withTime = audioEl.withTime;

  const message = audioEl.message;
  const doc = getMediaFromMessage(message) as MyDocument;

  const isVoice = doc.type === 'voice' || doc.type === 'round';
  const descriptionEl = document.createElement('div');
  descriptionEl.classList.add('audio-description');

  const audioAttribute = doc.attributes.find((attr) => attr._ === 'documentAttributeAudio') as DocumentAttribute.documentAttributeAudio;

  if(!isVoice) {
    const parts: (Node | string)[] = [];
    if(audioAttribute?.performer) {
      parts.push(wrapEmojiText(audioAttribute.performer));
    }

    if(withTime) {
      parts.push(formatFullSentTime(message.date));
    } else if(!parts.length) {
      parts.push(formatBytes(doc.size));
    }

    if(audioEl.showSender) {
      parts.push(await wrapSenderToPeer(message));
    }

    descriptionEl.append(' • ', ...joinElementsWith(parts, ' • '));
  }

  const html = `
  <div class="audio-details">
    <div class="audio-title"></div>
    <div class="audio-subtitle"><div class="audio-time"></div></div>
  </div>`;
  audioEl.insertAdjacentHTML('beforeend', html);

  const titleEl = audioEl.querySelector('.audio-title') as HTMLElement;

  const middleEllipsisEl = new MiddleEllipsisElement();
  middleEllipsisEl.dataset.fontWeight = audioEl.dataset.fontWeight;
  middleEllipsisEl.dataset.fontSize = audioEl.dataset.fontSize;
  middleEllipsisEl.dataset.sizeType = audioEl.dataset.sizeType;
  (middleEllipsisEl as any).getSize = (audioEl as any).getSize;
  if(isVoice) {
    middleEllipsisEl.append(await wrapSenderToPeer(message));
  } else {
    setInnerHTML(middleEllipsisEl, wrapEmojiText(audioAttribute?.title ?? doc.file_name));
  }

  titleEl.append(middleEllipsisEl);

  if(audioEl.showSender) {
    titleEl.append(wrapSentTime(message));
  }

  const subtitleDiv = audioEl.querySelector('.audio-subtitle') as HTMLDivElement;
  subtitleDiv.append(descriptionEl);

  const onLoad = () => {
    let launched = false;

    let progressLine = new MediaProgressLine();
    progressLine.setMedia({
      media: audioEl.audio,
      streamable: doc.supportsStreaming,
      duration: doc.duration
    });

    audioEl.addAudioListener('ended', () => {
      audioEl.classList.remove('audio-show-progress');
      // Reset subtitle
      subtitleDiv.lastChild.replaceWith(descriptionEl);
      launched = false;
    });

    const onPlay = () => {
      if(!launched) {
        audioEl.classList.add('audio-show-progress');
        launched = true;

        if(progressLine) {
          subtitleDiv.lastChild.replaceWith(progressLine.container);
        }
      }
    };

    audioEl.addAudioListener('play', onPlay);

    if(!audioEl.audio.paused || audioEl.audio.currentTime > 0) {
      onPlay();
    }

    return () => {
      progressLine.removeListeners();
      progressLine.container.remove();
      progressLine = null;
    };
  };

  return onLoad;
}

function constructDownloadPreloader(tryAgainOnFail = true) {
  const preloader = new ProgressivePreloader({cancelable: true, tryAgainOnFail});
  preloader.construct();

  if(!tryAgainOnFail) {
    preloader.circle.setAttributeNS(null, 'r', '23');
    preloader.totalLength = 143.58203125;
  }

  return preloader;
}

export const findMediaTargets = (anchor: HTMLElement, anchorMid: number/* , useSearch: boolean */) => {
  let prev: MediaItem[], next: MediaItem[];
  // if(anchor.classList.contains('search-super-item') || !useSearch) {
  const isBubbles = !anchor.classList.contains('search-super-item');
  const container = findUpClassName(anchor, !isBubbles ? 'tabs-tab' : 'bubbles-inner');
  if(container) {
    const attr = `:not([data-is-outgoing="1"])`;
    const justAudioSelector = `.audio:not(.is-voice)${attr}`;
    let selectors: string[];
    if(!anchor.matches(justAudioSelector)) {
      selectors = [`.audio.is-voice${attr}`, `.media-round${attr}`];
    } else {
      selectors = [justAudioSelector];
    }

    if(isBubbles) {
      const prefix = '.bubble:not(.webpage) ';
      selectors = selectors.map((s) => prefix + s);
    }

    const selector = selectors.join(', ');

    let elements = Array.from(container.querySelectorAll(selector)) as HTMLElement[];
    elements = elements.filter((element) => element === anchor || element.matches(':not([data-to-be-skipped="1"])'));
    const idx = elements.indexOf(anchor);

    const mediaItems: MediaItem[] = elements.map((element) => ({peerId: element.dataset.peerId.toPeerId(), mid: +element.dataset.mid}));

    prev = mediaItems.slice(0, idx);
    next = mediaItems.slice(idx + 1);
  }
  // }

  if((next.length && next[0].mid < anchorMid) || (prev.length && prev[prev.length - 1].mid > anchorMid)) {
    [prev, next] = [next.reverse(), prev.reverse()];
  }

  // prev = next = undefined;

  return [prev, next];
};

export default class AudioElement extends HTMLElement {
  public audio: HTMLMediaElement;
  public preloader: ProgressivePreloader;
  public message: Message.message;
  public withTime = false;
  public voiceAsMusic = false;
  public searchContext: MediaSearchContext;
  public showSender = false;
  public noAutoDownload: boolean;
  public lazyLoadQueue: LazyLoadQueue;
  public loadPromises: Promise<any>[];
  public managers: AppManagers;
  public transcriptionState: number;
  public uploadingFileName: string;
  public shouldWrapAsVoice?: boolean;
  public customAudioToTextButton?: HTMLElement;

  private listenerSetter = new ListenerSetter();
  private onTypeDisconnect: () => void;
  public onLoad: (autoload?: boolean) => void;
  public readyPromise: CancellablePromise<void>;
  public load: (shouldPlay: boolean, controlledAutoplay?: boolean) => void;

  public async render() {
    this.classList.add('audio');
    this.managers = rootScope.managers;

    this.dataset.mid = '' + this.message.mid;
    this.dataset.peerId = '' + this.message.peerId;

    const doc = getMediaFromMessage(this.message) as MyDocument;
    const isRealVoice = doc.type === 'voice';
    const isVoice = !this.voiceAsMusic && isRealVoice;
    const isOutgoing = this.message.pFlags.is_outgoing;
    const uploadingFileName = this.uploadingFileName ?? this.message?.uploadingFileName?.[0];

    const getDurationStr = () => {
      const duration = this.audio && this.audio.readyState >= this.audio.HAVE_CURRENT_DATA ? this.audio.duration : doc.duration;
      return toHHMMSS(duration | 0);
    };

    this.innerHTML = `
    <div class="audio-toggle audio-ico">
      <div class="audio-play-icon">
        <div class="part one" x="0" y="0" fill="#fff"></div>
        <div class="part two" x="0" y="0" fill="#fff"></div>
      </div>
    </div>`;

    const toggle = this.firstElementChild as HTMLElement;

    const downloadDiv = document.createElement('div');
    downloadDiv.classList.add('audio-download');

    const isUnread = doc.type !== 'audio' && this.message && this.message.pFlags.media_unread;
    if(isUnread) {
      this.classList.add('is-unread');
    }

    if(uploadingFileName) {
      this.classList.add('is-outgoing');
      this.append(downloadDiv);
    }

    const onTypeLoad = await (isVoice || this.shouldWrapAsVoice ? wrapVoiceMessage(this) : wrapAudio(this));

    const audioTimeDiv = this.querySelector('.audio-time') as HTMLDivElement;
    audioTimeDiv.textContent = getDurationStr();

    const onLoad = this.onLoad = (autoload: boolean) => {
      this.onLoad = undefined;

      const audio = this.audio ??= appMediaPlaybackController.addMedia(this.message, autoload) as HTMLMediaElement;

      const readyPromise = this.readyPromise = deferredPromise<void>();
      if(this.audio.readyState >= this.audio.HAVE_CURRENT_DATA) readyPromise.resolve();
      else {
        this.addAudioListener('canplay', () => readyPromise.resolve(), {once: true});
      }

      this.onTypeDisconnect = onTypeLoad();

      const getTimeStr = () => toHHMMSS(audio.currentTime | 0) + (isVoice ? (' / ' + getDurationStr()) : '');

      const onPlay = () => {
        audioTimeDiv.innerText = getTimeStr();
        toggle.classList.toggle('playing', !audio.paused);
      };

      if(!audio.paused || (audio.currentTime > 0 && audio.currentTime !== audio.duration)) {
        onPlay();
      }

      const onToggleClick = (e: MouseEvent) => {
        this.togglePlay(e);
      };

      toggle.addEventListener('click', onToggleClick);
      // attachClickEvent(toggle, onToggleClick, {listenerSetter: this.listenerSetter});

      this.addAudioListener('ended', () => {
        toggle.classList.remove('playing');
        audioTimeDiv.innerText = getDurationStr();
      });

      this.addAudioListener('timeupdate', () => {
        if((!audio.currentTime && audio.paused) || appMediaPlaybackController.isSafariBuffering(audio)) return;
        audioTimeDiv.innerText = getTimeStr();
      });

      this.addAudioListener('pause', () => {
        toggle.classList.remove('playing');
      });

      this.addAudioListener('play', onPlay);
    };

    if(doc.thumbs?.length) {
      const imgs: HTMLElement[] = [];
      const wrapped = await wrapPhoto({
        photo: doc,
        message: null,
        container: toggle,
        boxWidth: 48,
        boxHeight: 48,
        loadPromises: this.loadPromises,
        withoutPreloader: true,
        lazyLoadQueue: this.lazyLoadQueue
      });
      toggle.style.width = toggle.style.height = '';
      if(wrapped.images.thumb) imgs.push(wrapped.images.thumb);
      if(wrapped.images.full) imgs.push(wrapped.images.full);

      this.classList.add('audio-with-thumb');
      imgs.forEach((img) => img.classList.add('audio-thumb'));
    }

    if(!isOutgoing) {
      let preloader: ProgressivePreloader = this.preloader;

      const autoDownload = doc.type !== 'audio'/*  || !this.noAutoDownload */;
      onLoad(autoDownload);

      const r = this.load = (shouldPlay: boolean, controlledAutoplay?: boolean) => {
        this.load = undefined;

        if(this.audio.src) {
          return;
        }

        appMediaPlaybackController.resolveWaitingForLoadMedia(this.message.peerId, this.message.mid, this.message.pFlags.is_scheduled);

        this.onDownloadInit(shouldPlay);

        if(!preloader) {
          if(doc.supportsStreaming) {
            this.classList.add('corner-download');

            let pauseListener: Listener;
            const onPlay = () => {
              const preloader = constructDownloadPreloader(false);
              const deferred = deferredPromise<void>();
              deferred.notifyAll({done: 75, total: 100});
              deferred.catch(() => {
                this.audio.pause();
                appMediaPlaybackController.willBePlayed(undefined);
              });
              deferred.cancel = () => {
                deferred.cancel = noop;
                deferred.reject(makeError('CANCELED'));
              };
              preloader.attach(downloadDiv, false, deferred);

              pauseListener = this.addAudioListener('pause', () => {
                deferred.cancel();
              }, {once: true}) as any;

              this.onDownloadInit(shouldPlay);
            };

            /* if(!this.audio.paused) {
              onPlay();
            } */

            const playListener: any = this.addAudioListener('play', onPlay);
            this.readyPromise.then(() => {
              this.listenerSetter.remove(playListener);
              pauseListener && this.listenerSetter.remove(pauseListener);
            });
          } else {
            preloader = constructDownloadPreloader();

            if(!shouldPlay) {
              this.readyPromise = deferredPromise();
            }

            const load = () => {
              this.onDownloadInit(shouldPlay);

              const download = appDownloadManager.downloadMediaURL({media: doc});

              if(!shouldPlay) {
                download.then(() => {
                  this.readyPromise.resolve();
                });
              }

              preloader.attach(downloadDiv, false, download);
              return {download};
            };

            preloader.setDownloadFunction(load);
            load();
          }
        }

        if(this.classList.contains('corner-download')) {
          toggle.append(downloadDiv);
        } else {
          this.append(downloadDiv);
        }

        this.classList.add('downloading');

        this.readyPromise.then(() => {
          if(UNMOUNT_PRELOADER) {
            this.classList.remove('downloading');
            downloadDiv.classList.add('downloaded');
            setTimeout(() => {
              downloadDiv.remove();
            }, 200);
          }

          // setTimeout(() => {
          // release loaded audio
          if(!controlledAutoplay && appMediaPlaybackController.willBePlayedMedia === this.audio) {
            safePlay(this.audio);
            appMediaPlaybackController.willBePlayed(undefined);
          }
          // }, 10e3);
        });
      };

      if(!this.audio?.src) {
        if(autoDownload) {
          r(false);
        } else {
          attachClickEvent(toggle, () => {
            r(true);
          }, {once: true, listenerSetter: this.listenerSetter});
        }
      }
    } else if(uploadingFileName) {
      this.classList.add('downloading');
      this.preloader = constructDownloadPreloader(false);
      const promise = appDownloadManager.getUpload(uploadingFileName);
      this.preloader.attachPromise(promise);
      this.dataset.isOutgoing = '1';
      this.preloader.attach(downloadDiv, false);
      promise.then(() => {
        this.classList.remove('downloading');
        downloadDiv.classList.add('downloaded');
        setTimeout(() => {
          downloadDiv.remove();
        }, 200);
      });
      // onLoad();
    }
  }

  private onDownloadInit(shouldPlay: boolean) {
    if(shouldPlay) {
      appMediaPlaybackController.willBePlayed(this.audio); // prepare for loading audio

      if(IS_SAFARI && !this.audio.autoplay) {
        this.audio.autoplay = true;
      }
    }
  }

  public togglePlay(e?: Event, paused = this.audio.paused) {
    e && cancelEvent(e);

    if(paused) {
      this.setTargetsIfNeeded();
      safePlay(this.audio);
    } else {
      this.audio.pause();
    }
  }

  public setTargetsIfNeeded() {
    const hadSearchContext = !!this.searchContext;
    if(appMediaPlaybackController.setSearchContext(this.searchContext || {
      peerId: NULL_PEER_ID,
      inputFilter: {_: 'inputMessagesFilterEmpty'},
      useSearch: false
    })) {
      const thisTarget = this.dataset.toBeSkipped ? this.audio.parentElement : this;
      const [prev, next] = !hadSearchContext ? [] : findMediaTargets(thisTarget, this.message.mid/* , this.searchContext.useSearch */);
      appMediaPlaybackController.setTargets({peerId: this.message.peerId, mid: this.message.mid}, prev, next);
    }
  }

  public playWithTimestamp(timestamp: number) {
    this.load?.(true);
    setCurrentTime(this.audio, timestamp);
    this.togglePlay(undefined, true);
    // appMediaPlaybackController.willBePlayed(this.audio); // prepare for loading audio
    // this.readyPromise.then(() => {
    //   if(appMediaPlaybackController.willBePlayedMedia !== this.audio && this.audio.paused) {
    //     return;
    //   }

    //   appMediaPlaybackController.willBePlayed(undefined);

    //   this.audio.currentTime = timestamp;
    //   this.togglePlay(undefined, true);
    // });
  }

  get addAudioListener() {
    return this.listenerSetter.add(this.audio);
  }

  disconnectedCallback() {
    setTimeout(() => {
      if(this.isConnected) {
        return;
      }

      if(this.onTypeDisconnect) {
        this.onTypeDisconnect();
        this.onTypeDisconnect = null;
      }

      if(this.readyPromise) {
        this.readyPromise.reject();
      }

      if(this.listenerSetter) {
        this.listenerSetter.removeAll();
        this.listenerSetter = null;
      }

      if(this.preloader) {
        this.preloader = null;
      }
    }, 100);
  }
}

customElements.define('audio-element', AudioElement);
