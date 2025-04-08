import {getMiddleware, MiddlewareHelper} from '../helpers/middleware';

export interface AnimatedSuperOptions {
  duration?: number;
}

export class AnimatedSuper {
  static BASE_CLASS = 'animated-super';
  static DEFAULT_DURATION = 200;
  container: HTMLDivElement;
  rows: {[index: string]: {element: HTMLElement, middleware: MiddlewareHelper, timeout?: number, new?: true}} = {};
  clearTimeout: number;

  duration: AnimatedSuperOptions['duration'];
  constructor(options?: AnimatedSuperOptions) {
    this.duration = options?.duration ?? AnimatedSuper.DEFAULT_DURATION;
    this.container = document.createElement('div');
    this.container.className = AnimatedSuper.BASE_CLASS;
  }

  public getRow(index: number, animateFirst = false) {
    if(this.rows[index]) return this.rows[index].element;
    const row = document.createElement('div');
    const isFirst = !Object.keys(this.rows).length && !animateFirst;
    row.className = AnimatedSuper.BASE_CLASS + '-row' + (isFirst ? '' : ' is-hiding hide');
    this.rows[index] = {element: row, middleware: row.middlewareHelper = getMiddleware(), new: true};
    this.container.append(row);
    return row;
  }

  public clearRow(index: number) {
    if(!this.rows[index]) return;
    this.rows[index].element.remove();
    this.rows[index].middleware.destroy();
    delete this.rows[index];
  }

  public clearRows(currentIndex?: number) {
    if(this.clearTimeout) clearTimeout(this.clearTimeout);
    this.clearTimeout = window.setTimeout(() => {
      for(const i in this.rows) {
        if(+i === currentIndex) continue;
        this.clearRow(+i);
      }
    }, this.duration);
  }

  public setNewRow(index: number, reflow = false) {
    const row = this.rows[index];
    if(row.new) {
      if(reflow) {
        row.element.classList.remove('hide');
        void row.element.offsetLeft; // reflow
      } else {
        row.element.classList.remove('is-hiding', 'hide');
      }

      delete row.new;
    }

    this.clearRows(index);
  }

  public animate(index: number, previousIndex: number, fromTop = index > previousIndex, ignorePrevious = false) {
    if(index === previousIndex) { // * handle if set index 0 and previousIndex 0
      return this.setNewRow(index);
    }

    const row = this.rows[index];
    const previousRow = this.rows[previousIndex];
    if(!previousRow && !ignorePrevious) {
      return this.setNewRow(index);
    }

    const sides = ['from-top', 'from-bottom'];
    if(!fromTop) sides.reverse();

    row.element.classList.add(sides[0]);
    row.element.classList.remove(sides[1]);
    if(previousRow) {
      previousRow.element.classList.add(sides[1]);
      previousRow.element.classList.remove(sides[0]);
    }

    if(row.new) {
      this.setNewRow(index, true);
    }

    row.element.classList.toggle('is-hiding', false);
    previousRow && previousRow.element.classList.toggle('is-hiding', true);

    this.clearRows(index);
  }

  public destroy() {
    for(const i in this.rows) {
      this.clearRow(+i);
    }
  }
}
