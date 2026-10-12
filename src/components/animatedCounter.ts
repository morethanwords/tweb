import {fastRaf} from '@helpers/schedulers';
import getLayoutWidth from '@helpers/dom/getLayoutWidth';
import isInSight from '@helpers/dom/isInSight';
import liteMode from '@helpers/liteMode';
import sequentialDom from '@helpers/sequentialDom';
import {AnimatedSuper, AnimatedSuperIndex} from '@components/animatedSuper';

/** a character that stays put is not written again, and changes nothing to lay out */
function writeText(element: HTMLElement, text: string) {
  if(element.textContent !== text) {
    element.textContent = text;
  }
}

export interface AnimatedCounterOptions {
  reverse?: boolean;
  duration?: number;
  prefix?: string;
  calculateWidth?: ((text: string) => number) | true;
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
  prefixContainer?: HTMLElement;
  previousNumber = 0;
  /** the text it last put in, rolled to or at once */
  previousText = '0';
  clearTimeout: number;
  /** the roll `prepare` readied, for `commit` to make */
  private prepared: {text: string, flips: (() => void)[]};

  prefix?: AnimatedCounterOptions['prefix'];
  reverse: AnimatedCounterOptions['reverse'];
  duration: AnimatedCounterOptions['duration'];
  calculateWidth?: AnimatedCounterOptions['calculateWidth'];

  constructor(options: AnimatedCounterOptions) {
    this.reverse = options.reverse;
    this.duration = options.duration ?? AnimatedSuper.DEFAULT_DURATION;
    this.container = document.createElement('div');
    this.container.className = AnimatedCounter.BASE_CLASS;
    this.calculateWidth = options.calculateWidth;

    if(this.calculateWidth) {
      this.container.classList.add('animated-counter-dynamic-width');
    }

    if(options.prefix) {
      const prefixContainer = document.createElement('div');
      prefixContainer.className = AnimatedCounter.BASE_CLASS + '-decimal-prefix';
      prefixContainer.innerText = this.prefix = options.prefix;
      this.container.append(prefixContainer);
      this.prefixContainer = prefixContainer;
    }
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

  clear(length: number) {
    if(this.clearTimeout) clearTimeout(this.clearTimeout);

    if(length >= this.decimals.length) {
      return;
    }

    this.clearTimeout = window.setTimeout(() => {
      const byDecimal = this.decimals.splice(length, this.decimals.length - length);
      byDecimal.forEach((decimal) => {
        decimal.container.remove();
      });
    }, this.duration);
  }

  setCount(number: number, noRaf?: boolean) {
    this.setText('' + number, number - this.previousNumber, noRaf);
    this.previousNumber = number;
  }

  /**
   * Shows `text`, rolling each character that differs from the one in its place, so it takes
   * any short text and not only the digits of a number (`1.2K`, `@`). `direction` is the sign of
   * the change of the value behind it - what decides which way they roll (`putText` puts a text
   * in at once)
   */
  setText(text: string, direction: number, noRaf?: boolean) {
    if(this.prepare(text, direction)) {
      void this.container.offsetLeft; // * the rows that come in, styled where they come from
    }

    this.commit(noRaf);
  }

  /** Puts `text` in at once - and only it: the width follows on `updateWidth` */
  putText(text: string) {
    if(this.clearTimeout) clearTimeout(this.clearTimeout);
    this.prepared = undefined;

    const chars = Array.from(text);
    chars.forEach((char, idx) => {
      const decimal = this.getDecimal(idx);
      decimal.animatedSuper.setRow(char).textContent = decimal.placeholder.textContent = char;
    });

    this.decimals.splice(chars.length).forEach((decimal) => {
      decimal.animatedSuper.destroy();
      decimal.container.remove();
    });

    this.previousText = text;
  }

  /**
   * Readies the roll to `text` that `commit` makes: the rows of the characters that come in are
   * put in their places, still hidden. Returns whether one of them is new - and so has to be
   * styled before the commit, which `setText` reflows for, and which a caller readying many
   * counters can wait a frame for, all of them at once (`setRollingText`)
   */
  prepare(text: string, direction: number) {
    // * the decimals the last roll is taking away may be the ones this one needs
    if(this.clearTimeout) clearTimeout(this.clearTimeout);

    const fromTop = this.reverse ? direction < 0 : direction > 0;
    const previousChars = Array.from(this.previousText);
    const chars = Array.from(text);
    const flips: (() => void)[] = [];
    let hasNewRows = false;
    const ready = (animatedSuper: AnimatedSuper, index: AnimatedSuperIndex, previousIndex: AnimatedSuperIndex) => {
      if(index === previousIndex) {
        flips.push(() => animatedSuper.setNewRow(index));
        return;
      }

      hasNewRows = animatedSuper.prepare(index, previousIndex, fromTop) || hasNewRows;
      flips.push(() => animatedSuper.flip(index, previousIndex));
    };

    chars.forEach((char, idx) => {
      const {animatedSuper} = this.getDecimal(idx);
      writeText(animatedSuper.getRow(char, true), char);
      ready(animatedSuper, char, previousChars[idx] ?? AnimatedCounter.EMPTY_INDEX);
    });

    // * the decimals the text no longer reaches leave
    this.decimals.slice(chars.length).forEach(({animatedSuper, placeholder}) => {
      animatedSuper.getRow(AnimatedCounter.EMPTY_INDEX, true);
      ready(animatedSuper, AnimatedCounter.EMPTY_INDEX, placeholder.textContent);
    });

    this.prepared = {text, flips};
    return hasNewRows;
  }

  /** Makes the roll `prepare` readied */
  commit(noRaf?: boolean) {
    const {text, flips} = this.prepared;
    this.prepared = undefined;

    const chars = Array.from(text);
    chars.forEach((char, idx) => {
      writeText(this.decimals[idx].placeholder, char);
    });

    flips.forEach((flip) => flip());
    this.clear(chars.length);
    this.previousText = text;
    this.updateWidth(noRaf);
  }

  /** How wide the text it last put in is - a read of the layout */
  measureWidth() {
    const {calculateWidth} = this;
    if(typeof(calculateWidth) !== 'boolean') {
      return calculateWidth((this.prefix || '') + this.previousText);
    }

    // * fractional: the plain text it gives way to and comes back to is not cut to whole pixels
    let width = this.prefixContainer ? getLayoutWidth(this.prefixContainer) : 0;
    for(let i = 0, length = Array.from(this.previousText).length; i < length; ++i) {
      width += getLayoutWidth(this.decimals[i].container);
    }

    return width;
  }

  setWidth(width: number) {
    this.container.style.setProperty('--width', width + 'px');
  }

  /**
   * Makes it as wide as its text - at once, or in the next frame, where the counters read their
   * widths all before any of them writes one
   */
  updateWidth(noRaf?: boolean) {
    if(!this.calculateWidth) {
      return;
    }

    if(noRaf) {
      this.setWidth(this.measureWidth());
      return;
    }

    let width: number;
    sequentialDom.measure(() => width = this.measureWidth());
    sequentialDom.mutate(() => this.setWidth(width));
  }

  destroy() {
    if(this.clearTimeout) clearTimeout(this.clearTimeout);
    this.decimals.forEach((decimal) => {
      decimal.animatedSuper.destroy();
    });
  }
}

type RollingText = {
  counter: AnimatedCounter,
  /** the text as it reads while the counter, which holds every character twice, is hidden */
  label: HTMLElement,
  /** what it rolls to */
  text: string,
  /** of the roll last readied: a frame puts in motion only the last one */
  version: number,
  /** it still stands as wide as the text it started from, which nothing has measured yet */
  isSeeded: boolean,
  timeout: number
};

const rollingTexts: WeakMap<HTMLElement, RollingText> = new WeakMap();
/** the elements whose rolls were readied since the last frame began */
let readied: Set<HTMLElement> = new Set();

function settle(element: HTMLElement, rolling: RollingText) {
  clearTimeout(rolling.timeout);
  rolling.counter.destroy();
  rollingTexts.delete(element);
  element.classList.remove('is-rolling');
  element.textContent = rolling.text;
}

/**
 * Puts in motion the rolls readied before a frame that has rendered them since, in the measure and
 * mutate phases of the next flush (`sequentialDom`): every read of the layout before any write
 */
function commitRolls(batch: [HTMLElement, RollingText, number][]) {
  const isCurrent = ([element, rolling, version]: typeof batch[0]) => {
    return rollingTexts.get(element) === rolling && rolling.version === version;
  };

  let reads: {inSight: boolean, width?: number}[];
  sequentialDom.measure(() => {
    batch = batch.filter(isCurrent);
    reads = batch.map(([element, rolling]) => {
      const inSight = isInSight(element);
      return {inSight, width: inSight && rolling.isSeeded ? rolling.counter.measureWidth() : undefined};
    });
  });

  sequentialDom.mutate(() => batch.forEach((entry, i) => {
    const [element, rolling] = entry;
    // * readied anew since it was read: the next batch has it
    if(!isCurrent(entry)) {
      return;
    }

    const {inSight, width} = reads[i];
    // * nobody would see it roll
    if(!inSight) {
      settle(element, rolling);
      return;
    }

    if(width !== undefined) {
      rolling.counter.setWidth(width);
      rolling.isSeeded = false;
    }

    rolling.counter.commit();
    // * the width follows a frame later (`updateWidth`)
    rolling.timeout = window.setTimeout(() => settle(element, rolling), rolling.counter.duration + 100);
  }));
}

/**
 * Writes `text` into an element that holds nothing but it, such as a counter badge, rolling the
 * characters that change the way `AnimatedCounter` does. The counter is there only for the roll:
 * before it and after it the element holds the plain text, so a list that wears such a badge on
 * every row pays nothing for the rows that stand still, and the text reads as it always did.
 *
 * Nor does a roll read the layout while the caller writes to it: the counter is readied at once,
 * and the rolls of every element readied before a frame are put in motion together by the next
 * one - `commitRolls`
 */
export function setRollingText({element, text, direction, animate}: {
  element: HTMLElement,
  text: string,
  /** the sign of the change of the count behind the text: a growing one rolls up */
  direction: number,
  animate: boolean
}) {
  let rolling = rollingTexts.get(element);
  if(text === (rolling ? rolling.text : element.textContent)) {
    return;
  }

  if(!animate || document.hidden || !element.isConnected || !liteMode.isAvailable('motion')) {
    if(rolling) {
      rolling.text = text;
      settle(element, rolling);
    } else {
      element.textContent = text;
    }

    return;
  }

  if(rolling) {
    // * not to settle on the text it is leaving
    clearTimeout(rolling.timeout);
  } else {
    const counter = new AnimatedCounter({reverse: true, calculateWidth: true});
    counter.container.setAttribute('aria-hidden', 'true');
    // * it starts from the text it replaces, and is as wide as that until it is measured
    counter.putText(element.textContent);
    const label = document.createElement('span');
    label.className = 'sr-only';
    element.replaceChildren(counter.container, label);
    element.classList.add('is-rolling');
    rollingTexts.set(element, rolling = {counter, label, text, version: 0, isSeeded: true, timeout: 0});
  }

  rolling.counter.prepare(text, direction);
  rolling.label.textContent = rolling.text = text;
  ++rolling.version;

  const isScheduled = !!readied.size;
  readied.add(element);
  if(isScheduled) {
    return;
  }

  fastRaf(() => {
    // * what was readied before this frame is styled where it comes from once it renders,
    // * and the next frame puts it in motion
    const batch: [HTMLElement, RollingText, number][] = [];
    readied.forEach((element) => {
      const rolling = rollingTexts.get(element);
      if(rolling) batch.push([element, rolling, rolling.version]);
    });

    readied = new Set();
    // * from the next frame on, not to join a flush of this one, before the render
    fastRaf(() => commitRolls(batch));
  });
}
