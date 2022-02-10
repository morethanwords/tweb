/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import appMediaPlaybackController from "../components/appMediaPlaybackController";
import { IS_APPLE_MOBILE } from "../environment/userAgent";
import { IS_TOUCH_SUPPORTED } from "../environment/touchSupport";
import RangeSelector from "../components/rangeSelector";
import { onMediaLoad } from "../helpers/files";
import { cancelEvent } from "../helpers/dom/cancelEvent";
import ListenerSetter from "../helpers/listenerSetter";
import ButtonMenu from "../components/buttonMenu";
import { ButtonMenuToggleHandler } from "../components/buttonMenuToggle";
import rootScope from "./rootScope";
import { GrabEvent } from "../helpers/dom/attachGrabListeners";
import { attachClickEvent } from "../helpers/dom/clickEvent";
import ControlsHover from "../helpers/dom/controlsHover";
import { addFullScreenListener, cancelFullScreen, isFullScreen, requestFullScreen } from "../helpers/dom/fullScreen";

export class MediaProgressLine extends RangeSelector {
  protected filledLoad: HTMLDivElement;

  protected progressRAF = 0;

  protected media: HTMLMediaElement;
  protected streamable: boolean;

  constructor(media?: HTMLAudioElement | HTMLVideoElement, streamable?: boolean, withTransition?: boolean, useTransform?: boolean) {
    super({
      step: 1000 / 60 / 1000, 
      min: 0, 
      max: 1, 
      withTransition, 
      useTransform
    }, 0);

    if(media) {
      this.setMedia(media, streamable);
    }
  }

  public setMedia(media: HTMLMediaElement, streamable = false) {
    if(this.media) {
      this.removeListeners();
    }

    if(streamable && !this.filledLoad) {
      this.filledLoad = document.createElement('div');
      this.filledLoad.classList.add('progress-line__filled', 'progress-line__loaded');
      this.container.prepend(this.filledLoad);
      //this.setLoadProgress();
    } else if(this.filledLoad) {
      this.filledLoad.classList.toggle('hide', !streamable);
    }

    this.media = media;
    this.streamable = streamable;
    if(!media.paused || media.currentTime > 0) {
      this.onPlay();
    }

    let wasPlaying = false;
    this.setSeekMax();
    this.setListeners();
    this.setHandlers({
      onMouseDown: () => {
        wasPlaying = !this.media.paused;
        wasPlaying && this.media.pause();
      },

      onMouseUp: (e) => {
        // cancelEvent(e.event);
        wasPlaying && this.media.play();
      }
    });
  }

  protected onLoadedData = () => {
    this.max = this.media.duration;
    this.seek.setAttribute('max', '' + this.max);
  };

  protected onEnded = () => {
    this.setProgress();
  };

  protected onPlay = () => {
    let r = () => {
      this.setProgress();

      this.progressRAF = this.media.paused ? 0 : window.requestAnimationFrame(r);
    };

    if(this.progressRAF) {
      window.cancelAnimationFrame(this.progressRAF);
    }

    if(this.streamable) {
      this.setLoadProgress();
    }

    this.progressRAF = window.requestAnimationFrame(r);
  };

  protected onTimeUpdate = () => {
    if(this.media.paused) {
      this.setProgress();

      if(this.streamable) {
        this.setLoadProgress();
      }
    }
  };

  protected onProgress = (e: Event) => {
    this.setLoadProgress();
  };

  protected scrub(e: GrabEvent) {
    const scrubTime = super.scrub(e);
    this.media.currentTime = scrubTime;
    return scrubTime;
  }

  protected setLoadProgress() {
    if(appMediaPlaybackController.isSafariBuffering(this.media)) return;
    const buf = this.media.buffered;
    const numRanges = buf.length;

    const currentTime = this.media.currentTime;
    let nearestStart = 0, end = 0;
    for(let i = 0; i < numRanges; ++i) {
      const start = buf.start(i);
      if(currentTime >= start && start >= nearestStart) {
        nearestStart = start;
        end = buf.end(i);
      }

      //console.log('onProgress range:', i, buf.start(i), buf.end(i), this.media);
    }

    //console.log('onProgress correct range:', nearestStart, end, this.media);

    const percents = this.media.duration ? end / this.media.duration : 0;
    this.filledLoad.style.width = (percents * 100) + '%';
    //this.filledLoad.style.transform = 'scaleX(' + percents + ')';
  }

  protected setSeekMax() {
    this.max = this.media.duration || 0;
    if(this.max > 0) {
      this.onLoadedData();
    } else {
      this.media.addEventListener('loadeddata', this.onLoadedData);
    }
  }

  public setProgress() {
    if(appMediaPlaybackController.isSafariBuffering(this.media)) return;
    const currentTime = this.media.currentTime;

    super.setProgress(currentTime);
  }

  public setListeners() {
    super.setListeners();
    this.media.addEventListener('ended', this.onEnded);
    this.media.addEventListener('play', this.onPlay);
    this.media.addEventListener('timeupdate', this.onTimeUpdate);
    this.streamable && this.media.addEventListener('progress', this.onProgress);
  }

  public removeListeners() {
    super.removeListeners();

    this.media.removeEventListener('loadeddata', this.onLoadedData);
    this.media.removeEventListener('ended', this.onEnded);
    this.media.removeEventListener('play', this.onPlay);
    this.media.removeEventListener('timeupdate', this.onTimeUpdate);
    this.streamable && this.media.removeEventListener('progress', this.onProgress);

    if(this.progressRAF) {
      window.cancelAnimationFrame(this.progressRAF);
      this.progressRAF = 0;
    }
  }
}

export class VolumeSelector extends RangeSelector {
  public btn: HTMLElement;
  protected volumeSvg: HTMLElement;

  constructor(protected listenerSetter: ListenerSetter, protected vertical = false) {
    super({
      step: 0.01, 
      min: 0, 
      max: 1,
      vertical
    }, 1);

    this.setListeners();
    this.setHandlers({
      onScrub: currentTime => {
        const value = Math.max(Math.min(currentTime, 1), 0);

        //console.log('volume scrub:', currentTime, value);

        appMediaPlaybackController.muted = false;
        appMediaPlaybackController.volume = value;
      },

      /* onMouseUp: (e) => {
        cancelEvent(e.event);
      } */
    });

    this.btn = document.createElement('div');
    this.btn.classList.add('player-volume');

    this.btn.innerHTML = `
    <svg class="player-volume__icon" focusable="false" viewBox="0 0 24 24" aria-hidden="true"></svg>
    `;
    this.btn.classList.add('btn-icon');
    this.volumeSvg = this.btn.firstElementChild as HTMLElement;

    this.btn.append(this.container);

    attachClickEvent(this.volumeSvg, this.onMuteClick, {listenerSetter: this.listenerSetter});
    this.listenerSetter.add(rootScope)('media_playback_params', this.setVolume);

    this.setVolume();
  }

  private onMuteClick = (e?: Event) => {
    e && cancelEvent(e);
    appMediaPlaybackController.muted = !appMediaPlaybackController.muted;
  };

  private setVolume = () => {
    // const volume = video.volume;
    const {volume, muted} = appMediaPlaybackController;
    let d: string;
    if(!volume || muted) {
      d = `M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z`;
    } else if(volume > .5) {
      d = `M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z`;
    } else if(volume > 0 && volume < .25) {
      d = `M7 9v6h4l5 5V4l-5 5H7z`;
    } else {
      d = `M18.5 12c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM5 9v6h4l5 5V4L9 9H5z`;
    }

    try {
      this.volumeSvg.innerHTML = `<path d="${d}"></path>`;
    } catch(err) {}

    if(!this.mousedown) {
      this.setProgress(muted ? 0 : volume);
    }
  };
}

export default class VideoPlayer extends ControlsHover {
  private static PLAYBACK_RATES = [0.5, 1, 1.5, 2];
  private static PLAYBACK_RATES_ICONS = ['playback_05', 'playback_1x', 'playback_15', 'playback_2x'];

  protected wrapper: HTMLDivElement;
  protected progress: MediaProgressLine;
  protected skin: 'default';

  protected listenerSetter: ListenerSetter;
  protected playbackRateButton: HTMLElement;

  /* protected videoParent: HTMLElement;
  protected videoWhichChild: number; */

  constructor(protected video: HTMLVideoElement, play = false, streamable = false, duration?: number) {
    super();

    this.wrapper = document.createElement('div');
    this.wrapper.classList.add('ckin__player');

    this.listenerSetter = new ListenerSetter();

    this.setup({
      element: this.wrapper, 
      listenerSetter: this.listenerSetter, 
      canHideControls: () => {
        return !this.video.paused && (!this.playbackRateButton || !this.playbackRateButton.classList.contains('menu-open'));
      },
      showOnLeaveToClassName: 'media-viewer-caption'
    });

    video.parentNode.insertBefore(this.wrapper, video);
    this.wrapper.appendChild(video);

    this.skin = 'default';

    this.stylePlayer(duration);
    this.setBtnMenuToggle();

    if(this.skin === 'default') {
      const controls = this.wrapper.querySelector('.default__controls.ckin__controls') as HTMLDivElement;
      this.progress = new MediaProgressLine(video, streamable);
      controls.prepend(this.progress.container);
    }

    if(play/*  && video.paused */) {
      const promise = video.play();
      promise.catch((err: Error) => {
        if(err.name === 'NotAllowedError') {
          video.muted = true;
          video.autoplay = true;
          video.play();
        }
      }).finally(() => { // due to autoplay, play will not call
        this.wrapper.classList.toggle('is-playing', !this.video.paused);
      });
      //(this.wrapper.querySelector('.toggle') as HTMLButtonElement).click();
    }
  }

  private stylePlayer(initDuration: number) {
    const {wrapper, video, skin, listenerSetter} = this;

    wrapper.classList.add(skin);
  
    const html = this.buildControls();
    wrapper.insertAdjacentHTML('beforeend', html);
    let timeDuration: HTMLElement;
  
    if(skin === 'default') {
      this.playbackRateButton = this.wrapper.querySelector('.playback-rate') as HTMLElement;
      
      const toggle = wrapper.querySelectorAll('.toggle') as NodeListOf<HTMLElement>;
      const fullScreenButton = wrapper.querySelector('.fullscreen') as HTMLElement;
      const timeElapsed = wrapper.querySelector('#time-elapsed');
      timeDuration = wrapper.querySelector('#time-duration') as HTMLElement;
      timeDuration.innerHTML = String(video.duration | 0).toHHMMSS();

      const volumeSelector = new VolumeSelector(listenerSetter);

      const leftControls = wrapper.querySelector('.left-controls');
      volumeSelector.btn.classList.remove('btn-icon');
      leftControls.insertBefore(volumeSelector.btn, timeElapsed.parentElement);

      Array.from(toggle).forEach((button) => {
        listenerSetter.add(button)('click', () => {
          this.togglePlay();
        });
      });

      if(!IS_TOUCH_SUPPORTED) {
        listenerSetter.add(video)('click', () => {
          this.togglePlay();
        });

        listenerSetter.add(document)('keydown', (e: KeyboardEvent) => {
          if(rootScope.overlaysActive > 1) { // forward popup is active, etc
            return;
          }

          const {key, code} = e;

          let good = true;
          if(code === 'KeyF') {
            this.toggleFullScreen();
          } else if(code === 'KeyM') {
            appMediaPlaybackController.muted = !appMediaPlaybackController.muted;
          } else if(code === 'Space') {
            this.togglePlay();
          } else if(e.altKey && (code === 'Equal' || code === 'Minus')) {
            const add = code === 'Equal' ? 1 : -1;
            const playbackRate = appMediaPlaybackController.playbackRate;
            const idx = VideoPlayer.PLAYBACK_RATES.indexOf(playbackRate);
            const nextIdx = idx + add;
            if(nextIdx >= 0 && nextIdx < VideoPlayer.PLAYBACK_RATES.length) {
              appMediaPlaybackController.playbackRate = VideoPlayer.PLAYBACK_RATES[nextIdx];
            }
          } else if(wrapper.classList.contains('ckin__fullscreen') && (key === 'ArrowLeft' || key === 'ArrowRight')) {
            if(key === 'ArrowLeft') appMediaPlaybackController.seekBackward({action: 'seekbackward'});
            else appMediaPlaybackController.seekForward({action: 'seekforward'});
          } else {
            good = false;
          }

          if(good) {
            cancelEvent(e);
            return false;
          }
        });
      }
  
      /* player.addEventListener('click', (e) => {
        if(e.target !== player) {
          return;
        }

        this.togglePlay();
      }); */
  
      /* video.addEventListener('play', () => {
      }); */

      listenerSetter.add(video)('dblclick', () => {
        if(!IS_TOUCH_SUPPORTED) {
          this.toggleFullScreen();
        }
      });

      listenerSetter.add(fullScreenButton)('click', () => {
        this.toggleFullScreen();
      });

      addFullScreenListener(wrapper, this.onFullScreen.bind(this, fullScreenButton), listenerSetter);

      listenerSetter.add(video)('timeupdate', () => {
        timeElapsed.innerHTML = String(video.currentTime | 0).toHHMMSS();
      });

      listenerSetter.add(video)('play', () => {
        wrapper.classList.add('played');

        listenerSetter.add(video)('play', () => {
          this.hideControls(true);
        });
      }, {once: true});

      listenerSetter.add(video)('pause', () => {
        this.showControls(false);
      });

      listenerSetter.add(rootScope)('media_playback_params', () => {
        this.setPlaybackRateIcon();
      });
    }

    listenerSetter.add(video)('play', () => {
      wrapper.classList.add('is-playing');
    });

    listenerSetter.add(video)('pause', () => {
      wrapper.classList.remove('is-playing');
    });

    if(video.duration || initDuration) {
      timeDuration.innerHTML = String(Math.round(video.duration || initDuration)).toHHMMSS();
    } else {
      onMediaLoad(video).then(() => {
        timeDuration.innerHTML = String(Math.round(video.duration)).toHHMMSS();
      });
    }
  }

  protected togglePlay() {
    this.video[this.video.paused ? 'play' : 'pause']();
  }

  private buildControls() {
    const skin = this.skin;
    if(skin === 'default') {
      return `
      <button class="${skin}__button--big toggle tgico" title="Toggle Play"></button>
      <div class="${skin}__gradient-bottom ckin__controls"></div>
      <div class="${skin}__controls ckin__controls">
        <div class="bottom-controls">
          <div class="left-controls">
            <button class="btn-icon ${skin}__button toggle tgico" title="Toggle Video"></button>
            <div class="time">
              <time id="time-elapsed">0:00</time>
              <span> / </span>
              <time id="time-duration">0:00</time>
            </div>
          </div>
          <div class="right-controls">
            <button class="btn-icon ${skin}__button btn-menu-toggle playback-rate night" title="Playback Rate"></button>
            <button class="btn-icon ${skin}__button fullscreen tgico-fullscreen" title="Full Screen"></button>
          </div>
        </div>
      </div>`;
    }
  }

  protected setBtnMenuToggle() {
    const buttons: Parameters<typeof ButtonMenu>[0] = VideoPlayer.PLAYBACK_RATES.map((rate, idx) => {
      return { 
        // icon: VideoPlayer.PLAYBACK_RATES_ICONS[idx],
        regularText: rate + 'x', 
        onClick: () => {
          appMediaPlaybackController.playbackRate = rate;
        }
      };
    });
    const btnMenu = ButtonMenu(buttons);
    btnMenu.classList.add('top-left');
    ButtonMenuToggleHandler(this.playbackRateButton);
    this.playbackRateButton.append(btnMenu);

    this.setPlaybackRateIcon();
  }

  protected setPlaybackRateIcon() {
    const playbackRateButton = this.playbackRateButton;
    VideoPlayer.PLAYBACK_RATES_ICONS.forEach((className) => {
      className = 'tgico-' + className;
      playbackRateButton.classList.remove(className);
    });

    let idx = VideoPlayer.PLAYBACK_RATES.indexOf(appMediaPlaybackController.playbackRate);
    if(idx === -1) idx = VideoPlayer.PLAYBACK_RATES.indexOf(1);

    playbackRateButton.classList.add('tgico-' + VideoPlayer.PLAYBACK_RATES_ICONS[idx]);
  }
  
  protected toggleFullScreen() {
    const player = this.wrapper;

    // * https://caniuse.com/#feat=fullscreen
    if(IS_APPLE_MOBILE) {
      const video = this.video as any;
      video.webkitEnterFullscreen();
      video.enterFullscreen();
      return;
    }
    
    if(!isFullScreen()) {
      /* const videoParent = this.video.parentElement;
      const videoWhichChild = whichChild(this.video);
      const needVideoRemount = videoParent !== player;

      if(needVideoRemount) {
        this.videoParent = videoParent;
        this.videoWhichChild = videoWhichChild;
        player.prepend(this.video);
      } */
  
      requestFullScreen(player);
    } else {
      /* if(this.videoParent) {
        const {videoWhichChild, videoParent} = this;
        if(!videoWhichChild) {
          videoParent.prepend(this.video);
        } else {
          videoParent.insertBefore(this.video, videoParent.children[videoWhichChild]);
        }

        this.videoParent = null;
        this.videoWhichChild = -1;
      } */
  
      cancelFullScreen();
    }
  }
  
  protected onFullScreen(fullScreenButton: HTMLElement) {
    const isFull = isFullScreen();
    this.wrapper.classList.toggle('ckin__fullscreen', isFull);
    if(!isFull) {
      fullScreenButton.classList.remove('tgico-smallscreen');
      fullScreenButton.classList.add('tgico-fullscreen');
      fullScreenButton.setAttribute('title', 'Full Screen');
    } else {
      fullScreenButton.classList.remove('tgico-fullscreen');
      fullScreenButton.classList.add('tgico-smallscreen');
      fullScreenButton.setAttribute('title', 'Exit Full Screen');
    }
  }

  public removeListeners() {
    super.cleanup();
    this.listenerSetter.removeAll();
    this.progress.removeListeners();
  }
}
