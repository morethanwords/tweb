export class MediaProgressLine {
  public container: HTMLDivElement;
  private filled: HTMLDivElement;
  private seek: HTMLInputElement;

  private duration = 0;

  constructor(private media: HTMLAudioElement | HTMLVideoElement) {
    this.container = document.createElement('div');
    this.container.classList.add('media-progress');

    this.filled = document.createElement('div');
    this.filled.classList.add('media-progress__filled');

    let seek = this.seek = document.createElement('input');
    seek.classList.add('media-progress__seek');
    seek.value = '0';
    seek.setAttribute('min', '0');
    seek.setAttribute('max', '0');
    seek.type = 'range';
    seek.step = '0.1';

    this.setSeekMax();
    this.setListeners();

    this.container.append(this.filled, seek);
  }

  private setSeekMax() {
    let seek = this.seek;
    this.duration = this.media.duration;
    if(this.duration > 0) {
      seek.setAttribute('max', '' + this.duration * 1000);
    } else {
      this.media.addEventListener('loadeddata', () => {
        this.duration = this.media.duration;
        seek.setAttribute('max', '' + this.duration * 1000);
      });
    }
  }

  private setProgress() {
    let currentTime = this.media.currentTime;

    let scaleX = (currentTime / this.duration);
    this.filled.style.transform = 'scaleX(' + scaleX + ')';
    this.seek.value = '' + currentTime * 1000;
  }

  private setListeners() {
    let mousedown = false;
    let stopAndScrubTimeout = 0;

    this.media.addEventListener('ended', () => {
      this.setProgress();
    });

    this.media.addEventListener('play', () => {
      let r = () => {
        this.setProgress();
        !this.media.paused && window.requestAnimationFrame(r);
      };

      window.requestAnimationFrame(r);
    });

    this.container.addEventListener('mousemove', (e) => {
      mousedown && this.scrub(e);
    });

    this.container.addEventListener('mousedown', (e) => {
      this.scrub(e);
      //Таймер для того, чтобы стопать видео, если зажал мышку и не отпустил клик
      stopAndScrubTimeout = setTimeout(() => {
        !this.media.paused && this.media.pause();
        stopAndScrubTimeout = 0;
      }, 150);

      mousedown = true;
    });

    this.container.addEventListener('mouseup', () => {
      if(stopAndScrubTimeout) {
        clearTimeout(stopAndScrubTimeout);
      }

      this.media.paused && this.media.play();
      mousedown = false;
    });
  }

  private scrub(e: MouseEvent) {
    let scrubTime = e.offsetX / this.container.offsetWidth * this.duration;
    this.media.currentTime = scrubTime;
    let scaleX = scrubTime / this.duration;
  
    if(scaleX > 1) scaleX = 1;
    if(scaleX < 0) scaleX = 0;
  
    this.filled.style.transform = 'scaleX(' + scaleX + ')';
  }
}

export default class VideoPlayer {
  public wrapper: HTMLDivElement;
  private skin: string;
  private progress: MediaProgressLine;

  constructor(public video: HTMLVideoElement, play = false) {
    this.wrapper = document.createElement('div');
    this.wrapper.classList.add('ckin__player');

    video.parentNode.insertBefore(this.wrapper, video);
    this.wrapper.appendChild(video);

    this.skin = video.dataset.ckin ?? 'default';

    this.stylePlayer();

    if(this.skin == 'default') {
      let controls = this.wrapper.querySelector('.default__controls.ckin__controls') as HTMLDivElement;
      this.progress = new MediaProgressLine(video);
      controls.prepend(this.progress.container);
    }

    if(play) {
      (this.wrapper.querySelector('.toggle') as HTMLButtonElement).click();
    }
  }

  private stylePlayer() {
    let player = this.wrapper;
    let video = this.video;

    let skin = this.skin;
    player.classList.add(skin);
  
    let html = this.buildControls();
    player.insertAdjacentHTML('beforeend', html);
    let updateInterval = 0;
    let elapsed = 0;
    let prevTime = 0;
  
    if(skin === 'default') {
      var toggle = player.querySelectorAll('.toggle') as NodeListOf<HTMLElement>;
      var fullScreenButton = player.querySelector('.fullscreen') as HTMLElement;
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

      let b = () => this.onFullScreen();
      'webkitfullscreenchange mozfullscreenchange fullscreenchange MSFullscreenChange'.split(' ').forEach(eventName => {
        player.addEventListener(eventName, b, false);
      });
    }
  
    if(skin === 'circle') {
      let wrapper = document.createElement('div');
      wrapper.classList.add('circle-time-left');
      video.parentNode.insertBefore(wrapper, video);
      wrapper.innerHTML = '<div class="circle-time"></div><div class="iconVolume tgico-nosound"></div>';
  
      var circle = player.querySelector('.progress-ring__circle') as SVGCircleElement;
      var radius = circle.r.baseVal.value;
      var circumference = 2 * Math.PI * radius;
      var timeDuration = player.querySelector('.circle-time') as HTMLElement;
      var iconVolume = player.querySelector('.iconVolume') as HTMLDivElement;
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

          let offset = circumference - elapsed / video.duration * circumference;
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
    let video = this.video;
    let skin = this.skin;

    clearInterval(updateInterval);
    let elapsed = 0;
    let prevTime = 0;

    if(skin === 'circle') {
      updateInterval = setInterval(() => {
        if(video.currentTime != prevTime) {
          elapsed = video.currentTime; // Update if getCurrentTime was changed
          prevTime = video.currentTime;
        }
        let offset = circumference - elapsed / video.duration * circumference;
        circle.style.strokeDashoffset = '' + offset;
        if(video.paused) clearInterval(updateInterval);
      }, 20);

      let timeLeft = String((video.duration - video.currentTime) | 0).toHHMMSS();
      if(timeLeft != '0') timeDuration.innerHTML = timeLeft;

      return updateInterval;
    }
  }

  private buildControls() {
    let skin = this.skin;
    let html = [];
    if(skin === 'default') {
      html.push('<button class="' + skin + '__button--big toggle tgico-largeplay" title="Toggle Play"></button>');
      html.push('<div class="' + skin + '__gradient-bottom ckin__controls"></div>');
      html.push('<div class="' + skin + '__controls ckin__controls">');
      html.push('<div class="bottom-controls">',
        '<div class="left-controls"><button class="' + skin + '__button toggle tgico-play" title="Toggle Video"></button>',
        '<div class="time">',
        '<time id="time-elapsed">0:00</time>',
        '<span> / </span>',
        '<time id="time-duration">0:00</time>',
        '</div>',
        '</div>',
        '<div class="right-controls"><button class="' + skin + '__button fullscreen tgico-fullscreen" title="Full Screen"></button></div></div>');
      html.push('</div>');
    } else if(skin === 'circle') {
      html.push('<svg class="progress-ring" width="200px" height="200px">',
        '<circle class="progress-ring__circle" stroke="white" stroke-opacity="0.3" stroke-width="3.5" cx="100" cy="100" r="93" fill="transparent" transform="rotate(-90, 100, 100)"/>',
        '</svg>');
    }
  
    return html.join('');
  }

  public updateButton(toggle: NodeListOf<HTMLElement>) {
    let icon = this.video.paused ? 'tgico-play' : 'tgico-pause';
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
  
  public onFullScreen() {
    // @ts-ignore
    let isFullscreenNow = document.webkitFullscreenElement !== null;
    if(!isFullscreenNow) {
      this.wrapper.classList.remove('ckin__fullscreen');
    } else {
    }
  }
}
