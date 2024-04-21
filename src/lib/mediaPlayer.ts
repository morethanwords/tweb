/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import appMediaPlaybackController from '../components/appMediaPlaybackController';
import {IS_APPLE_MOBILE, IS_MOBILE} from '../environment/userAgent';
import IS_TOUCH_SUPPORTED from '../environment/touchSupport';
import cancelEvent from '../helpers/dom/cancelEvent';
import ListenerSetter, {Listener} from '../helpers/listenerSetter';
import {ButtonMenuItemOptionsVerifiable, ButtonMenuSync} from '../components/buttonMenu';
import ButtonMenuToggle, {ButtonMenuToggleHandler} from '../components/buttonMenuToggle';
import ControlsHover from '../helpers/dom/controlsHover';
import {addFullScreenListener, cancelFullScreen, getFullScreenElement, isFullScreen, requestFullScreen} from '../helpers/dom/fullScreen';
import toHHMMSS from '../helpers/string/toHHMMSS';
import MediaProgressLine from '../components/mediaProgressLine';
import VolumeSelector from '../components/volumeSelector';
import debounce from '../helpers/schedulers/debounce';
import overlayCounter from '../helpers/overlayCounter';
import onMediaLoad from '../helpers/onMediaLoad';
import {attachClickEvent} from '../helpers/dom/clickEvent';
import safePlay from '../helpers/dom/safePlay';
import ButtonIcon from '../components/buttonIcon';
import Button from '../components/button';
import Icon from '../components/icon';
import setCurrentTime from '../helpers/dom/setCurrentTime';
import {i18n} from './langPack';
import {numberThousandSplitterForWatching} from '../helpers/number/numberThousandSplitter';
import createCanvasStream from '../helpers/canvas/createCanvasStream';

export const PlaybackRateButton = (options: {
  onPlaybackRateMenuToggle?: (open: boolean) => void,
  direction: string
}) => {
  const PLAYBACK_RATES = [0.5, 1, 1.5, 2];
  const PLAYBACK_RATES_ICONS: Icon[] = ['playback_05', 'playback_1x', 'playback_15', 'playback_2x'];
  const button = ButtonIcon(` btn-menu-toggle`, {noRipple: true});

  const setIcon = () => {
    const playbackRateButton = button;

    let idx = PLAYBACK_RATES.indexOf(appMediaPlaybackController.playbackRate);
    if(idx === -1) idx = PLAYBACK_RATES.indexOf(1);

    const icon = Icon(PLAYBACK_RATES_ICONS[idx]);
    if(playbackRateButton.firstElementChild) {
      playbackRateButton.firstElementChild.replaceWith(icon);
    } else {
      playbackRateButton.append(icon);
    }
  };

  const setBtnMenuToggle = () => {
    const buttons = PLAYBACK_RATES.map((rate, idx) => {
      const buttonOptions: Parameters<typeof ButtonMenuSync>[0]['buttons'][0] = {
        // icon: PLAYBACK_RATES_ICONS[idx],
        regularText: rate + 'x',
        onClick: () => {
          appMediaPlaybackController.playbackRate = rate;
        }
      };

      return buttonOptions;
    });
    const btnMenu = ButtonMenuSync({buttons});
    btnMenu.classList.add(options.direction, 'playback-rate-menu');
    ButtonMenuToggleHandler({
      el: button,
      onOpen: options.onPlaybackRateMenuToggle ? () => {
        options.onPlaybackRateMenuToggle(true);
      } : undefined,
      onClose: options.onPlaybackRateMenuToggle ? () => {
        options.onPlaybackRateMenuToggle(false);
      } : undefined
    });
    setIcon();
    button.append(btnMenu);
  };

  const addRate = (add: number) => {
    const playbackRate = appMediaPlaybackController.playbackRate;
    const idx = PLAYBACK_RATES.indexOf(playbackRate);
    const nextIdx = idx + add;
    if(nextIdx >= 0 && nextIdx < PLAYBACK_RATES.length) {
      appMediaPlaybackController.playbackRate = PLAYBACK_RATES[nextIdx];
    }
  };

  const isMenuOpen = () => {
    return button.classList.contains('menu-open');
  };

  setBtnMenuToggle();
  return {element: button, setIcon, addRate, isMenuOpen};
};

export default class VideoPlayer extends ControlsHover {
  public video: HTMLVideoElement;
  protected wrapper: HTMLDivElement;
  protected progress: MediaProgressLine;
  protected skin: 'default';
  protected live: boolean;

  protected listenerSetter: ListenerSetter;
  protected playbackRateButton: ReturnType<typeof PlaybackRateButton>;
  protected pipButton: HTMLElement;
  protected liveMenuButton: HTMLElement;
  protected toggles: HTMLElement[];
  public liveEl: HTMLElement;

  /* protected videoParent: HTMLElement;
  protected videoWhichChild: number; */

  protected onPlaybackRateMenuToggle?: (open: boolean) => void;
  protected onPip?: (pip: boolean) => void;
  protected onPipClose?: () => void;

  protected canPause: boolean;
  protected canSeek: boolean;

  protected _inPip = false;

  protected _width: number;
  protected _height: number;

  protected emptyPipVideo: HTMLVideoElement;
  protected debouncedPip: (pip: boolean) => void;
  protected debouncePipTime: number;
  public emptyPipVideoSource: CanvasImageSource;

  constructor({
    video,
    play = false,
    streamable = false,
    duration,
    live,
    width,
    height,
    onPlaybackRateMenuToggle,
    onPip,
    onPipClose
  }: {
    video: HTMLVideoElement,
    play?: boolean,
    streamable?: boolean,
    duration?: number,
    live?: boolean,
    width?: number,
    height?: number,
    onPlaybackRateMenuToggle?: VideoPlayer['onPlaybackRateMenuToggle'],
    onPip?: VideoPlayer['onPip'],
    onPipClose?: VideoPlayer['onPipClose']
  }) {
    super();

    this.video = video;
    this.video.classList.add('ckin__video');
    this.wrapper = document.createElement('div');
    this.wrapper.classList.add('ckin__player');
    this.live = live;
    this.canPause = !live;
    this.canSeek = !live;
    this._width = width;
    this._height = height;

    this.onPlaybackRateMenuToggle = onPlaybackRateMenuToggle;
    this.onPip = onPip;
    this.onPipClose = onPipClose;

    this.listenerSetter = new ListenerSetter();

    this.setup({
      element: this.wrapper,
      listenerSetter: this.listenerSetter,
      canHideControls: () => {
        return !this.video.paused && (!this.playbackRateButton || !this.playbackRateButton.isMenuOpen());
      },
      showOnLeaveToClassName: 'media-viewer-caption',
      ignoreClickClassName: 'ckin__controls'
    });

    video.parentNode.insertBefore(this.wrapper, video);
    this.wrapper.appendChild(video);

    this.skin = 'default';

    this.stylePlayer(duration);

    if(this.skin === 'default' && !live) {
      const controls = this.wrapper.querySelector('.default__controls.ckin__controls') as HTMLDivElement;
      this.progress = new MediaProgressLine({
        onSeekStart: () => {
          this.wrapper.classList.add('is-seeking');
        },
        onSeekEnd: () => {
          this.wrapper.classList.remove('is-seeking');
        }
      });
      this.progress.setMedia({
        media: video,
        streamable,
        duration
      });
      controls.prepend(this.progress.container);
    }

    if(play/*  && video.paused */) {
      video.play().catch((err: Error) => {
        if(err.name === 'NotAllowedError') {
          video.muted = true;
          video.autoplay = true;
          safePlay(video);
        }
      }).finally(() => { // due to autoplay, play will not call
        this.setIsPlaing(!this.video.paused);
      });
    }
  }

  public get width() {
    return this.video.videoWidth || this._width;
  }

  public get height() {
    return this.video.videoHeight || this._height;
  }

  private setIsPlaing(isPlaying: boolean) {
    this.wrapper.classList.toggle('is-playing', isPlaying);
    this.toggles.forEach((toggle) => {
      toggle.replaceChildren(Icon(isPlaying ? 'pause' : 'play'));
    });
  }

  private stylePlayer(initDuration: number) {
    const {wrapper, video, skin, listenerSetter, live} = this;

    wrapper.classList.add(skin);
    if(live) wrapper.classList.add(`${skin}-live`);

    const html = this.buildControls();
    wrapper.insertAdjacentHTML('beforeend', html);
    let timeDuration: HTMLElement;

    if(skin === 'default') {
      if(this.canPause) {
        const mainToggle = Button(`${skin}__button--big toggle`, {noRipple: true, icon: 'play'});
        wrapper.firstElementChild.after(mainToggle);
      }

      const leftControls = wrapper.querySelector('.left-controls') as HTMLElement;
      if(live) {
        this.toggles = [];
      } else {
        const leftToggle = ButtonIcon(` ${skin}__button toggle`, {noRipple: true});
        leftControls.prepend(leftToggle);
        this.toggles = [leftToggle];
      }

      const rightControls = wrapper.querySelector('.right-controls') as HTMLElement;
      if(!live) {
        this.playbackRateButton = PlaybackRateButton({direction: 'top-left', onPlaybackRateMenuToggle: this.onPlaybackRateMenuToggle});
        this.playbackRateButton.element.classList.add(`${skin}__button`);
      }
      if(!IS_MOBILE && document.pictureInPictureEnabled) {
        this.pipButton = ButtonIcon(`pip ${skin}__button`, {noRipple: true});
      }
      const fullScreenButton = ButtonIcon(` ${skin}__button`, {noRipple: true});
      rightControls.append(...[this.playbackRateButton?.element, this.pipButton, fullScreenButton].filter(Boolean));

      const timeElapsed = wrapper.querySelector('#time-elapsed');
      timeDuration = wrapper.querySelector('#time-duration') as HTMLElement;

      const volumeSelector = new VolumeSelector(listenerSetter, false, video);

      volumeSelector.btn.classList.remove('btn-icon');
      if(timeElapsed) {
        timeElapsed.parentElement.before(volumeSelector.btn);
      } else {
        leftControls.lastElementChild.before(volumeSelector.btn);
      }

      this.toggles.forEach((button) => {
        attachClickEvent(button, () => {
          this.togglePlay();
        }, {listenerSetter: this.listenerSetter});
      });

      if(this.pipButton) {
        attachClickEvent(this.pipButton, this.requestPictureInPicture, {listenerSetter: this.listenerSetter});

        this.debouncePipTime = 20;
        this.debouncedPip = debounce(this._onPip, this.debouncePipTime, false, true);

        this.addPipListeners(video);
      }

      if(!IS_TOUCH_SUPPORTED) {
        if(this.canPause) {
          attachClickEvent(video, () => {
            this.togglePlay();
          }, {listenerSetter: this.listenerSetter});
        }

        listenerSetter.add(document)('keydown', (e: KeyboardEvent) => {
          if(overlayCounter.overlaysActive > 1 || document.pictureInPictureElement === video) { // forward popup is active, etc
            return;
          }

          const {key, code} = e;

          let good = true;
          if(code === 'KeyF') {
            this.toggleFullScreen();
          } else if(code === 'KeyM') {
            appMediaPlaybackController.muted = !appMediaPlaybackController.muted;
          } else if(code === 'Space' && this.canPause) {
            this.togglePlay();
          } else if(e.altKey && (code === 'Equal' || code === 'Minus') && this.canSeek) {
            const add = code === 'Equal' ? 1 : -1;
            this.playbackRateButton.addRate(add);
          } else if(wrapper.classList.contains('ckin__fullscreen') && (key === 'ArrowLeft' || key === 'ArrowRight') && this.canSeek) {
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

      listenerSetter.add(video)('dblclick', () => {
        if(!IS_TOUCH_SUPPORTED) {
          this.toggleFullScreen();
        }
      });

      attachClickEvent(fullScreenButton, () => {
        this.toggleFullScreen();
      }, {listenerSetter: this.listenerSetter});

      addFullScreenListener(wrapper, this.onFullScreen.bind(this, fullScreenButton), listenerSetter);
      this.onFullScreen(fullScreenButton);

      if(timeElapsed) {
        listenerSetter.add(video)('timeupdate', () => {
          timeElapsed.textContent = toHHMMSS(video.currentTime | 0);
        });
      }

      listenerSetter.add(video)('play', () => {
        wrapper.classList.add('played');

        if(!IS_TOUCH_SUPPORTED) {
          listenerSetter.add(video)('play', () => {
            if(!live) {
              this.hideControls(true);
            }
          });
        }
      }, {once: true});

      listenerSetter.add(video)('pause', () => {
        this.showControls(false);
      });

      listenerSetter.add(appMediaPlaybackController)('playbackParams', () => {
        this.playbackRateButton.setIcon();
      });

      if(live) {
        this.liveEl = i18n('Rtmp.MediaViewer.Live');
        this.liveEl.classList.add('controls-live');
        leftControls.prepend(this.liveEl);
      }
    }

    listenerSetter.add(video)('play', () => {
      this.setIsPlaing(true);
    });

    if(!live) {
      listenerSetter.add(video)('pause', () => {
        this.setIsPlaing(false);
      });
    }

    if(timeDuration) {
      if(video.duration || initDuration) {
        timeDuration.textContent = toHHMMSS(Math.round(video.duration || initDuration));
      } else {
        onMediaLoad(video).then(() => {
          timeDuration.textContent = toHHMMSS(Math.round(video.duration));
        });
      }
    }
  }

  protected _onPip = (pip: boolean) => {
    this._inPip = pip;
    this.wrapper.style.visibility = pip ? 'hidden': '';
    this.onPip?.(pip);
  };

  protected onEnterPictureInPictureLeave = (e: Event) => {
    const onPause = () => {
      clearTimeout(timeout);
      this.onPipClose?.();
    };
    const listener = this.listenerSetter.add(e.target)('pause', onPause, {once: true}) as any as Listener;
    const timeout = setTimeout(() => {
      this.listenerSetter.remove(listener);
    }, this.debouncePipTime);
  };

  protected onEnterPictureInPicture = (e: Event) => {
    this.debouncedPip(true);
    this.listenerSetter.add(e.target)('leavepictureinpicture', this.onEnterPictureInPictureLeave, {once: true});
  };

  protected onLeavePictureInPicture = () => {
    this.debouncedPip(false);
  };

  protected addPipListeners(video: HTMLVideoElement) {
    this.listenerSetter.add(video)('enterpictureinpicture', this.onEnterPictureInPicture);
    this.listenerSetter.add(video)('leavepictureinpicture', this.onLeavePictureInPicture);
  }

  public requestPictureInPicture = async() => {
    if(this.video.duration) {
      this.video.requestPictureInPicture();
      return;
    }

    if(!this.emptyPipVideo) {
      const {width, height} = this;
      this.emptyPipVideo = document.createElement('video');
      this.emptyPipVideo.autoplay = true;
      this.emptyPipVideo.muted = true;
      this.emptyPipVideo.playsInline = true;
      this.emptyPipVideo.style.position = 'absolute';
      this.emptyPipVideo.style.visibility = 'hidden';
      document.body.prepend(this.emptyPipVideo);
      this.emptyPipVideo.srcObject = createCanvasStream({width, height, image: this.emptyPipVideoSource});
      this.addPipListeners(this.emptyPipVideo);
    }

    await onMediaLoad(this.emptyPipVideo);
    this.emptyPipVideo.requestPictureInPicture();

    onMediaLoad(this.video).then(() => {
      if(document.pictureInPictureElement === this.emptyPipVideo) {
        document.exitPictureInPicture();
        this.video.requestPictureInPicture();
      }
    });
  };

  protected togglePlay(isPaused = this.video.paused) {
    this.video[isPaused ? 'play' : 'pause']();
  }

  private buildControls() {
    const skin = this.skin;

    if(skin === 'default') {
      const time = this.live ? `
      <span class="left-controls-watching"></span>
      ` : `
      <time id="time-elapsed">0:00</time>
      <span> / </span>
      <time id="time-duration">0:00</time>
      `

      return `
      <div class="${skin}__gradient-bottom ckin__controls"></div>
      <div class="${skin}__controls ckin__controls night">
        <div class="bottom-controls">
          <div class="left-controls">
            <div class="time">
              ${time}
            </div>
          </div>
          <div class="right-controls"></div>
        </div>
      </div>`;
    }
  }

  public cancelFullScreen() {
    if(getFullScreenElement() === this.wrapper) {
      this.toggleFullScreen();
    }
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
      fullScreenButton.replaceChildren(Icon('fullscreen'));
      fullScreenButton.setAttribute('title', 'Full Screen');
    } else {
      fullScreenButton.replaceChildren(Icon('smallscreen'));
      fullScreenButton.setAttribute('title', 'Exit Full Screen');
    }
  }

  public dimBackground() {
    this.wrapper.classList.add('dim-background');
  }

  public setTimestamp(timestamp: number) {
    setCurrentTime(this.video, timestamp);
    this.togglePlay(true);
  }

  public cleanup() {
    super.cleanup();
    this.listenerSetter.removeAll();
    this.progress?.removeListeners();
    this.onPlaybackRateMenuToggle = this.onPip = undefined;
  }

  public setupLiveMenu(buttons: ButtonMenuItemOptionsVerifiable[]) {
    this.liveMenuButton = ButtonMenuToggle({
      direction: 'top-left',
      buttons: buttons,
      buttonOptions: {
        noRipple: true
      }
    });
    this.wrapper.querySelector('.right-controls').prepend(this.liveMenuButton);
  }

  public updateLiveViewersCount(count: number) {
    this.wrapper.querySelector('.left-controls-watching').replaceChildren(i18n('Rtmp.Watching', [numberThousandSplitterForWatching(Math.max(1, count))]));
  }

  get inPip() {
    return this._inPip;
  }
}
