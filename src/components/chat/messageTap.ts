import ListenerSetter from '@helpers/listenerSetter';
import cancelEvent from '@helpers/dom/cancelEvent';

/** Wait for a second tap before opening the mobile message menu. Use click, not
 * mousedown: the text spoiler's capture listener must get to consume its reveal. */
export default function attachMessageTap(options: {
  element: HTMLElement,
  listenerSetter: ListenerSetter,
  getBubble: (event: MouseEvent) => HTMLElement,
  onTap: (event: MouseEvent) => void,
  onDoubleTap: (bubble: HTMLElement) => void
}) {
  let pending: {event: MouseEvent, bubble: HTMLElement, timer: number};
  let ignoreClick = false;
  const clear = () => {
    if(pending) window.clearTimeout(pending.timer);
    pending = undefined;
  };
  options.listenerSetter.addCleanup(clear);
  options.listenerSetter.add(options.element)('touchmove', clear, {passive: true});
  options.listenerSetter.add(options.element)('touchcancel', clear);
  options.listenerSetter.add(options.element)('contextmenu', clear);
  // Selection handles mousedown inside the bubbles and may deselect the last
  // message there. Its following click still belongs to that selection action.
  options.listenerSetter.add(options.element)('mousedown', (event) => {
    if(event.button !== 0) return;
    ignoreClick = !options.getBubble(event);
    if(ignoreClick) clear();
  }, {capture: true});
  options.listenerSetter.add(options.element)('click', (event) => {
    const ignored = ignoreClick && event.detail !== 0;
    ignoreClick = false;
    if(ignored) {
      clear();
      return;
    }
    const bubble = !event.defaultPrevented && event.button === 0 && options.getBubble(event);
    if(!bubble) {
      clear();
      return;
    }

    cancelEvent(event);
    // Keyboard / assistive-technology activation is never a double tap.
    if(event.detail === 0) {
      clear();
      options.onTap(event);
      return;
    }

    const previous = pending;
    clear();
    if(previous && previous.bubble === bubble &&
      Math.hypot(event.clientX - previous.event.clientX, event.clientY - previous.event.clientY) <= 24) {
      options.onDoubleTap(bubble);
      return;
    }

    pending = {event, bubble, timer: window.setTimeout(() => {
      pending = undefined;
      if(bubble.isConnected && options.getBubble(event) === bubble) options.onTap(event);
    }, 300)};
  });
}
