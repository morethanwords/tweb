/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import findUpClassName from '../helpers/dom/findUpClassName';
import EventListenerBase from '../helpers/eventListenerBase';
import mediaSizes from '../helpers/mediaSizes';
import clamp from '../helpers/number/clamp';
import safeAssign from '../helpers/object/safeAssign';
import windowSize from '../helpers/windowSize';
import SwipeHandler from './swipeHandler';

type ResizeSide = 'n' | 'e' | 's' | 'w' | 'ne' | 'se' | 'sw' | 'nw';
export type MovableState = {
  top?: number;
  left?: number;
  width: number;
  height: number;
};

const className = 'movable-element';
const resizeHandlerClassName = className + '-resize-handler';

export type MovableElementOptions = {
  minWidth: MovableElement['minWidth'],
  minHeight: MovableElement['minHeight'],
  element: MovableElement['element'],
  verifyTouchTarget?: MovableElement['verifyTouchTarget']
};

export default class MovableElement extends EventListenerBase<{
  resize: () => void
}> {
  private minWidth: number;
  private minHeight: number;
  private element: HTMLElement;
  private verifyTouchTarget: SwipeHandler['verifyTouchTarget'];

  private top: number;
  private left: number;
  private _width: number;
  private _height: number;

  private swipeHandler: SwipeHandler;
  private handlers: HTMLElement[];

  constructor(options: MovableElementOptions) {
    super(true);
    safeAssign(this, options);

    this.top = this.left = this.width = this.height = 0;
    this.element.classList.add(className);

    this.addResizeHandlers();
    this.setSwipeHandler();

    mediaSizes.addEventListener('resize', this.onResize);
  }

  private onResize = () => {
    this.fixDimensions();
    this.fixPosition();
    this.setPosition();
  };

  public destroyElements() {
    this.element.classList.remove(className);

    if(this.handlers) {
      this.handlers.forEach((handler) => {
        handler.remove();
      });
    }
  }

  public destroy() {
    mediaSizes.removeEventListener('resize', this.onResize);
    this.swipeHandler.removeListeners();
  }

  private addResizeHandlers() {
    const sides: ResizeSide[] = ['n', 'e', 's', 'w', 'ne', 'se', 'sw', 'nw'];
    this.handlers = sides.map((side) => {
      const div = document.createElement('div');
      div.dataset.side = side;
      div.classList.add(resizeHandlerClassName, resizeHandlerClassName + '-side-' + side);
      this.element.append(div);
      return div;
    });
  }

  private setSwipeHandler() {
    let startTop: number, startLeft: number, startWidth: number, startHeight: number, resizingSide: ResizeSide;
    const swipeHandler = this.swipeHandler = new SwipeHandler({
      element: this.element,
      onSwipe: (xDiff, yDiff, e) => {
        // console.log(xDiff, yDiff, e);

        if(resizingSide) {
          if(resizingSide.includes('e') || resizingSide.includes('w')) {
            const isEnlarging = resizingSide.includes('e') && xDiff > 0 || resizingSide.includes('w') && xDiff < 0;
            const resizeDiff = Math.abs(xDiff) * (isEnlarging ? 1 : -1);

            const maxPossible = resizingSide.includes('e') ? windowSize.width - startLeft : startWidth + startLeft;
            this.width = Math.min(maxPossible, startWidth + resizeDiff);
          }

          if(resizingSide.includes('n') || resizingSide.includes('s')) {
            const isEnlarging = resizingSide.includes('s') && yDiff > 0 || resizingSide.includes('n') && yDiff < 0;
            const resizeDiff = Math.abs(yDiff) * (isEnlarging ? 1 : -1);

            const maxPossible = resizingSide.includes('s') ? windowSize.height - startTop : startHeight + startTop;
            this.height = Math.min(maxPossible, startHeight + resizeDiff);
          }

          this.fixDimensions();

          if(resizingSide.includes('w')) {
            this.left = Math.min(startLeft + startWidth - this.minWidth, startLeft + xDiff);
          }

          if(resizingSide.includes('n')) {
            this.top = Math.min(startTop + startHeight - this.minHeight, startTop + yDiff);
          }
        } else {
          this.top = startTop + yDiff;
          this.left = startLeft + xDiff;
        }

        this.fixPosition();
        this.setPosition();
      },
      verifyTouchTarget: (e) => {
        const target = e.target;
        if(this.verifyTouchTarget && !this.verifyTouchTarget(e)) {
          return false;
        }

        const resizeHandler = findUpClassName(target, resizeHandlerClassName);
        if(resizeHandler) {
          resizingSide = resizeHandler.dataset.side as ResizeSide;
          swipeHandler.setCursor('');
        } else {
          resizingSide = undefined;
          swipeHandler.setCursor('grabbing');
        }

        return true;
      },
      onFirstSwipe: () => {
        startTop = this.top;
        startLeft = this.left;
        startWidth = this.width;
        startHeight = this.height;
      }
    });
  }

  public setPositionToCenter() {
    this.top = (windowSize.height / 2) - (this.height / 2);
    this.left = (windowSize.width / 2) - (this.width / 2);
    this.setPosition();
  }

  private fixDimensions() {
    this.width = clamp(this.width, this.minWidth, windowSize.width);
    this.height = clamp(this.height, this.minHeight, windowSize.height);
  }

  private fixPosition() {
    this.top = clamp(this.top, 0, windowSize.height - this.height);
    this.left = clamp(this.left, 0, windowSize.width - this.width);
  }

  private setPosition() {
    this.element.style.top = this.top + 'px';
    this.element.style.left = this.left + 'px';
    this.element.style.right = 'auto';
    this.element.style.bottom = 'auto';
    this.element.style.width = this.width + 'px';
    this.element.style.height = this.height + 'px';

    this.dispatchEvent('resize');
  }

  public get width() {
    return this._width;
  }

  public get height() {
    return this._height;
  }

  private set width(value: number) {
    this._width = value;
  }

  private set height(value: number) {
    this._height = value;
  }

  public get state(): MovableState {
    const {top, left, width, height} = this;
    return {
      top,
      left,
      width,
      height
    };
  }

  public set state(state: MovableState) {
    const {top, left, width, height} = state;
    this.top = top;
    this.left = left;
    this.width = width;
    this.height = height;
    this.onResize();
  }
}
