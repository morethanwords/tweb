/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import { clamp } from "../helpers/number";
import attachGrabListeners, { GrabEvent } from "../helpers/dom/attachGrabListeners";

export default class RangeSelector {
  public container: HTMLDivElement;
  protected filled: HTMLDivElement;
  protected seek: HTMLInputElement;

  public mousedown = false;
  protected rect: DOMRect;
  protected _removeListeners: () => void;

  private events: Partial<{
    //onMouseMove: ProgressLine['onMouseMove'],
    onMouseDown: RangeSelector['onMouseDown'],
    onMouseUp: RangeSelector['onMouseUp'],
    onScrub: (value: number) => void
  }> = {};

  protected decimals: number;

  constructor(protected step: number, value: number, protected min: number, protected max: number, withTransition = false) {
    this.container = document.createElement('div');
    this.container.classList.add('progress-line');
    if(withTransition) {
      this.container.classList.add('with-transition');
    }

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

    if(value) {
      this.setProgress(value);
    }

    const stepStr = '' + this.step;
    const index = stepStr.indexOf('.');
    this.decimals = index === -1 ? 0 : stepStr.length - index - 1;

    //this.setListeners();

    this.container.append(this.filled, seek);
  }

  get value() {
    return +this.seek.value;
  }

  public setHandlers(events: RangeSelector['events']) {
    this.events = events;
  }

  protected onMouseMove = (event: GrabEvent) => {
    this.scrub(event);
  };

  protected onMouseDown = (event: GrabEvent) => {
    this.rect = this.container.getBoundingClientRect();
    this.mousedown = true;
    this.scrub(event);
    this.container.classList.add('is-focused');
    this.events?.onMouseDown && this.events.onMouseDown(event);
  };

  protected onMouseUp = (event: GrabEvent) => {
    this.mousedown = false;
    this.container.classList.remove('is-focused');
    this.events?.onMouseUp && this.events.onMouseUp(event);
  };

  public setListeners() {
    this.seek.addEventListener('input', this.onInput);
    this._removeListeners = attachGrabListeners(this.container, this.onMouseDown, this.onMouseMove, this.onMouseUp);
  }

  public onInput = () => {
    const value = +this.seek.value;
    this.setFilled(value);
    this.events?.onScrub && this.events.onScrub(value);
  };

  public setProgress(value: number) {
    this.seek.value = '' + value;
    this.setFilled(+this.seek.value); // clamp
  }

  public addProgress(value: number) {
    this.seek.value = '' + (+this.seek.value + value);
    this.setFilled(+this.seek.value); // clamp
  }

  public setFilled(value: number) {
    let percents = (value - this.min) / (this.max - this.min);
    percents = clamp(percents, 0, 1);
    
    this.filled.style.width = (percents * 100) + '%';
    //this.filled.style.transform = 'scaleX(' + scaleX + ')';
  }

  protected scrub(event: GrabEvent) {
    const offsetX = clamp(event.x - this.rect.left, 0, this.rect.width);

    let value = this.min + (offsetX / this.rect.width * (this.max - this.min));

    if((value - this.min) < ((this.max - this.min) / 2)) {
      value -= this.step / 10;
    }
    
    value = +value.toFixed(this.decimals);
    value = clamp(value, this.min, this.max);

    //this.seek.value = '' + value;
    //this.onInput();

    this.setProgress(value);
    this.events?.onScrub && this.events.onScrub(value);

    return value;
  }

  public removeListeners() {
    if(this._removeListeners) {
      this._removeListeners();
      this._removeListeners = null;
    }

    this.seek.removeEventListener('input', this.onInput);
    
    this.events = {};
  }
}
