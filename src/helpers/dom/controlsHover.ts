/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import IS_TOUCH_SUPPORTED from '../../environment/touchSupport';
import EventListenerBase from '../eventListenerBase';
import ListenerSetter from '../listenerSetter';
import safeAssign from '../object/safeAssign';
import findUpClassName from './findUpClassName';

export default class ControlsHover extends EventListenerBase<{
  toggleControls: (show: boolean) => void
}> {
  protected hideControlsTimeout: number;
  protected controlsLocked: boolean;

  protected canHideControls: () => boolean;
  protected canShowControls: () => boolean;
  protected element: HTMLElement;
  protected listenerSetter: ListenerSetter;
  protected showOnLeaveToClassName: string;
  protected ignoreClickClassName: string;

  constructor() {
    super(false);
    this.hideControlsTimeout = 0;
  }

  public setup(options: {
    element: HTMLElement,
    listenerSetter: ListenerSetter,
    canHideControls?: () => boolean,
    canShowControls?: () => boolean,
    showOnLeaveToClassName?: string,
    ignoreClickClassName?: string
  }) {
    safeAssign(this, options);

    const {listenerSetter, element} = this;

    if(IS_TOUCH_SUPPORTED) {
      listenerSetter.add(element)('click', (e) => {
        if(this.ignoreClickClassName && findUpClassName(e.target, this.ignoreClickClassName)) {
          return;
        }

        this.toggleControls();
      });

      /* listenerSetter.add(player)('touchstart', () => {
        showControls(false);
      });

      listenerSetter.add(player)('touchend', () => {
        if(player.classList.contains('is-playing')) {
          showControls();
        }
      }); */
    } else {
      listenerSetter.add(element)('mousemove', () => {
        this.showControls();
      });

      listenerSetter.add(element)('mouseenter', () => {
        this.showControls(false);
      });

      listenerSetter.add(element)('mouseleave', (e) => {
        if(e.relatedTarget && this.showOnLeaveToClassName && findUpClassName(e.relatedTarget, this.showOnLeaveToClassName)) {
          this.showControls(false);
          return;
        }

        this.hideControls();
      });
    }
  }

  public hideControls = (setHideTimeout = false) => {
    if(setHideTimeout) {
      if(!this.hideControlsTimeout) {
        this.hideControlsTimeout = window.setTimeout(this.hideControls, 3e3);
      }

      return;
    }

    clearTimeout(this.hideControlsTimeout);
    this.hideControlsTimeout = 0;

    const isShown = this.element.classList.contains('show-controls');
    if(this.controlsLocked !== false) {
      if((this.canHideControls ? !this.canHideControls() : false) || !isShown || this.controlsLocked) {
        return;
      }
    } else if(!isShown) {
      return;
    }

    this.dispatchEvent('toggleControls', false);
    this.element.classList.remove('show-controls');
  };

  public showControls = (setHideTimeout = true) => {
    if(!(this.canShowControls?.() ?? true)) return;

    if(this.hideControlsTimeout) {
      clearTimeout(this.hideControlsTimeout);
      this.hideControlsTimeout = 0;
    } else if(!this.element.classList.contains('show-controls') && this.controlsLocked !== false) {
      this.dispatchEvent('toggleControls', true);
      this.element.classList.add('show-controls');
    }

    if(!setHideTimeout || this.controlsLocked) {
      return;
    }

    this.hideControlsTimeout = window.setTimeout(this.hideControls, 3e3);
  };

  public toggleControls = (show?: boolean) => {
    const isShown = this.element.classList.contains('show-controls');

    if(show === undefined) {
      if(isShown) this.hideControls();
      else this.showControls();
    } else if(show === isShown) return;
    else if(show === false) this.hideControls();
    else this.showControls();
  };

  public lockControls(visible: boolean) {
    if(this.controlsLocked === visible) {
      return;
    }

    this.controlsLocked = visible;
    this.element.classList.toggle('disable-hover', visible === false);
    this.toggleControls(visible);
  }
}
