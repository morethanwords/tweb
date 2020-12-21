import { cancelEvent } from "../helpers/dom";
import appMediaPlaybackController from "../components/appMediaPlaybackController";
import { isAppleMobile } from "../helpers/userAgent";
import { isTouchSupported } from "../helpers/touchSupport";

type SUPEREVENT = MouseEvent | TouchEvent;

export class ProgressLine {
  public container: HTMLDivElement;
  protected filled: HTMLDivElement;
  protected seek: HTMLInputElement;

  protected duration = 1;
  public mousedown = false;

  private events: Partial<{
    //onMouseMove: ProgressLine['onMouseMove'],
    onMouseDown: ProgressLine['onMouseDown'],
    onMouseUp: ProgressLine['onMouseUp'],
    onScrub: (scrubTime: number) => void
  }> = {};

  constructor(initialValue = 0) {
    this.container = document.createElement('div');
    this.container.classList.add('progress-line');

    this.filled = document.createElement('div');
    this.filled.classList.add('progress-line__filled');

    const seek = this.seek = document.createElement('input');
    seek.classList.add('progress-line__seek');
    seek.value = '' + initialValue;
    seek.setAttribute('min', '0');
    //seek.setAttribute('max', '0');
    seek.type = 'range';
    seek.step = '0.1';
    seek.max = '' + (this.duration * 1000);

    if(initialValue > 0) {
      this.setProgress(initialValue);
    }

    //this.setListeners();

    this.container.append(this.filled, seek);
  }

  public setHandlers(events: ProgressLine['events']) {
    this.events = events;
  }

  onMouseMove = (e: SUPEREVENT) => {
    this.mousedown && this.scrub(e);
  };

  onMouseDown = (e: SUPEREVENT) => {
    this.scrub(e);
    this.mousedown = true;
    this.events?.onMouseDown && this.events.onMouseDown(e);
  };

  onMouseUp = (e: SUPEREVENT) => {
    this.mousedown = false;
    this.events?.onMouseUp && this.events.onMouseUp(e);
  };

  public setListeners() {
    this.container.addEventListener('mousemove', this.onMouseMove);
    this.container.addEventListener('mousedown', this.onMouseDown);
    this.container.addEventListener('mouseup', this.onMouseUp);

    if(isTouchSupported) {
      this.container.addEventListener('touchmove', this.onMouseMove, {passive: true});
      this.container.addEventListener('touchstart', this.onMouseDown, {passive: true});
      this.container.addEventListener('touchend', this.onMouseUp, {passive: true});
    }
  }

  public setProgress(scrubTime: number) {
    this.setFilled(scrubTime);
    this.seek.value = '' + (scrubTime * 1000);
  }

  public setFilled(scrubTime: number) {
    let scaleX = scrubTime / this.duration;
    scaleX = Math.max(0, Math.min(1, scaleX));
    this.filled.style.transform = 'scaleX(' + scaleX + ')';
  }

  protected scrub(e: SUPEREVENT) {
    let offsetX: number;
    if(e instanceof MouseEvent) {
      offsetX = e.offsetX;
    } else { // touch
      const rect = (e.target as HTMLElement).getBoundingClientRect();
      offsetX = e.targetTouches[0].pageX - rect.left;
    }

    const scrubTime = offsetX / this.container.offsetWidth * this.duration;

    this.setFilled(scrubTime);

    this.events?.onScrub && this.events.onScrub(scrubTime);
    return scrubTime;
  }

  public removeListeners() {
    this.container.removeEventListener('mousemove', this.onMouseMove);
    this.container.removeEventListener('mousedown', this.onMouseDown);
    this.container.removeEventListener('mouseup', this.onMouseUp);

    if(isTouchSupported) {
      this.container.removeEventListener('touchmove', this.onMouseMove);
      this.container.removeEventListener('touchstart', this.onMouseDown);
      this.container.removeEventListener('touchend', this.onMouseUp);
    }

    this.events = {};
  }
}

export class MediaProgressLine extends ProgressLine {
  private filledLoad: HTMLDivElement;
  
  private stopAndScrubTimeout = 0;
  private progressRAF = 0;

  constructor(private media: HTMLAudioElement | HTMLVideoElement, private streamable = false) {
    super();

    if(streamable) {
      this.filledLoad = document.createElement('div');
      this.filledLoad.classList.add('progress-line__filled', 'progress-line__loaded');
      this.container.prepend(this.filledLoad);
      //this.setLoadProgress();
    }

    if(!media.paused || media.currentTime > 0) {
      this.onPlay();
    }

    this.setSeekMax();
    this.setListeners();
    this.setHandlers({
      onMouseDown: (e: SUPEREVENT) => {
        //super.onMouseDown(e);
    
        //Таймер для того, чтобы стопать видео, если зажал мышку и не отпустил клик
        if(this.stopAndScrubTimeout) { // возможно лишнее
          clearTimeout(this.stopAndScrubTimeout);
        }
    
        this.stopAndScrubTimeout = window.setTimeout(() => {
          !this.media.paused && this.media.pause();
          this.stopAndScrubTimeout = 0;
        }, 150);
      },

      onMouseUp: (e: SUPEREVENT) => {
        //super.onMouseUp(e);
    
        if(this.stopAndScrubTimeout) {
          clearTimeout(this.stopAndScrubTimeout);
          this.stopAndScrubTimeout = 0;
        }
    
        this.media.paused && this.media.play();
      }
    })
  }

  onLoadedData = () => {
    this.duration = this.media.duration;
    this.seek.setAttribute('max', '' + this.duration * 1000);
  };

  onEnded = () => {
    this.setProgress();
  };

  onPlay = () => {
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

  onProgress = (e: Event) => {
    this.setLoadProgress();
  };

  protected scrub(e: MouseEvent) {
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
    this.filledLoad.style.transform = 'scaleX(' + percents + ')';
  }

  protected setSeekMax() {
    this.duration = this.media.duration;
    if(this.duration > 0) {
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
    this.streamable && this.media.addEventListener('progress', this.onProgress);
  }

  public removeListeners() {
    super.removeListeners();

    this.media.removeEventListener('loadeddata', this.onLoadedData);
    this.media.removeEventListener('ended', this.onEnded);
    this.media.removeEventListener('play', this.onPlay);
    this.streamable && this.media.removeEventListener('progress', this.onProgress);

    if(this.stopAndScrubTimeout) {
      clearTimeout(this.stopAndScrubTimeout);
    }

    if(this.progressRAF) {
      window.cancelAnimationFrame(this.progressRAF);
    }
  }
}

let lastVolume = 1, muted = !lastVolume;
export default class VideoPlayer {
  public wrapper: HTMLDivElement;
  public progress: MediaProgressLine;
  private skin: string;

  /* private videoParent: HTMLElement;
  private videoWhichChild: number; */

  constructor(public video: HTMLVideoElement, play = false, streamable = false) {
    this.wrapper = document.createElement('div');
    this.wrapper.classList.add('ckin__player');

    video.parentNode.insertBefore(this.wrapper, video);
    this.wrapper.appendChild(video);

    this.skin = video.dataset.ckin ?? 'default';

    this.stylePlayer();

    if(this.skin == 'default') {
      let controls = this.wrapper.querySelector('.default__controls.ckin__controls') as HTMLDivElement;
      this.progress = new MediaProgressLine(video, streamable);
      controls.prepend(this.progress.container);
    }

    if(play/*  && video.paused */) {
      const promise = video.play();
      promise.catch((err: Error) => {
        if(err.name == 'NotAllowedError') {
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

  private stylePlayer() {
    const {wrapper: player, video, skin} = this;

    player.classList.add(skin);
  
    const html = this.buildControls();
    player.insertAdjacentHTML('beforeend', html);
    let elapsed = 0;
    let prevTime = 0;
    let timeDuration: HTMLElement;
  
    if(skin === 'default') {
      const toggle = player.querySelectorAll('.toggle') as NodeListOf<HTMLElement>;
      const fullScreenButton = player.querySelector('.fullscreen') as HTMLElement;
      const timeElapsed = player.querySelector('#time-elapsed');
      timeDuration = player.querySelector('#time-duration') as HTMLElement;
      timeDuration.innerHTML = String(video.duration | 0).toHHMMSS();

      const volumeDiv = document.createElement('div');
      volumeDiv.classList.add('player-volume');

      volumeDiv.innerHTML = `
      <svg class="player-volume__icon" focusable="false" viewBox="0 0 24 24" aria-hidden="true"></svg>
      `;
      const volumeSvg = volumeDiv.firstElementChild as SVGSVGElement;

      volumeSvg.addEventListener('click', (e) => {
        cancelEvent(e);
        video.muted = !video.muted;
      });

      const volumeProgress = new ProgressLine();
      volumeProgress.setListeners();
      volumeProgress.setHandlers({
        onScrub: currentTime => {
          const value = Math.max(Math.min(currentTime, 1), 0);

          //console.log('volume scrub:', currentTime, value);

          video.muted = false;
          video.volume = value;
        }
      });
      volumeDiv.append(volumeProgress.container);

      const setVolume = () => {
        const volume = video.volume;
        let d: string;
        if(!volume || video.muted) {
          d = `M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z`;
        } else if(volume > .5) {
          d = `M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z`;
        } else if(volume > 0 && volume < .25) {
          d = `M7 9v6h4l5 5V4l-5 5H7z`;
        } else {
          d = `M18.5 12c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM5 9v6h4l5 5V4L9 9H5z`;
        }

        try {
          volumeSvg.innerHTML = `<path d="${d}"></path>`;
        } catch(err) {}

        if(!volumeProgress.mousedown) {
          volumeProgress.setProgress(video.muted ? 0 : volume);
        }
      };
      
      // не вызовется повторно если на 1 установить 1
      video.addEventListener('volumechange', () => {
        muted = video.muted;
        lastVolume = video.volume;
        setVolume();
      });

      video.volume = lastVolume;
      video.muted = muted;

      setVolume();

      // volume end

      const leftControls = player.querySelector('.left-controls');
      leftControls.insertBefore(volumeDiv, timeElapsed.parentElement);

      Array.from(toggle).forEach((button) => {
        return button.addEventListener('click', () => {
          this.togglePlay();
        });
      });

      video.addEventListener('click', () => {
        if(!isTouchSupported) {
          this.togglePlay();
          return;
        }
      });

      if(isTouchSupported) {
        let showControlsTimeout = 0;

        const t = () => {
          showControlsTimeout = window.setTimeout(() => {
            showControlsTimeout = 0;
            player.classList.remove('show-controls');
          }, 3e3);
        };

        player.addEventListener('click', () => {
          if(showControlsTimeout) {
            clearTimeout(showControlsTimeout);
          } else {
            player.classList.add('show-controls');
          }
  
          t();
        });

        player.addEventListener('touchstart', () => {
          player.classList.add('show-controls');
          clearTimeout(showControlsTimeout);
        });

        player.addEventListener('touchend', () => {
          if(player.classList.contains('is-playing')) {
            t();
          }
        });
      }
  
      /* player.addEventListener('click', (e) => {
        if(e.target != player) {
          return;
        }

        this.togglePlay();
      }); */
  
      /* video.addEventListener('play', () => {
      }); */

      video.addEventListener('dblclick', () => {
        if(isTouchSupported) {
          return;
        }

        return this.toggleFullScreen(fullScreenButton);
      })

      fullScreenButton.addEventListener('click', (e) => {
        return this.toggleFullScreen(fullScreenButton);
      });

      'webkitfullscreenchange mozfullscreenchange fullscreenchange MSFullscreenChange'.split(' ').forEach(eventName => {
        player.addEventListener(eventName, this.onFullScreen, false);
      });

      video.addEventListener('timeupdate', () => {
        timeElapsed.innerHTML = String(video.currentTime | 0).toHHMMSS();
      });
    } else if(skin === 'circle') {
      const wrapper = document.createElement('div');
      wrapper.classList.add('circle-time-left');
      video.parentNode.insertBefore(wrapper, video);
      wrapper.innerHTML = '<div class="circle-time"></div><div class="iconVolume tgico-nosound"></div>';
  
      const circle = player.querySelector('.progress-ring__circle') as SVGCircleElement;
      const radius = circle.r.baseVal.value;
      const circumference = 2 * Math.PI * radius;
      timeDuration = player.querySelector('.circle-time') as HTMLElement;
      const iconVolume = player.querySelector('.iconVolume') as HTMLDivElement;
      circle.style.strokeDasharray = circumference + ' ' + circumference;
      circle.style.strokeDashoffset = '' + circumference;
      circle.addEventListener('click', () => {
        this.togglePlay();
      });
  
      video.addEventListener('play', () => {
        iconVolume.style.display = 'none';
        updateInterval = window.setInterval(() => {
          //elapsed += 0.02; // Increase with timer interval
          if(video.currentTime != prevTime) {
            elapsed = video.currentTime; // Update if getCurrentTime was changed
            prevTime = video.currentTime;
          }

          const offset = circumference - elapsed / video.duration * circumference;
          circle.style.strokeDashoffset = '' + offset;
          if(video.paused) clearInterval(updateInterval);
        }, 20);
      });
  
      video.addEventListener('pause', () => {
        iconVolume.style.display = '';
      });

      let updateInterval = 0;
      video.addEventListener('timeupdate', () => {
        clearInterval(updateInterval);

        let elapsed = 0;
        let prevTime = 0;
  
        updateInterval = window.setInterval(() => {
          if(video.currentTime != prevTime) {
            elapsed = video.currentTime; // Update if getCurrentTime was changed
            prevTime = video.currentTime;
          }
          
          const offset = circumference - elapsed / video.duration * circumference;
          circle.style.strokeDashoffset = '' + offset;
          if(video.paused) clearInterval(updateInterval);
        }, 20);
  
        const timeLeft = String((video.duration - video.currentTime) | 0).toHHMMSS();
        if(timeLeft != '0') timeDuration.innerHTML = timeLeft;
      });
    }

    video.addEventListener('play', () => {
      this.wrapper.classList.add('is-playing');
    });

    video.addEventListener('pause', () => {
      this.wrapper.classList.remove('is-playing');
    });
  
    if(video.duration > 0) {
      timeDuration.innerHTML = String(Math.round(video.duration)).toHHMMSS();
    } else {
      video.addEventListener('loadeddata', () => {
        timeDuration.innerHTML = String(Math.round(video.duration)).toHHMMSS();
      });
    }
  }

  public togglePlay(stop?: boolean) {
    if(stop) {
      this.video.pause();
      this.wrapper.classList.remove('is-playing');
      return;
    } else if(stop === false) {
      this.video.play();
      this.wrapper.classList.add('is-playing');
      return;
    }
  
    this.video[this.video.paused ? 'play' : 'pause']();
    //this.wrapper.classList.toggle('is-playing', !this.video.paused);
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
            <button class="${skin}__button toggle tgico" title="Toggle Video"></button>
            <div class="time">
              <time id="time-elapsed">0:00</time>
              <span> / </span>
              <time id="time-duration">0:00</time>
            </div>
          </div>
          <div class="right-controls">
            <button class="${skin}__button fullscreen tgico-fullscreen" title="Full Screen"></button>
          </div>
        </div>
      </div>`;
    } else if(skin === 'circle') {
      return `
      <svg class="progress-ring" width="200px" height="200px">
        <circle class="progress-ring__circle" stroke="white" stroke-opacity="0.3" stroke-width="3.5" cx="100" cy="100" r="93" fill="transparent" transform="rotate(-90, 100, 100)"/>
      </svg>
      `;
    }
  }

  public static isFullScreen(): boolean {
    // @ts-ignore
    return !!(document.fullscreenElement || document.mozFullScreenElement || document.webkitFullscreenElement || document.msFullscreenElement);
  }
  
  public toggleFullScreen(fullScreenButton: HTMLElement) {
    // alternative standard method
    const player = this.wrapper;

    // * https://caniuse.com/#feat=fullscreen
    if(isAppleMobile) {
      const video = this.video as any;
      video.webkitEnterFullscreen();
      video.enterFullscreen();
      return;
    }
    
    if(!VideoPlayer.isFullScreen()) {
      player.classList.add('ckin__fullscreen');

      /* const videoParent = this.video.parentElement;
      const videoWhichChild = whichChild(this.video);
      const needVideoRemount = videoParent != player;

      if(needVideoRemount) {
        this.videoParent = videoParent;
        this.videoWhichChild = videoWhichChild;
        player.prepend(this.video);
      } */
  
      if(player.requestFullscreen) {
        player.requestFullscreen();
        // @ts-ignore
      } else if(player.mozRequestFullScreen) {
        // @ts-ignore
        player.mozRequestFullScreen(); // Firefox
        // @ts-ignore
      } else if(player.webkitRequestFullscreen) {
        // @ts-ignore
        player.webkitRequestFullscreen(); // Chrome and Safari
        // @ts-ignore
      } else if(player.msRequestFullscreen) {
        // @ts-ignore
        player.msRequestFullscreen();
      }
  
      fullScreenButton.classList.remove('tgico-fullscreen');
      fullScreenButton.classList.add('tgico-smallscreen');
      fullScreenButton.setAttribute('title', 'Exit Full Screen');
    } else {
      player.classList.remove('ckin__fullscreen');

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
  
      // @ts-ignore
      if(document.cancelFullScreen) {
        // @ts-ignore
        document.cancelFullScreen();
        // @ts-ignore
      } else if(document.mozCancelFullScreen) {
        // @ts-ignore
        document.mozCancelFullScreen();
        // @ts-ignore
      } else if(document.webkitCancelFullScreen) {
        // @ts-ignore
        document.webkitCancelFullScreen();
        // @ts-ignore
      } else if(document.msExitFullscreen) {
        // @ts-ignore
        document.msExitFullscreen();
      }
  
      fullScreenButton.classList.remove('tgico-smallscreen');
      fullScreenButton.classList.add('tgico-fullscreen');
      fullScreenButton.setAttribute('title', 'Full Screen');
    }
  }
  
  onFullScreen = () => {
    // @ts-ignore
    const isFullscreenNow = document.webkitFullscreenElement !== null;
    if(!isFullscreenNow) {
      this.wrapper.classList.remove('ckin__fullscreen');
    } else {
    }
  };
}
