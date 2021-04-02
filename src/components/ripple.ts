import {isTouchSupported} from "../helpers/touchSupport";
import { findUpClassName } from "../helpers/dom";
import rootScope from "../lib/rootScope";

let rippleClickId = 0;
export function ripple(elem: HTMLElement, callback: (id: number) => Promise<boolean | void> = () => Promise.resolve(), onEnd: (id: number) => void = null, prepend = false) {
  //return;
  if(elem.querySelector('.c-ripple')) return;
  elem.classList.add('rp');
  
  let r = document.createElement('div');
  r.classList.add('c-ripple');

  const isSquare = elem.classList.contains('rp-square');
  if(isSquare) {
    r.classList.add('is-square');
  }

  elem[prepend ? 'prepend' : 'append'](r);

  let handler: () => void;
  //let animationEndPromise: Promise<number>;
  const drawRipple = (clientX: number, clientY: number) => {
    const startTime = Date.now();
    const elem = document.createElement('div');

    const clickId = rippleClickId++;
    
    //console.log('ripple drawRipple');
    
    const duration = +window.getComputedStyle(r).getPropertyValue('--ripple-duration').replace('s', '') * 1000;
    //console.log('ripple duration', duration);

    handler = () => {
    //handler = () => animationEndPromise.then((duration) => {
      //console.log('ripple animation was:', duration);

      //const duration = isSquare || mediaSizes.isMobile ? 200 : 700;
      //return;
      let elapsedTime = Date.now() - startTime;
      if(elapsedTime < duration) {
        let delay = Math.max(duration - elapsedTime, duration / 2);
        setTimeout(() => elem.classList.add('hiding'), Math.max(delay - duration / 2, 0));

        setTimeout(() => {
          //console.log('ripple elapsedTime total pre-remove:', Date.now() - startTime);
          elem.remove();
          if(onEnd) onEnd(clickId);
        }, delay);
      } else {
        elem.classList.add('hiding');
        setTimeout(() => {
          //console.log('ripple elapsedTime total pre-remove:', Date.now() - startTime);
          elem.remove();
          if(onEnd) onEnd(clickId);
        }, duration / 2);
      }

      if(!isTouchSupported) {
        window.removeEventListener('contextmenu', handler);
      }

      handler = null;
      touchStartFired = false;
    };
    //});

    callback && callback(clickId);

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
        elem.classList.add('c-ripple__circle');

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

        elem.style.width = elem.style.height = size + 'px';
        elem.style.left = x + 'px';
        elem.style.top = y + 'px';

        // нижний код выполняется с задержкой
        /* animationEndPromise = new Promise((resolve) => {
          span.addEventListener('animationend', () => {
            // 713 -> 700
            resolve(((Date.now() - startTime) / 100 | 0) * 100);
          }, {once: true});
        }); */
        
        // нижний код не всегда включает анимацию ПРИ КЛИКЕ НА ТАЧПАД БЕЗ ТАПТИК ЭНЖИНА
        /* span.style.display = 'none';
        r.append(span);
        duration = +window.getComputedStyle(span).getPropertyValue('animation-duration').replace('s', '') * 1000;
        span.style.display = ''; */

        r.append(elem);

        //r.classList.add('active');
        //handler();
      });
    //});
  };

  // TODO: rename this variable
  let touchStartFired = false;
  if(isTouchSupported) {
    let touchEnd = () => {
      handler && handler();
    };
  
    elem.addEventListener('touchstart', (e) => {
      if(!rootScope.settings.animationsEnabled) {
        return;
      }

      //console.log('ripple touchstart', e);
      if(e.touches.length > 1 
        || touchStartFired 
        || (['BUTTON', 'A'].includes((e.target as HTMLElement).tagName) && e.target !== elem) 
        || findUpClassName(e.target as HTMLElement, 'c-ripple') !== r) {
        return;
      }
      
      //console.log('touchstart', e);
      touchStartFired = true;
  
      let {clientX, clientY} = e.touches[0];
      drawRipple(clientX, clientY);
      elem.addEventListener('touchend', touchEnd, {once: true});
  
      window.addEventListener('touchmove', (e) => {
        e.cancelBubble = true;
        e.stopPropagation();
        touchEnd();
        elem.removeEventListener('touchend', touchEnd);
      }, {once: true});
    }, {passive: true});
  } else {
    elem.addEventListener('mousedown', (e) => {
      if(![0, 2].includes(e.button)) { // only left and right buttons
        return;
      }

      if(!rootScope.settings.animationsEnabled) {
        return;
      }
      //console.log('ripple mousedown', e, e.target, findUpClassName(e.target as HTMLElement, 'c-ripple') === r);

      if(elem.dataset.ripple === '0' || findUpClassName(e.target as HTMLElement, 'c-ripple') !== r || (e.target as HTMLElement).tagName === 'A') {
        return false;
      } else if(touchStartFired) {
        touchStartFired = false;
        return false;
      }
  
      let {clientX, clientY} = e;
      drawRipple(clientX, clientY);
      window.addEventListener('mouseup', handler, {once: true});
      window.addEventListener('contextmenu', handler, {once: true});
    });
  }
}
