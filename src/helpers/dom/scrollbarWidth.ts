import {createSignal, Accessor} from 'solid-js';
import {observeResize} from '@components/resizeObserver';

const [_scrollbarWidth, setScrollbarWidth] = createSignal(0);

let initialized = false;

function init() {
  initialized = true;
  const outer = document.createElement('div');
  outer.style.cssText = 'position:fixed;top:-200px;left:-200px;width:100px;height:100px;overflow:scroll;visibility:hidden;pointer-events:none;opacity:0;';
  const inner = document.createElement('div');
  inner.style.cssText = 'width:100%;height:200px;';
  outer.appendChild(inner);
  document.documentElement.appendChild(outer);

  function measure() {
    setScrollbarWidth(outer.offsetWidth - outer.clientWidth);
  }

  measure();

  // When macOS switches scrollbar mode, inner div resizes → callback fires
  observeResize(inner, measure);
}

const scrollbarWidth: Accessor<number> = () => {
  if(!initialized) {
    init();
  }
  return _scrollbarWidth();
};

export default scrollbarWidth;
