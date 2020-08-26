export class ProgressLine {
  public container: HTMLDivElement;
  protected filled: HTMLDivElement;
  protected seek: HTMLInputElement;

  protected duration = 100;
  protected mousedown = false;

  private events: Partial<{
    //onMouseMove: ProgressLine['onMouseMove'],
    onMouseDown: ProgressLine['onMouseDown'],
    onMouseUp: ProgressLine['onMouseUp'],
    onScrub: (scrubTime: number) => void
  }> = {};

  constructor() {
    this.container = document.createElement('div');
    this.container.classList.add('media-progress');

    this.filled = document.createElement('div');
    this.filled.classList.add('media-progress__filled');

    const seek = this.seek = document.createElement('input');
    seek.classList.add('media-progress__seek');
    seek.value = '0';
    seek.setAttribute('min', '0');
    seek.setAttribute('max', '0');
    seek.type = 'range';
    seek.step = '0.1';
    seek.max = '' + (this.duration * 1000);

    //this.setListeners();

    this.container.append(this.filled, seek);
  }

  public setHandlers(events: ProgressLine['events']) {
    this.events = events;
  }

  onMouseMove = (e: MouseEvent) => {
    this.mousedown && this.scrub(e);
  };

  onMouseDown = (e: MouseEvent) => {
    this.scrub(e);
    this.mousedown = true;
    this.events?.onMouseDown(e);
  };

  onMouseUp = (e: MouseEvent) => {
    this.mousedown = false;
    this.events?.onMouseUp(e);
  };

  protected setListeners() {
    this.container.addEventListener('mousemove', this.onMouseMove);
    this.container.addEventListener('mousedown', this.onMouseDown);
    this.container.addEventListener('mouseup', this.onMouseUp);
  }

  protected scrub(e: MouseEvent) {
    const scrubTime = e.offsetX / this.container.offsetWidth * this.duration;

    let scaleX = scrubTime / this.duration;
    scaleX = Math.max(0, Math.min(1, scaleX));
    this.filled.style.transform = 'scaleX(' + scaleX + ')';

    //this.events?.onScrub(scrubTime);
    return scrubTime;
  }

  public removeListeners() {
    this.container.removeEventListener('mousemove', this.onMouseMove);
    this.container.removeEventListener('mousedown', this.onMouseDown);
    this.container.removeEventListener('mouseup', this.onMouseUp);

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
      this.filledLoad.classList.add('media-progress__filled', 'media-progress__loaded');
      this.container.prepend(this.filledLoad);
      //this.setLoadProgress();
    }

    if(!media.paused || media.currentTime > 0) {
      this.onPlay();
    }

    this.setSeekMax();
    this.setListeners();
    this.setHandlers({
      onMouseDown: (e: MouseEvent) => {
        //super.onMouseDown(e);
    
        //Таймер для того, чтобы стопать видео, если зажал мышку и не отпустил клик
        if(this.stopAndScrubTimeout) { // возможно лишнее
          clearTimeout(this.stopAndScrubTimeout);
        }
    
        this.stopAndScrubTimeout = setTimeout(() => {
          !this.media.paused && this.media.pause();
          this.stopAndScrubTimeout = 0;
        }, 150);
      },

      onMouseUp: (e: MouseEvent) => {
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
  };

  protected setLoadProgress() {
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

  protected setProgress() {
    const currentTime = this.media.currentTime;

    const scaleX = (currentTime / this.duration);
    this.filled.style.transform = 'scaleX(' + scaleX + ')';
    this.seek.value = '' + currentTime * 1000;
  }

  protected setListeners() {
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

export default class VideoPlayer {
  public wrapper: HTMLDivElement;
  public progress: MediaProgressLine;
  private skin: string;

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

    if(play) {
      (this.wrapper.querySelector('.toggle') as HTMLButtonElement).click();
    }
  }

  private stylePlayer() {
    const {wrapper: player, video, skin} = this;

    player.classList.add(skin);
  
    const html = this.buildControls();
    player.insertAdjacentHTML('beforeend', html);
    let updateInterval = 0;
    let elapsed = 0;
    let prevTime = 0;
  
    if(skin === 'default') {
      const toggle = player.querySelectorAll('.toggle') as NodeListOf<HTMLElement>;
      const fullScreenButton = player.querySelector('.fullscreen') as HTMLElement;
      var timeElapsed = player.querySelector('#time-elapsed');
      var timeDuration = player.querySelector('#time-duration') as HTMLElement;
      timeDuration.innerHTML = String(video.duration | 0).toHHMMSS();
  
      Array.from(toggle).forEach((button) => {
        return button.addEventListener('click', () => {
          this.togglePlay();
        });
      });
  
      video.addEventListener('click', () => {
        this.togglePlay();
      });
  
      video.addEventListener('play', () => {
        this.updateButton(toggle);
      });

      video.addEventListener('pause', () => {
        this.updateButton(toggle);
        clearInterval(updateInterval);
      });
  
      video.addEventListener('dblclick', () => {
        return this.toggleFullScreen(fullScreenButton);
      })

      fullScreenButton.addEventListener('click', (e) => {
        return this.toggleFullScreen(fullScreenButton);
      });

      'webkitfullscreenchange mozfullscreenchange fullscreenchange MSFullscreenChange'.split(' ').forEach(eventName => {
        player.addEventListener(eventName, this.onFullScreen, false);
      });
    } else if(skin === 'circle') {
      const wrapper = document.createElement('div');
      wrapper.classList.add('circle-time-left');
      video.parentNode.insertBefore(wrapper, video);
      wrapper.innerHTML = '<div class="circle-time"></div><div class="iconVolume tgico-nosound"></div>';
  
      var circle = player.querySelector('.progress-ring__circle') as SVGCircleElement;
      const radius = circle.r.baseVal.value;
      var circumference = 2 * Math.PI * radius;
      var timeDuration = player.querySelector('.circle-time') as HTMLElement;
      const iconVolume = player.querySelector('.iconVolume') as HTMLDivElement;
      circle.style.strokeDasharray = circumference + ' ' + circumference;
      circle.style.strokeDashoffset = '' + circumference;
      circle.addEventListener('click', () => {
        this.togglePlay();
      });
  
      video.addEventListener('play', () => {
        iconVolume.style.display = 'none';
        updateInterval = setInterval(() => {
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
    }
  
    if(video.duration > 0) {
      timeDuration.innerHTML = String(Math.round(video.duration)).toHHMMSS();
    } else {
      video.addEventListener('loadeddata', () => {
        timeDuration.innerHTML = String(Math.round(video.duration)).toHHMMSS();
      });
    }
  
    video.addEventListener('timeupdate', () => {
      if(skin == 'default') {
        timeElapsed.innerHTML = String(video.currentTime | 0).toHHMMSS();
      }

      updateInterval = this.handleProgress(timeDuration, circumference, circle, updateInterval);
    });
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
    this.video.paused ? this.wrapper.classList.remove('is-playing') : this.wrapper.classList.add('is-playing');
  }

  private handleProgress(timeDuration: HTMLElement, circumference: number, circle: SVGCircleElement, updateInterval: number) {
    const {video, skin} = this;

    clearInterval(updateInterval);
    let elapsed = 0;
    let prevTime = 0;

    if(skin === 'circle') {
      updateInterval = setInterval(() => {
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

      return updateInterval;
    }
  }

  private buildControls() {
    const skin = this.skin;
    const html: string[] = [];
    if(skin === 'default') {
      html.push(`
      <button class="${skin}__button--big toggle tgico-largeplay" title="Toggle Play"></button>
      <div class="${skin}__gradient-bottom ckin__controls"></div>
      <div class="${skin}__controls ckin__controls">
        <div class="bottom-controls">
          <div class="left-controls">
            <button class="${skin}__button toggle tgico-play" title="Toggle Video"></button>
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
      </div>`);
    } else if(skin === 'circle') {
      html.push('<svg class="progress-ring" width="200px" height="200px">',
        '<circle class="progress-ring__circle" stroke="white" stroke-opacity="0.3" stroke-width="3.5" cx="100" cy="100" r="93" fill="transparent" transform="rotate(-90, 100, 100)"/>',
        '</svg>');
    }
  
    return html.join('');
  }

  public updateButton(toggle: NodeListOf<HTMLElement>) {
    const icon = this.video.paused ? 'tgico-play' : 'tgico-pause';
    Array.from(toggle).forEach((button) => {
      button.classList.remove('tgico-play', 'tgico-pause');
      button.classList.add(icon);
    });
  }
  
  public toggleFullScreen(fullScreenButton: HTMLElement) {
    // alternative standard method
    let player = this.wrapper;

    // @ts-ignore
    if(!document.fullscreenElement && !document.mozFullScreenElement && !document.webkitFullscreenElement && !document.msFullscreenElement) {
      player.classList.add('ckin__fullscreen');
  
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
