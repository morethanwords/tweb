import {getMiddleware, MiddlewareHelper} from '@helpers/middleware';
import {onAppWindowChange} from '@helpers/appWindow';

export interface AnimatedSuperOptions {
  duration?: number;
}

/** what a row is known by - a number, or the very character it shows (`AnimatedCounter.setText`) */
export type AnimatedSuperIndex = number | string;

/**
 * Calls `callback` `duration` ms after the frame that renders the change just made to `element`, where
 * the transitions it set off start, and not after the change itself: a long task between the two (a paid
 * reaction's effect starting) would have it cut them short. Returns what cancels it
 */
export function afterTransition(element: HTMLElement, duration: number, callback: () => void) {
  // * the window the element is in, which is a Document Picture-in-Picture one while the app is there
  const view = element.ownerDocument.defaultView ?? window;
  let timeout: number, isOver = false;
  const over = () => {
    isOver = true;
    stopFollowing();
  };
  const done = () => {
    if(isOver) return;
    over();
    callback();
  };
  // * a Picture-in-Picture window takes its frames and timers with it as it closes, while the app leaves it:
  // * what waits is done at once when the app changes windows, the move hiding the end of the transition
  const stopFollowing = onAppWindowChange(done);
  const frame = view.requestAnimationFrame(() => timeout = view.setTimeout(done, duration));
  return () => {
    // * nothing of a window that may be gone once it is over
    if(isOver) return;
    over();
    view.cancelAnimationFrame(frame);
    view.clearTimeout(timeout);
  };
}

export class AnimatedSuper {
  static BASE_CLASS = 'animated-super';
  static DEFAULT_DURATION = 200;
  container: HTMLDivElement;
  rows: {[index: string]: {element: HTMLElement, middleware: MiddlewareHelper, timeout?: number, new?: true}} = {};
  /** cancels the clearing of the rows the last change left behind */
  cancelClear: () => void;

  duration: AnimatedSuperOptions['duration'];
  constructor(options?: AnimatedSuperOptions) {
    this.duration = options?.duration ?? AnimatedSuper.DEFAULT_DURATION;
    this.container = document.createElement('div');
    this.container.className = AnimatedSuper.BASE_CLASS;
  }

  public getRow(index: AnimatedSuperIndex, animateFirst = false) {
    if(this.rows[index]) return this.rows[index].element;
    const row = document.createElement('div');
    const isFirst = !Object.keys(this.rows).length && !animateFirst;
    row.className = AnimatedSuper.BASE_CLASS + '-row' + (isFirst ? '' : ' is-hiding hide');
    this.rows[index] = {element: row, middleware: row.middlewareHelper = getMiddleware(), new: true};
    this.container.append(row);
    return row;
  }

  /** Shows the row of `index` at once, with no transition, and drops every other */
  public setRow(index: AnimatedSuperIndex) {
    this.cancelClear?.();
    this.destroy();
    const row = this.getRow(index);
    delete this.rows[index].new;
    return row;
  }

  public clearRow(index: AnimatedSuperIndex) {
    if(!this.rows[index]) return;
    this.rows[index].element.remove();
    this.rows[index].middleware.destroy();
    delete this.rows[index];
  }

  public clearRows(currentIndex?: AnimatedSuperIndex) {
    this.cancelClear?.();
    this.cancelClear = afterTransition(this.container, this.duration, () => {
      for(const i in this.rows) {
        if(i === '' + currentIndex) continue;
        this.clearRow(i);
      }
    });
  }

  public setNewRow(index: AnimatedSuperIndex) {
    const row = this.rows[index];
    if(row.new) {
      row.element.classList.remove('is-hiding', 'hide');
      delete row.new;
    }

    this.clearRows(index);
  }

  public animate(index: AnimatedSuperIndex, previousIndex: AnimatedSuperIndex, fromTop = +index > +previousIndex, ignorePrevious = false) {
    if(index === previousIndex) { // * handle if set index 0 and previousIndex 0
      return this.setNewRow(index);
    }

    if(!this.rows[previousIndex] && !ignorePrevious) {
      return this.setNewRow(index);
    }

    if(this.prepare(index, previousIndex, fromTop)) {
      void this.rows[index].element.offsetLeft; // reflow
    }

    this.flip(index, previousIndex);
  }

  /**
   * Readies the change from `previousIndex` to `index` that `flip` makes: each row on its side,
   * the coming one in place but still hidden. Returns whether that one is new - and so has to be
   * styled where it comes from before the flip, which `animate` reflows for, and which a caller
   * readying many changes at once can wait a frame for
   */
  public prepare(index: AnimatedSuperIndex, previousIndex: AnimatedSuperIndex, fromTop: boolean) {
    // * the rows a flip leaves behind must not be cleared while this one waits for its own
    this.cancelClear?.();

    const row = this.rows[index];
    const previousRow = this.rows[previousIndex];
    const sides = ['from-top', 'from-bottom'];
    if(!fromTop) sides.reverse();

    row.element.classList.add(sides[0]);
    row.element.classList.remove(sides[1]);
    if(previousRow) {
      previousRow.element.classList.add(sides[1]);
      previousRow.element.classList.remove(sides[0]);
    }

    if(!row.new) {
      return false;
    }

    row.element.classList.remove('hide');
    return true;
  }

  public flip(index: AnimatedSuperIndex, previousIndex: AnimatedSuperIndex) {
    const row = this.rows[index];
    delete row.new;
    row.element.classList.remove('is-hiding');
    this.rows[previousIndex]?.element.classList.add('is-hiding');
    this.clearRows(index);
  }

  public destroy() {
    for(const i in this.rows) {
      this.clearRow(i);
    }
  }
}
