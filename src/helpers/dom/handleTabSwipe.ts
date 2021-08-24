/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import { cancelContextMenuOpening } from "../../components/misc";
import SwipeHandler from "../../components/swipeHandler";
import { cancelEvent } from "./cancelEvent";

export default function handleTabSwipe(container: HTMLElement, onSwipe: (next: boolean) => void) {
  /* let hadScroll = false;
  const onScroll = () => {
    swipeHandler.reset();
  };
  let firstSwipeChecked = false; */
  return new SwipeHandler({
    element: container, 
    /* onFirstSwipe: () => {
      this.scroll.container.addEventListener('scroll', onScroll, {passive: true});
    }, */
    onSwipe: (xDiff, yDiff, e) => {
      /* if(!firstSwipeChecked) {
        firstSwipeChecked = true;
        if(yDiff !== 0) {
          return true;
        }
      }

      cancelEvent(e); */

      if(Math.abs(yDiff) > 20) {
        return true;
      }

      if(Math.abs(xDiff) > Math.abs(yDiff)) {
        cancelEvent(e);
      } else if(Math.abs(yDiff) > Math.abs(xDiff)/*  || Math.abs(yDiff) > 20 */) {
        return true;
      }

      if(Math.abs(xDiff) > 50) {
        onSwipe(xDiff > 0);
        cancelContextMenuOpening();

        return true;
      }
    },
    /* onReset: () => {
      hadScroll = false;
      firstSwipeChecked = false;
      this.scroll.container.removeEventListener('scroll', onScroll);
    }, */
    cancelEvent: false
  });
}