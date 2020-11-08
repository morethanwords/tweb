// Thanks to https://stackoverflow.com/a/49349813
import { clamp } from "../helpers/number";

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
const attributeName = 'data-middle-ellipsis';
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
const fontFamily = 'Roboto, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Oxygen-Sans, Ubuntu, Cantarell, "Helvetica Neue", sans-serif';
const fontSize = '16px';
let timeoutId: number;

const setTestQueue = () => {
  cancelAnimationFrame(timeoutId);
  timeoutId = window.requestAnimationFrame(testQueueElements);
};

const testQueueElements = () => {
  testQueue.forEach(testElement);
  testQueue.clear();
};

window.addEventListener('resize', () => {
  (Array.from(document.querySelectorAll(`[${attributeName}]`)) as HTMLElement[]).forEach(el => testQueue.add(el));
  setTestQueue();
}, {capture: true, passive: true});

const testElement = (elm: HTMLElement) => {
  //const perf = performance.now();
  // do not recalculate variables a second time
  const mapped = map.get(elm);
  let {text, textLength, from, multiplier, font, textWidth, elementWidth} = mapped || {};
  // first time
  if(!mapped) {
    text = elm.textContent;
    textLength = text.length;
    from = parseFloat(elm.getAttribute(attributeName)) || 50;
    multiplier = from > 0 && from / 100;

    //const perf = performance.now();
    font = `${elm.dataset.fontWeight || 400} ${fontSize} ${fontFamily}`;
    /* const computedStyle = window.getComputedStyle(elm, null);
    font = `${computedStyle.getPropertyValue('font-weight')} ${computedStyle.getPropertyValue('font-size')} ${computedStyle.getPropertyValue('font-family')}`; */
    //console.log('testMiddleEllipsis get computed style:', performance.now() - perf, font);

    textWidth = getTextWidth(text, font);
    //const perf = performance.now();
    elementWidth = elm.offsetWidth;
    //console.log('testMiddleEllipsis get offsetWidth:', performance.now() - perf, font);
    map.set(elm, {text, textLength, from, multiplier, font, textWidth, elementWidth});
  }
  
  const {offsetWidth} = elm;
  const widthChanged = !mapped || elementWidth !== offsetWidth;
  mapped && widthChanged && (mapped.elementWidth = elementWidth = offsetWidth);
  
  if(widthChanged) {
    if(textWidth > elementWidth) {
      elm.setAttribute('title', text);
      let smallerText = text;
      let smallerWidth = elementWidth;
      while(smallerText.length > 3) {
        let smallerTextLength = smallerText.length;
        const half = multiplier &&
          clamp(multiplier * smallerTextLength << 0, 1, smallerTextLength - 2) ||
          Math.max(smallerTextLength + from - 1, 1);
        const half1 = smallerText.substr(0, half).replace(/\s*$/,'');
        const half2 = smallerText.substr(half + 1).replace(/^\s*/,'');
        smallerText = half1 + half2;
        smallerWidth = getTextWidth(smallerText + ellipsis, font);
        if(smallerWidth < elementWidth) {
          elm.textContent = half1 + ellipsis + half2;
          break;
        }
      }
    } else {
      elm.removeAttribute('title');
    }
  }

  //console.log('testMiddleEllipsis for element:', elm, performance.now() - perf);
};

let context: CanvasRenderingContext2D;
/**
 * Get the text width
 * @param {string} text
 * @param {string} font
 */
function getTextWidth(text: string, font: string) {
  //const perf = performance.now();
  if(!context) {
    const canvas = document.createElement('canvas');
    context = canvas.getContext('2d');
    context.font = font;
  }

  //context.font = font;
  const metrics = context.measureText(text);
  //console.log('getTextWidth perf:', performance.now() - perf);
  //return metrics.width;
  return Math.round(metrics.width);
}

export class MiddleEllipsisElement extends HTMLElement {
  constructor() {
    super();

    if(this.getAttribute('data-middle-ellipsis') === null) {
      this.setAttribute('data-middle-ellipsis', '');
    }
  }

  connectedCallback() {
    testQueue.add(this);
    setTestQueue();
    //testElement(this);
  }

  disconnectedCallback() {
    map.delete(this);
  }
}

customElements.define("middle-ellipsis-element", MiddleEllipsisElement);
