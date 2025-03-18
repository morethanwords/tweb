/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import {animateSingle} from '../helpers/animation';
import {easeInOutSineApply} from '../helpers/easing/easeInOutSine';
import liteMode from '../helpers/liteMode';
import clamp from '../helpers/number/clamp';
import {doubleRaf} from '../helpers/schedulers';
import {_i18n, i18n} from '../lib/langPack';
import Icon from './icon';
import RangeSelector from './rangeSelector';

type LimitLineProgressElements = {
  from1: HTMLElement,
  from2: HTMLElement,
  to1: HTMLElement,
  to2: HTMLElement
};

export default class LimitLine {
  public container: HTMLElement;
  protected line: HTMLElement;
  protected left: HTMLElement;
  protected right: HTMLElement;
  protected hint: HTMLElement;
  protected hintNoStartEnd: boolean;
  protected lastProgress: number;

  constructor(options: {
    limitPremium?: number,
    limitFree?: number | string,
    color?: string,
    progress?: LimitLineProgressElements | true,
    hint?: {
      icon: Icon,
      content?: HTMLElement | string,
      noStartEnd?: boolean
      renderInsideTrack?: boolean
    },
    slider?: (progress: number) => void
    sliderValue?: number
  }) {
    let container: HTMLElement;
    let hint: HTMLElement;

    if(options.hint) {
      container = document.createElement('div');
      container.classList.add('limit-line-container');

      hint = this.hint = document.createElement('div');
      hint.classList.add('limit-line-hint', 'is-locked');
      const i = Icon(options.hint.icon, 'limit-line-hint-icon');
      hint.append(i);

      if(options.hint.content) {
        hint.append(options.hint.content);
      }

      this.hintNoStartEnd = options.hint.noStartEnd;
      container.append(hint);
    }

    const limit = options.slider ? this.constructSlider(options) : this.constructLine(options, container);
    this.container = container || limit;
    if(container) {
      if(limit) container.append(limit);
    }
  }

  private constructLine(options: ConstructorParameters<typeof LimitLine>[0], container?: HTMLElement) {
    const limit = this.line = document.createElement('div');
    limit.classList.add('limit-line');

    if(!container) {
      limit.classList.add('is-alone');
    }

    const left = this.left = document.createElement('div');
    left.classList.add('limit-line-part', 'limit-line-empty');

    const right = this.right = document.createElement('div');
    right.classList.add('limit-line-part', 'limit-line-filled');

    if(options.progress) {
      // const rightContainer = document.createElement('div');
      // rightContainer.classList.add('limit-line-absolute-container');
      // rightContainer.append(right);
      right.classList.add('limit-line-absolute');
      if(options.progress !== true) {
        this.setProgressElements(options.progress);
      }
    }

    if(options.limitPremium !== undefined) {
      if(options.limitFree === undefined) {
        _i18n(left, 'LimitFree');
      } else {
        left.append(i18n('LimitFree'), '' + options.limitFree);
      }

      if(options.color !== undefined) right.style.setProperty('--limit-background', options.color);
      limit.append(right);
      right.append(i18n('LimitPremium'), '' + options.limitPremium);
    }

    limit.append(left, right);
    return limit;
  }

  private constructSlider(options: ConstructorParameters<typeof LimitLine>[0]) {
    const range = new RangeSelector({
      step: 0.0001,
      min: 0,
      max: 1,
      useProperty: true,
      offsetAxisValue: 30
    }, options.sliderValue ?? 0);
    range.setListeners();
    range.setHandlers({
      onScrub: options.slider
    });

    range.container.classList.add('limit-line-slider');

    return this.line = range.container;
  }

  public setProgressElements(progress: LimitLineProgressElements) {
    this.left.replaceChildren(progress.from1, progress.to1);
    this.right.replaceChildren(progress.from2, progress.to2);
  }

  // [0..1]
  public setProgress(
    progress: number,
    hintContent?: HTMLElement | string,
    elements?: LimitLineProgressElements
  ) {
    const lastProgress = this.lastProgress;
    if(this.hint) {
      this.hint.classList.remove('is-locked');
      if(hintContent) {
        this.hint.replaceChildren(this.hint.firstElementChild, hintContent);
      }
    }

    const set = (value: number) => {
      this.container.style.setProperty('--limit-progress', value * 100 + '%');
      if(this.hint) {
        const t = 0.1;
        if(this.hintNoStartEnd) {
          this.hint.style.setProperty('--limit-progress', clamp(value, t, 1 - t) * 100 + '%')
        } else {
          this.hint.classList.toggle('is-start', value <= t);
          this.hint.classList.toggle('is-end', value >= (1 - t));
        }
      }
    };

    if(lastProgress !== undefined && liteMode.isAvailable('animations')) {
      const duration = 200;
      const startTime = Date.now();
      const toAdd = progress - this.lastProgress;
      animateSingle(() => {
        const v = (Date.now() - startTime) / duration;
        const value = lastProgress + easeInOutSineApply(toAdd * v, 1);
        set(value);

        return v < 1;
      }, this.container);
    } else {
      set(progress);
    }

    if(elements) {
      this.setProgressElements(elements);
    }

    this.lastProgress = progress;
  }

  public setHintActive = () => {
    this.hint.classList.add('active');
  };

  public _setHintActive() {
    if(liteMode.isAvailable('animations')) {
      doubleRaf().then(this.setHintActive);
    } else {
      this.setHintActive();
    }
  }
}
