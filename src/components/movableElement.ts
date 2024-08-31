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
  verifyTouchTarget?: MovableElement['verifyTouchTarget'],
  aspectRatio?: MovableElement['aspectRatio'],
  resetTransition?: MovableElement['resetTransition']
};

export default class MovableElement extends EventListenerBase<{
  resize: (state: MovableState) => void
}> {
  private minWidth: number;
  private minHeight: number;
  private element: HTMLElement;
  private verifyTouchTarget: (evt: Parameters<SwipeHandler['verifyTouchTarget']>[0], type: 'resize' | 'move') => boolean;
  private aspectRatio: number;
  private resetTransition: boolean;

  private top: number;
  private left: number;
  private _width: number;
  private _height: number;

  private swipeHandler: SwipeHandler;
  private handlers: HTMLElement[];
  private overlay: HTMLElement;

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
    this.fixDimensions(true);
    this.fixPosition();
    this.setPosition();
  };

  public toggleResizable(value: boolean) {
    if(!value) {
      this.destroyResizeHandlers();
    } else {
      this.addResizeHandlers();
    }
  }

  public destroyElements() {
    this.element.classList.remove(className);
    this.destroyResizeHandlers();
  }

  public destroyResizeHandlers() {
    if(this.handlers) {
      this.handlers.forEach((handler) => {
        handler.remove();
      });

      this.handlers = undefined;
    }
  }

  public destroy() {
    mediaSizes.removeEventListener('resize', this.onResize);
    this.swipeHandler.removeListeners();
  }

  private addResizeHandlers() {
    if(this.handlers) {
      return;
    }

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
    let startTop: number,
      startLeft: number,
      startWidth: number,
      startHeight: number,
      startExtraHeight: number,
      startExtraWidth: number,
      resizingSide: ResizeSide;
    const swipeHandler = this.swipeHandler = new SwipeHandler({
      element: this.element,
      onSwipe: (xDiff, yDiff, e) => {
        // console.log(xDiff, yDiff, e);

        if(resizingSide) {
          const changingWidth = resizingSide.includes('e') || resizingSide.includes('w');
          const changingHeight = resizingSide.includes('n') || resizingSide.includes('s');
          const maxPossibleWidth = resizingSide.includes('e') || !changingWidth ? windowSize.width - startLeft : startWidth + startLeft;
          const maxPossibleHeight = resizingSide.includes('s') || !changingHeight ? windowSize.height - startTop : startHeight + startTop;

          if(changingWidth) {
            const isEnlarging = resizingSide.includes('e') && xDiff > 0 || resizingSide.includes('w') && xDiff < 0;
            const resizeDiff = Math.abs(xDiff) * (isEnlarging ? 1 : -1);

            this.width = clamp(startWidth + resizeDiff, this.minWidth, maxPossibleWidth);

            if(this.aspectRatio) {
              this.height = clamp(this.width / this.aspectRatio + startExtraHeight, this.minHeight, maxPossibleHeight);
              this.width = this.height * this.aspectRatio + startExtraWidth;
            }
          }

          if(changingHeight) {
            const isEnlarging = resizingSide.includes('s') && yDiff > 0 || resizingSide.includes('n') && yDiff < 0;
            const resizeDiff = Math.abs(yDiff) * (isEnlarging ? 1 : -1);

            this.height = clamp(startHeight + resizeDiff, this.minHeight, maxPossibleHeight);

            if(this.aspectRatio) {
              this.width = clamp(this.height * this.aspectRatio + startExtraWidth, this.minWidth, maxPossibleWidth);
              this.height = this.width / this.aspectRatio + startExtraHeight;
            }
          }

          // this.fixDimensions();

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
        const resizeHandler = findUpClassName(target, resizeHandlerClassName);

        if(this.verifyTouchTarget && !this.verifyTouchTarget(e, resizeHandler ? 'resize' : 'move')) {
          return false;
        }

        if(resizeHandler) {
          resizingSide = resizeHandler.dataset.side as ResizeSide;
          let cursor: Parameters<SwipeHandler['setCursor']>[0] = 'col-resize';
          if(resizingSide === 'nw' || resizingSide === 'se') {
            cursor = 'nwse-resize';
          } else if(resizingSide === 'ne' || resizingSide === 'sw') {
            cursor = 'nesw-resize';
          } else if(resizingSide === 'n' || resizingSide === 's') {
            cursor = 'row-resize';
          }
          swipeHandler.setCursor(cursor);
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

        if(!this.overlay) {
          this.overlay = document.createElement('div');
          this.overlay.classList.add(className + '-overlay');
        }

        this.element.append(this.overlay);

        if(this.aspectRatio) {
          startExtraWidth = this.width - this.height * this.aspectRatio;
          startExtraHeight = this.height - this.width / this.aspectRatio;
        }

        if(this.resetTransition) {
          this.element.classList.add('no-transition');
          void this.element.offsetLeft; // reflow
        }
      },
      onReset: () => {
        if(this.resetTransition) {
          this.element.classList.remove('no-transition');
        }

        this.overlay.remove();
      },
      setCursorTo: document.body
    });
  }

  public setPositionToCenter() {
    this.top = (windowSize.height / 2) - (this.height / 2);
    this.left = (windowSize.width / 2) - (this.width / 2);
    this.setPosition();
  }

  private fixDimensions(fixAspectRatio?: boolean) {
    if(fixAspectRatio && this.aspectRatio) {
      const extraWidth = this.width - this.height * this.aspectRatio;
      const extraHeight = this.height - this.width / this.aspectRatio;

      const maxPossibleWidth = windowSize.width - this.left;
      const maxPossibleHeight = windowSize.height - this.top;
      if(this.width > maxPossibleWidth) {
        this.width = maxPossibleWidth;
        this.height = this.width / this.aspectRatio + extraHeight;
      } else if(this.height > maxPossibleHeight) {
        this.height = maxPossibleHeight;
        this.width = this.height * this.aspectRatio + extraWidth;
      } else {
        return;
      }
    }

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

    this.dispatchEvent('resize', this.state);
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

  public setMinValues(width: number, height: number) {
    this.minWidth = width;
    this.minHeight = height;
  }
}
