/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import { isTouchSupported } from "../helpers/touchSupport";
import { clamp } from "../helpers/number";

type SUPEREVENT = MouseEvent | TouchEvent;

export default class RangeSelector {
  public container: HTMLDivElement;
  protected filled: HTMLDivElement;
  protected seek: HTMLInputElement;

  public mousedown = false;

  private events: Partial<{
    //onMouseMove: ProgressLine['onMouseMove'],
    onMouseDown: RangeSelector['onMouseDown'],
    onMouseUp: RangeSelector['onMouseUp'],
    onScrub: (scrubTime: number) => void
  }> = {};

  protected decimals: number;

  constructor(protected step: number, protected value: number, protected min: number, protected max: number) {
    this.container = document.createElement('div');
    this.container.classList.add('progress-line');

    this.filled = document.createElement('div');
    this.filled.classList.add('progress-line__filled');

    const seek = this.seek = document.createElement('input');
    seek.classList.add('progress-line__seek');
    //seek.setAttribute('max', '0');
    seek.type = 'range';
    seek.step = '' + step;
    seek.min = '' + this.min;
    seek.max = '' + this.max;
    seek.value = '' + value;

    /* this.seek.addEventListener('change', (e) => {
      console.log('seek change', e);
    }); */

    if(value) {
      this.setProgress(value);
    }

    const stepStr = '' + this.step;
    const index = stepStr.indexOf('.');
    this.decimals = index === -1 ? 0 : stepStr.length - index - 1;

    //this.setListeners();

    this.container.append(this.filled, seek);
  }

  public setHandlers(events: RangeSelector['events']) {
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

  public setProgress(value: number) {
    this.setFilled(value);
    this.seek.value = '' + value;
  }

  public setFilled(value: number) {
    let percents = (value - this.min) / (this.max - this.min);
    percents = clamp(percents, 0, 1);
    //console.log('setFilled', percents, value);
    this.filled.style.width = (percents * 100) + '%';
    //this.filled.style.transform = 'scaleX(' + scaleX + ')';
  }

  protected scrub(e: SUPEREVENT) {
    let offsetX: number;
    const rect = (e.target as HTMLElement).getBoundingClientRect();
    if(e instanceof MouseEvent) {
      offsetX = e.pageX - Math.round(rect.left);
    } else { // touch
      offsetX = e.targetTouches[0].pageX - Math.round(rect.left);
    }

    let value = this.min + (offsetX / Math.round(rect.width) * (this.max - this.min));

    if((value - this.min) < ((this.max - this.min) / 2)) {
      value -= this.step / 10;
    }
    
    //console.log('scrub value:', value, this.decimals, offsetX, rect.width, e);
    value = +value.toFixed(this.decimals);
    //const dotIndex = ('' + value).indexOf('.');
    //value = +('' + value).slice(0, this.decimals ? dotIndex + this.decimals : dotIndex);

    value = clamp(value, this.min, this.max);

    this.setFilled(value);

    this.events?.onScrub && this.events.onScrub(value);
    return value;
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