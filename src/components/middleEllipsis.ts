/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import {FontFamily, FontSize, FontWeight} from '../config/font';
import getTextWidth from '../helpers/canvas/getTextWidth';
import mediaSizes from '../helpers/mediaSizes';
import clamp from '../helpers/number/clamp';
import {fastRaf} from '../helpers/schedulers';

// Thanks to https://stackoverflow.com/a/49349813

/**
 * Attibute modifier to create middle ellipsis
 * When the attribute value is left blank the ellipsis will be in the middle
 * When positive the attribute value will be used as a percentage
 * When negative the attribute value will be used as character index counted from the end
 * @example
 *   <div data-middle-ellipsis>A Javascript solution to middle ellipsis</div>
 *   <div data-middle-ellipsis="20">A Javascript solution to middle ellipsis</div>
 *   <div data-middle-ellipsis="-3">A Javascript solution to middle ellipsis</div>
 */
const ellipsis = '…';
const map: Map<HTMLElement, {
  text: string,
  textLength: number,
  from: number,
  multiplier: number,
  font: string,
  textWidth: number,
  elementWidth: number
}> = new Map();

const testQueue: Set<HTMLElement> = new Set();
const fontSize = '16px';
let pendingTest = false;

function setTestQueue() {
  if(pendingTest) {
    return;
  }

  pendingTest = true;
  fastRaf(() => {
    pendingTest = false;
    testQueueElements();
  });
}

function testQueueElements() {
  testQueue.forEach(testElement);
  testQueue.clear();
}

window.addEventListener('resize', () => {
  for(const [key] of map) {
    testQueue.add(key);
  }

  setTestQueue();
}, {capture: true, passive: true});

function getElementWidth(element: HTMLElement) {
  const getSize = (element as any).getSize;
  if(getSize) {
    return getSize();
  }

  const type = element.dataset.sizeType;
  if(type) {
    const mediaSize = mediaSizes.active;
    // @ts-ignore
    const size: MediaSize = mediaSize[type];
    return size.width;
  }

  return element.getBoundingClientRect().width;
}

function testElement(element: HTMLElement) {
  // const perf = performance.now();
  // do not recalculate variables a second time
  let mapped = map.get(element);
  const firstTime = !mapped;

  let {text, textLength, from, multiplier, font, textWidth, elementWidth} = mapped || {};
  // console.log('[MEE] testElement got mapped', mapped);

  if(firstTime) {
    text = element.textContent;
    textLength = text.length;
    from = /* parseFloat(element.getAttribute(attributeName)) ||  */50;
    multiplier = from > 0 && from / 100;

    let fontSize = element.dataset.fontSize;
    if(fontSize && +fontSize) fontSize += 'px';
    // const perf = performance.now();
    font = `${element.dataset.fontWeight || FontWeight} ${fontSize || FontSize} ${FontFamily}`;
    /* const computedStyle = window.getComputedStyle(elm, null);
    font = `${computedStyle.getPropertyValue('font-weight')} ${computedStyle.getPropertyValue('font-size')} ${computedStyle.getPropertyValue('font-family')}`; */
    // console.log('testMiddleEllipsis get computed style:', performance.now() - perf, font);

    textWidth = getTextWidth(text, font);
    // const perf = performance.now();
    elementWidth = getElementWidth(element);
    // console.log('testMiddleEllipsis get offsetWidth:', performance.now() - perf, font);
    mapped = {text, textLength, from, multiplier, font, textWidth, elementWidth};
    map.set(element, mapped);

    // console.log('[MEE] testElement map set', element);
  }

  const newElementWidth = getElementWidth(element);
  const widthChanged = firstTime || elementWidth !== newElementWidth;
  !firstTime && widthChanged && (mapped.elementWidth = elementWidth = newElementWidth);

  if(widthChanged) {
    if(textWidth > elementWidth) {
      element.setAttribute('title', text);
      let smallerText = text;
      let smallerWidth = elementWidth;
      while(smallerText.length > 3) {
        const smallerTextLength = smallerText.length;
        const half = multiplier &&
          clamp(multiplier * smallerTextLength << 0, 1, smallerTextLength - 2) ||
          Math.max(smallerTextLength + from - 1, 1);
        const half1 = smallerText.substr(0, half).replace(/\s*$/, '');
        const half2 = smallerText.substr(half + 1).replace(/^\s*/, '');
        smallerText = half1 + half2;
        smallerWidth = getTextWidth(smallerText + ellipsis, font);
        if(smallerWidth < elementWidth) {
          element.textContent = half1 + ellipsis + half2;
          break;
        }
      }

      // * set new width after cutting text
      mapped.elementWidth = getElementWidth(element);
      // mapped.textWidth = smallerWidth;
    } else {
      element.removeAttribute('title');
    }
  }

  // console.log('testMiddleEllipsis for element:', elm, performance.now() - perf);
}

export class MiddleEllipsisElement extends HTMLElement {
  connectedCallback() {
    // console.log('[MEE]: connectedCallback before', map.has(this), testQueue.has(this), map.size, this.textContent, map);

    map.set(this, null);
    if(this.dataset.sizeType || (this as any).getSize) {
      testElement(this);
    } else {
      testQueue.add(this);
      setTestQueue();
    }
    // testElement(this);

    // console.log('[MEE]: connectedCallback after', map.has(this), map.size, testQueue.has(this), testQueue.size);
  }

  disconnectedCallback() {
    const deleted = map.delete(this);
    testQueue.delete(this);
    // console.log('[MEE]: disconnectedCallback', deleted, map.has(this), map.size, this.textContent, map);
  }
}

customElements.define('middle-ellipsis-element', MiddleEllipsisElement);
