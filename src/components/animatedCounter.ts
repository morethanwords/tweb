import {AnimatedSuper} from './animatedSuper.js';

export interface AnimatedCounterOptions {
  reverse?: boolean;
  duration?: number;
}

export class AnimatedCounter {
  static EMPTY_INDEX = -1;
  static BASE_CLASS = 'animated-counter';
  container: HTMLElement;
  decimals: {
    container: HTMLElement,
    placeholder: HTMLElement,
    animatedSuper: AnimatedSuper
  }[] = [];
  previousNumber = 0;
  clearTimeout: number;

  reverse: AnimatedCounterOptions['reverse'];
  duration: AnimatedCounterOptions['duration'];

  constructor(options: AnimatedCounterOptions) {
    this.reverse = options.reverse;
    this.duration = options.duration ?? AnimatedSuper.DEFAULT_DURATION;
    this.container = document.createElement('div');
    this.container.className = AnimatedCounter.BASE_CLASS;
  }

  getDecimal(index: number) {
    if(this.decimals[index]) return this.decimals[index];
    const item = document.createElement('div');
    item.className = AnimatedCounter.BASE_CLASS + '-decimal';

    const placeholder = document.createElement('div');
    placeholder.className = AnimatedCounter.BASE_CLASS + '-decimal-placeholder';

    const animatedSuper = new AnimatedSuper({duration: this.duration});
    animatedSuper.container.className = AnimatedCounter.BASE_CLASS + '-decimal-wrapper';

    item.append(placeholder, animatedSuper.container);

    this.container.append(item);

    return this.decimals[index] = {container: item, placeholder, animatedSuper};
  }

  clear(number: number) {
    if(this.clearTimeout) clearTimeout(this.clearTimeout);

    const decimals = ('' + number).length;
    if(decimals >= this.decimals.length) {
      return;
    }

    this.clearTimeout = window.setTimeout(() => {
      const byDecimal = this.decimals.splice(decimals, this.decimals.length - decimals);
      byDecimal.forEach((decimal) => {
        decimal.container.remove();
      });
    }, this.duration);
  }

  hideLeft(number: number) {
    const decimals = ('' + number).length;
    const byDecimal = this.decimals.slice(decimals);// this.decimals.splice(deleteCount, this.decimals.length - deleteCount);
    byDecimal.forEach((decimal) => {
      const previousDecimalNumber = +decimal.placeholder.innerText || 0;
      const row = decimal.animatedSuper.getRow(AnimatedCounter.EMPTY_INDEX, true);
      decimal.animatedSuper.animate(AnimatedCounter.EMPTY_INDEX, previousDecimalNumber, this.reverse ? number < this.previousNumber : number > this.previousNumber, true);
    });

    this.clear(number);
  }

  setCount(number: number) {
    // this.prepareNumber(number);

    const previousByDecimal = Array.from('' + this.previousNumber).map((n) => +n);
    const byDecimal = Array.from('' + number).map((n) => +n);
    byDecimal.forEach((decimalNumber, idx) => {
      const decimal = this.getDecimal(idx);
      const row = decimal.animatedSuper.getRow(decimalNumber, true);
      const previousDecimalNumber = previousByDecimal[idx] ?? AnimatedCounter.EMPTY_INDEX;
      row.innerText = decimal.placeholder.innerText = '' + decimalNumber;
      decimal.animatedSuper.animate(decimalNumber, previousDecimalNumber, this.reverse ? number < this.previousNumber : number > this.previousNumber, true);
    });

    this.hideLeft(number);
    // this.clear(number);
    this.previousNumber = number;
  }

  destroy() {
    this.decimals.forEach((decimal) => {
      decimal.animatedSuper.destroy();
    });
  }
}
