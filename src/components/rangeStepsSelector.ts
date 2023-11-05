/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import {Middleware} from '../helpers/middleware';
import safeAssign from '../helpers/object/safeAssign';
import RangeSelector from './rangeSelector';

type RangeStep<T extends any = any> = [HTMLElement | string, T];
export default class RangeStepsSelector<T extends any = any> {
  public container: HTMLElement;
  protected steps: RangeStep<T>[];
  protected range: RangeSelector;
  protected optionsElements: ReturnType<RangeStepsSelector['createOption']>[];

  public middleware: Middleware;
  public onValue: (value: T) => void;
  public generateStep: (value: T) => RangeStep<T>;
  public generateSteps: (values: T[]) => RangeStep<T>[];
  protected noFirstLast: boolean;

  constructor(options: {
    middleware: RangeStepsSelector<T>['middleware'],
    generateStep: RangeStepsSelector<T>['generateStep'],
    generateSteps?: RangeStepsSelector<T>['generateSteps'],
    onValue?: RangeStepsSelector<T>['onValue'],
    noFirstLast?: boolean
  }) {
    safeAssign(this, options);

    this.generateSteps ??= (values) => values.map(this.generateStep);

    const container = this.container = document.createElement('div');
    container.classList.add('range-setting-selector', 'range-steps-selector');

    this.middleware.onClean(() => {
      this.range.removeListeners();
    });

    const range = this.range = new RangeSelector({step: 1});
    range.setListeners();
    range.setHandlers({
      onScrub: this.onIndex
    });

    container.append(range.container);
  }

  protected createOption(label: RangeStep[0], idx: number, maxIndex: number) {
    const option = document.createElement('div');
    option.classList.add('range-setting-selector-option');
    const text = document.createElement('div');
    text.classList.add('range-setting-selector-option-text');
    text.replaceChildren(label);
    option.append(text);
    option.style.left = `${idx / maxIndex * 100}%`;

    if(idx === 0 && !this.noFirstLast) option.classList.add('is-first');
    else if(idx === maxIndex) {
      option.style.left = '';
      option.style.right = '0';
      !this.noFirstLast && option.classList.add('is-last');
    }

    return {container: option, text};
  }

  public setSteps(steps: RangeStep[], index?: number) {
    if(this.optionsElements) {
      this.optionsElements.forEach(({container}) => container.remove());
    }

    const maxIndex = steps.length - 1;
    this.range.setMinMax(0, maxIndex);
    this.steps = steps;

    this.optionsElements = steps.map(([label], idx) => {
      const option = this.createOption(label, idx, maxIndex);
      this.range.container.append(option.container);
      return option;
    });

    if(index !== undefined) {
      this.setIndex(index);
    }
  }

  protected onIndex = (index: number) => {
    this.onValue?.(this.steps[index][1]);
    this.optionsElements.forEach(({container}, idx) => {
      container.classList.toggle('active', index >= idx);
      container.classList.toggle('is-chosen', index === idx);
    });
  };

  public setIndex(index: number) {
    this.range.setProgress(index);
    this.onIndex(index);
  }

  public removeListeners() {
    this.range.removeListeners();
  }

  public get value() {
    return this.steps[this.range.value][1];
  }
}
