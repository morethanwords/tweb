/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import SwipeHandler, {SwipeHandlerOptions} from '../../components/swipeHandler';
import cancelEvent from './cancelEvent';
import findUpClassName from './findUpClassName';
import isSwipingBackSafari from './isSwipingBackSafari';

export type SwipeHandlerHorizontalOptions = SwipeHandlerOptions & {
  // xThreshold?: number
};

export default function handleHorizontalSwipe(options: SwipeHandlerHorizontalOptions) {
  let cancelY = false, hadMove = false;
  return new SwipeHandler({
    ...options,
    verifyTouchTarget: (e) => {
      return !findUpClassName(e.target, 'progress-line') &&
        !isSwipingBackSafari(e as any as TouchEvent) &&
        (options.verifyTouchTarget ? options.verifyTouchTarget(e) : true);
    },
    onSwipe: (xDiff, yDiff, e) => {
      xDiff *= -1;
      yDiff *= -1;

      if(!cancelY && Math.abs(yDiff) > 20) {
        return true;
      }

      if(Math.abs(xDiff) > Math.abs(yDiff)) {
        cancelEvent(e as any as Event);
        cancelY = true;
      } else if(!cancelY && Math.abs(yDiff) > Math.abs(xDiff)/*  || Math.abs(yDiff) > 20 */) {
        return true;
      }

      /* if(!cancelY && options.xThreshold !== undefined && xDiff >= options.xThreshold) {
        cancelY = true;
      } */

      hadMove = true;
      return options.onSwipe(xDiff, yDiff, e);
    },
    onReset: () => {
      if(hadMove) options.onReset?.();
      cancelY = hadMove = false;
    },
    cancelEvent: false // cannot use cancelEvent on Safari iOS because scroll will be canceled too
  });
}
