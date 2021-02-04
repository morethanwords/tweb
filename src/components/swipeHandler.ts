export default class SwipeHandler {
  private xDown: number;
  private yDown: number;

  constructor(element: HTMLElement, private onSwipe: (xDiff: number, yDiff: number) => boolean, private verifyTouchTarget?: (evt: TouchEvent) => boolean) {
    element.addEventListener('touchstart', this.handleTouchStart, false);
    element.addEventListener('touchmove', this.handleTouchMove, false);
  }

  handleTouchStart = (evt: TouchEvent) => {
    if(this.verifyTouchTarget && !this.verifyTouchTarget(evt)) {
      this.xDown = this.yDown = null;
      return;
    }

    const firstTouch = evt.touches[0];
    this.xDown = firstTouch.clientX;
    this.yDown = firstTouch.clientY;
  };

  handleTouchMove = (evt: TouchEvent) => {
    if(this.xDown === null || this.yDown === null) {
      return;
    }

    const xUp = evt.touches[0].clientX;
    const yUp = evt.touches[0].clientY;

    const xDiff = this.xDown - xUp;
    const yDiff = this.yDown - yUp;

    // if(Math.abs(xDiff) > Math.abs(yDiff)) { /*most significant*/
    //   if(xDiff > 0) { /* left swipe */ 

    //   } else { /* right swipe */

    //   }                       
    // } else {
    //   if(yDiff > 0) { /* up swipe */ 
        
    //   } else { /* down swipe */
        
    //   }
    // }

    /* reset values */
    if(this.onSwipe(xDiff, yDiff)) {
      this.xDown = null;
      this.yDown = null;
    }
  };
}