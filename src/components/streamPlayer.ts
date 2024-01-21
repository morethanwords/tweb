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
import {ButtonMenuSync} from '../components/buttonMenu';
import {ButtonMenuToggleHandler} from '../components/buttonMenuToggle';
import ControlsHover from '../helpers/dom/controlsHover';
import {addFullScreenListener, cancelFullScreen, isFullScreen, requestFullScreen} from '../helpers/dom/fullScreen';
import VolumeSelector from '../components/volumeSelector';
import debounce from '../helpers/schedulers/debounce';
import overlayCounter from '../helpers/overlayCounter';
import {attachClickEvent} from '../helpers/dom/clickEvent';
import safePlay from '../helpers/dom/safePlay';
import ButtonIcon from '../components/buttonIcon';
import Icon from '../components/icon';
import createBadge from '../helpers/createBadge';
import PopupElement from './popups';
import PopupRTMPStream from './popups/RTMPStream';
import { HtmlAttributes } from 'csstype';

export default class StreamPlayer extends ControlsHover {
  private static PLAYBACK_RATES = [0.5, 1, 1.5, 2];

  protected video: HTMLVideoElement;
  protected wrapper: HTMLDivElement;
  protected skin: 'default';

  protected listenerSetter: ListenerSetter;
  protected playbackRateButton: HTMLElement;
  protected pipButton: HTMLElement;

  protected onPlaybackRackMenuToggle?: (open: boolean) => void;
  protected onPip?: (pip: boolean) => void;
  protected onPipClose?: () => void;
  protected onSettings?: () => void;
  protected onOutput?: () => void;
  protected onRecord?: () => void;
  protected onStopRecord?: () => void;

  private recordMenuItem: HTMLElement;
  private recordAction: () => void;

  constructor({video, onPlaybackRackMenuToggle, onPip, onPipClose, onSettings, onOutput, onRecord, onStopRecord}: {
    video: HTMLVideoElement,
    onPlaybackRackMenuToggle?: StreamPlayer['onPlaybackRackMenuToggle'],
    onPip?: StreamPlayer['onPip'],
    onPipClose?: StreamPlayer['onPipClose'],
    onSettings?: StreamPlayer['onSettings'],
    onOutput?: StreamPlayer['onOutput'],
    onRecord?: StreamPlayer['onRecord'],
    onStopRecord?: StreamPlayer['onStopRecord']
  }) {
    super();

    this.video = video;
    this.wrapper = document.createElement('div');
    this.wrapper.classList.add('ckin__player');

    this.onPlaybackRackMenuToggle = onPlaybackRackMenuToggle;
    this.onPip = onPip;
    this.onPipClose = onPipClose;
    this.onSettings = onSettings;
    this.onOutput = onOutput;
    this.onRecord = onRecord;
    this.onStopRecord = onStopRecord;
    this.recordAction = this.onRecord;

    this.listenerSetter = new ListenerSetter();

    this.setup({
      element: this.wrapper,
      listenerSetter: this.listenerSetter,
      canHideControls: () => {
        return !this.video.paused && (!this.playbackRateButton || !this.playbackRateButton.classList.contains('menu-open'));
      },
      showOnLeaveToClassName: 'media-viewer-caption',
      ignoreClickClassName: 'ckin__controls'
    });

    video.parentNode.insertBefore(this.wrapper, video);
    this.wrapper.appendChild(video);

    this.skin = 'default';

    this.stylePlayer();
    this.setBtnMenuToggle();

    const promise = video.play();
    promise.catch((err: Error) => {
      if(err.name === 'NotAllowedError') {
        video.muted = true;
        video.autoplay = true;
        safePlay(video);
      }
    }).finally(() => { // due to autoplay, play will not call
      this.setIsPlaing(!this.video.paused);
    });
  }

  private setIsPlaing(isPlaying: boolean) {
    this.wrapper.classList.toggle('is-playing', isPlaying);
  }

  private stylePlayer() {
    const {wrapper, video, skin, listenerSetter} = this;

    wrapper.classList.add(skin);
    const html = this.buildControls();
    wrapper.insertAdjacentHTML('beforeend', html);

    if(skin === 'default') {
      // remove
      const timeElapsed = wrapper.querySelector('.time') as HTMLElement;
      let i = 28305;
      setInterval(() => {
        timeElapsed.innerText = `${i.toLocaleString()} watching`;
        i += 1;
      }, 2000);

      const leftControls = wrapper.querySelector('.left-controls') as HTMLElement;
      const rightControls = wrapper.querySelector('.right-controls') as HTMLElement;
      this.playbackRateButton = ButtonIcon(`more ${skin}__button btn-menu-toggle`, {noRipple: true});
      if(!IS_MOBILE && document.pictureInPictureEnabled) {
        this.pipButton = ButtonIcon(`pip ${skin}__button`, {noRipple: true});
      }
      const fullScreenButton = ButtonIcon(` ${skin}__button`, {noRipple: true});
      rightControls.append(...[this.playbackRateButton, this.pipButton, fullScreenButton].filter(Boolean));

      const liveBadge = createBadge('span', 20, 'primary');
      liveBadge.classList.add('stream-live-badge');
      liveBadge.classList.remove('is-badge-empty');
      liveBadge.innerText = 'LIVE';
      leftControls.insertBefore(liveBadge, timeElapsed);

      const volumeSelector = new VolumeSelector(listenerSetter);

      volumeSelector.btn.classList.remove('btn-icon');
      leftControls.insertBefore(volumeSelector.btn, timeElapsed);

      if(this.pipButton) {
        attachClickEvent(this.pipButton, () => {
          this.video.requestPictureInPicture();
        }, {listenerSetter: this.listenerSetter});

        const onPip = (pip: boolean) => {
          this.wrapper.style.visibility = pip ? 'hidden': '';
          if(this.onPip) {
            this.onPip(pip);
          }
        };

        const debounceTime = 20;
        const debouncedPip = debounce(onPip, debounceTime, false, true);

        listenerSetter.add(video)('enterpictureinpicture', () => {
          debouncedPip(true);

          listenerSetter.add(video)('leavepictureinpicture', () => {
            const onPause = () => {
              clearTimeout(timeout);
              if(this.onPipClose) {
                this.onPipClose();
              }
            };
            const listener = listenerSetter.add(video)('pause', onPause, {once: true}) as any as Listener;
            const timeout = setTimeout(() => {
              listenerSetter.remove(listener);
            }, debounceTime);
          }, {once: true});
        });

        listenerSetter.add(video)('leavepictureinpicture', () => {
          debouncedPip(false);
        });
      }

      if(!IS_TOUCH_SUPPORTED) {
        attachClickEvent(video, () => {
          this.togglePlay();
        }, {listenerSetter: this.listenerSetter});

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
          } else if(code === 'Space') {
            this.togglePlay();
          } else if(e.altKey && (code === 'Equal' || code === 'Minus')) {
            const add = code === 'Equal' ? 1 : -1;
            const playbackRate = appMediaPlaybackController.playbackRate;
            const idx = StreamPlayer.PLAYBACK_RATES.indexOf(playbackRate);
            const nextIdx = idx + add;
            if(nextIdx >= 0 && nextIdx < StreamPlayer.PLAYBACK_RATES.length) {
              appMediaPlaybackController.playbackRate = StreamPlayer.PLAYBACK_RATES[nextIdx];
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

      listenerSetter.add(video)('play', () => {
        wrapper.classList.add('played');

        if(!IS_TOUCH_SUPPORTED) {
          listenerSetter.add(video)('play', () => {
            this.hideControls(true);
          });
        }
      }, {once: true});

      listenerSetter.add(video)('pause', () => {
        this.showControls(false);
      });
    }

    listenerSetter.add(video)('play', () => {
      this.setIsPlaing(true);
    });

    listenerSetter.add(video)('pause', () => {
      this.setIsPlaing(false);
    });
  }

  protected togglePlay(isPaused = this.video.paused) {
    this.video[isPaused ? 'play' : 'pause']();
  }

  private buildControls() {
    const skin = this.skin;
    if(skin === 'default') {
      return `
      <div class="${skin}__gradient-bottom ckin__controls"></div>
      <div class="${skin}__controls ckin__controls">
        <div class="bottom-controls">
          <div class="left-controls">
            <div class="time">
                
            </div>
          </div>
          <div class="right-controls"></div>
        </div>
      </div>`;
    }
  }

  public updateToggle(startRecord: boolean) {
    this.recordAction = startRecord ? this.onRecord : this.onStopRecord;
    this.recordMenuItem.children.item(0).replaceChildren(Icon(startRecord ? 'radioon' : 'radiooff'));
    (this.recordMenuItem.children.item(1) as HTMLElement).innerText = startRecord ? 'Start Recording' : 'Stop Recording';
  }

  protected setBtnMenuToggle() {
    const buttons: Parameters<typeof ButtonMenuSync>[0]['buttons'][0][] = [
      {
        icon: 'speaker',
        regularText: 'Output Device',
        onClick: () => this.onOutput()
      },
      {
        icon: 'radioon',
        regularText: 'Start Recording',
        onClick: () => this.recordAction()
      },
      {
        icon: 'settings',
        regularText: 'Stream Settings',
        onClick: () => this.onSettings()
      },
      {
        icon: 'crossround',
        regularText: 'End Live Stream',
        className: 'danger',
        onClick: () => {
          // dfd
        }
      }
    ];
    const btnMenu = ButtonMenuSync({buttons});
    btnMenu.classList.add('top-left');
    ButtonMenuToggleHandler({
      el: this.playbackRateButton,
      onOpen: this.onPlaybackRackMenuToggle ? () => {
        this.onPlaybackRackMenuToggle(true);
      } : undefined,
      onClose: this.onPlaybackRackMenuToggle ? () => {
        this.onPlaybackRackMenuToggle(false);
      } : undefined
    });
    this.recordMenuItem = btnMenu.children.item(1) as HTMLElement;
    this.playbackRateButton.append(btnMenu);
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
      requestFullScreen(player);
    } else {
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

  public cleanup() {
    super.cleanup();
    this.listenerSetter.removeAll();
    this.onPlaybackRackMenuToggle = this.onPip = undefined;
  }
}
