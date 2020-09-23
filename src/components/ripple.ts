import { touchSupport } from "../lib/config";
import { findUpClassName } from "../lib/utils";

let rippleClickID = 0;
export function ripple(elem: HTMLElement, callback: (id: number) => Promise<boolean | void> = () => Promise.resolve(), onEnd: (id: number) => void = null) {
  //return;
  if(elem.querySelector('.c-ripple')) return;
  elem.classList.add('rp');
  
  let r = document.createElement('div');
  r.classList.add('c-ripple');

  const isSquare = elem.classList.contains('rp-square');
  if(isSquare) {
    r.classList.add('is-square');
  }

  const duration = isSquare ? 200 : 700;

  elem.append(r);

  let handler: () => void;
  let drawRipple = (clientX: number, clientY: number) => {
    let startTime = Date.now();
    let span = document.createElement('span');

    let clickID = rippleClickID++;

    //console.log('ripple drawRipple');

    handler = () => {
      //return;
      let elapsedTime = Date.now() - startTime;
      if(elapsedTime < duration) {
        let delay = Math.max(duration - elapsedTime, duration / 2);
        setTimeout(() => span.classList.add('hiding'), Math.max(delay - duration / 2, 0));

        setTimeout(() => {
          //console.log('ripple elapsedTime total pre-remove:', Date.now() - startTime);
          span.remove();
          if(onEnd) onEnd(clickID);
        }, delay);
      } else {
        span.classList.add('hiding');
        setTimeout(() => {
          //console.log('ripple elapsedTime total pre-remove:', Date.now() - startTime);
          span.remove();
          if(onEnd) onEnd(clickID);
        }, duration / 2);
      }

      handler = null;
    };

    callback && callback(clickID);

    /* callback().then((bad) => {
      if(bad) {
        span.remove();
        return;
      } */
      
      //console.log('ripple after promise', Date.now() - startTime);
      //console.log('ripple tooSlow:', tooSlow);
      /* if(tooSlow) {
        span.remove();
        return;
      } */

      window.requestAnimationFrame(() => {
        let rect = r.getBoundingClientRect();
        span.classList.add('c-ripple__circle');

        let clickX = clientX - rect.left;
        let clickY = clientY - rect.top;

        let size: number, clickPos: number;
        if(rect.width > rect.height) {
          size = rect.width;
          clickPos = clickX;
        } else {
          size = rect.height;
          clickPos = clickY;
        }

        let offsetFromCenter = clickPos > (size / 2) ? size - clickPos : clickPos;
        size = size - offsetFromCenter;
        size *= 1.1;

        // center of circle
        let x = clickX - size / 2;
        let y = clickY - size / 2;

        //console.log('ripple click', offsetFromCenter, size, clickX, clickY);

        span.style.width = span.style.height = size + 'px';
        span.style.left = x + 'px';
        span.style.top = y + 'px';
  
        r.append(span);
        //r.classList.add('active');
        //handler();
      });
    //});
  };

  let touchStartFired = false;
  if(touchSupport) {
    let touchEnd = () => {
      handler && handler();
    };
  
    elem.addEventListener('touchstart', (e) => {
      //console.log('ripple touchstart', e);
      if(e.touches.length > 1 || ((e.target as HTMLElement).tagName == 'BUTTON' && e.target != elem) || findUpClassName(e.target as HTMLElement, 'c-ripple') != r) {
        return;
      }
      
      //console.log('touchstart', e);
      touchStartFired = true;
  
      let {clientX, clientY} = e.touches[0];
      drawRipple(clientX, clientY);
      window.addEventListener('touchend', touchEnd, {once: true});
  
      window.addEventListener('touchmove', (e) => {
        e.cancelBubble = true;
        e.stopPropagation();
        handler && handler();
        window.removeEventListener('touchend', touchEnd);
      }, {once: true});
    }, {passive: true});
  } else {
    elem.addEventListener('mousedown', (e) => {
      //console.log('ripple mousedown', e, e.target, findUpClassName(e.target as HTMLElement, 'c-ripple') == r);

      if(elem.dataset.ripple == '0' || findUpClassName(e.target as HTMLElement, 'c-ripple') != r) {
        return false;
      } else if(touchStartFired) {
        touchStartFired = false;
        return false;
      }
  
      let {clientX, clientY} = e;
      drawRipple(clientX, clientY);
      window.addEventListener('mouseup', handler, {once: true});
    });
  }
}