import {createRoot, createSignal} from 'solid-js';
import {hotEffect} from '@helpers/hotModule';
import {observeResize} from '@components/resizeObserver';

// * how far the bars over the chats' topbars - a call's, the audio player's - put them down: the stylesheet's
// * `--topbar-floating-call-height` + `--topbar-floating-audio-height`, which the body's classes give. Read off a box
// * as tall as the two once it is laid out, so it follows the stylesheet whatever gives them, with no style read
const [height, setHeight] = createRoot(() => createSignal(0));

hotEffect(import.meta.hot, () => {
  const box = document.createElement('div');
  box.style.cssText = 'position: fixed; top: 0; left: 0; width: 0; visibility: hidden; pointer-events: none; height: calc(var(--topbar-floating-call-height) + var(--topbar-floating-audio-height));';
  document.body.append(box);
  const unobserve = observeResize(box, (entry) => setHeight(entry.contentRect.height));
  return () => {
    unobserve();
    box.remove();
  };
});

export default function useTopbarBarsHeight() {
  return height;
}
