import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import attachMessageTap from '@components/chat/messageTap';
import ListenerSetter from '@helpers/listenerSetter';

describe('mobile message taps', () => {
  let element: HTMLElement;
  let bubble: HTMLElement;
  let listeners: ListenerSetter;
  let onTap: ReturnType<typeof vi.fn<(event: MouseEvent) => void>>;
  let onDoubleTap: ReturnType<typeof vi.fn<(bubble: HTMLElement) => void>>;

  beforeEach(() => {
    vi.useFakeTimers();
    element = document.createElement('div');
    bubble = document.createElement('div');
    bubble.className = 'bubble';
    element.append(bubble);
    document.body.append(element);
    listeners = new ListenerSetter();
    onTap = vi.fn();
    onDoubleTap = vi.fn();
    attachMessageTap({element, listenerSetter: listeners,
      getBubble: (event) => (event.target as HTMLElement).closest('.bubble'),
      onTap, onDoubleTap});
  });

  afterEach(() => {
    listeners.removeAll();
    element.remove();
    vi.useRealTimers();
  });

  function tap(target = bubble, x = 20) {
    target.dispatchEvent(new MouseEvent('mousedown', {bubbles: true, cancelable: true}));
    target.dispatchEvent(new MouseEvent('click', {bubbles: true, cancelable: true, detail: 1, clientX: x}));
  }

  it('waits for a second tap before opening the menu', () => {
    tap();
    expect(onTap).not.toHaveBeenCalled();
    vi.advanceTimersByTime(300);
    expect(onTap).toHaveBeenCalledOnce();
    expect(onDoubleTap).not.toHaveBeenCalled();
  });

  it('reacts once to two nearby taps on the same message, without a menu', () => {
    tap();
    vi.advanceTimersByTime(100);
    tap();
    vi.runAllTimers();
    expect(onDoubleTap).toHaveBeenCalledExactlyOnceWith(bubble);
    expect(onTap).not.toHaveBeenCalled();
  });

  it('lets the spoiler consume its reveal before the menu handler', () => {
    const spoiler = document.createElement('span');
    bubble.append(spoiler);
    const reveal = vi.fn((event: Event) => {
      event.preventDefault();
      event.stopImmediatePropagation();
    });
    bubble.addEventListener('click', reveal, true);
    tap(spoiler);
    vi.runAllTimers();
    expect(reveal).toHaveBeenCalledOnce();
    expect(onTap).not.toHaveBeenCalled();
    expect(onDoubleTap).not.toHaveBeenCalled();
  });

  it('does not combine taps on different messages or far apart', () => {
    const other = bubble.cloneNode() as HTMLElement;
    element.append(other);
    tap();
    tap(other);
    tap(other, 100);
    vi.runAllTimers();
    expect(onDoubleTap).not.toHaveBeenCalled();
    expect(onTap).toHaveBeenCalledOnce();
  });

  it('does not combine taps outside the double-tap interval', () => {
    tap();
    vi.advanceTimersByTime(301);
    tap();
    vi.runAllTimers();
    expect(onDoubleTap).not.toHaveBeenCalled();
    expect(onTap).toHaveBeenCalledTimes(2);
  });

  it('ignores clicks outside a message and prevented clicks', () => {
    tap(element);
    bubble.addEventListener('click', (event) => event.preventDefault());
    tap();
    vi.runAllTimers();
    expect(onTap).not.toHaveBeenCalled();
    expect(onDoubleTap).not.toHaveBeenCalled();
  });

  it.each(['touchmove', 'touchcancel', 'contextmenu'])('cancels a pending menu on %s', (type) => {
    tap();
    bubble.dispatchEvent(new Event(type, {bubbles: true}));
    vi.runAllTimers();
    expect(onTap).not.toHaveBeenCalled();
  });

  it('cancels a pending menu on cleanup or removal', () => {
    tap();
    bubble.remove();
    vi.runAllTimers();
    expect(onTap).not.toHaveBeenCalled();
    element.append(bubble);
    tap();
    listeners.removeAll();
    vi.runAllTimers();
    expect(onTap).not.toHaveBeenCalled();
  });

  it('opens immediately for keyboard activation', () => {
    bubble.click();
    expect(onTap).toHaveBeenCalledOnce();
    expect(onDoubleTap).not.toHaveBeenCalled();
  });

  it('works the same in RTL', () => {
    element.dir = 'rtl';
    tap();
    tap(bubble, 10);
    expect(onDoubleTap).toHaveBeenCalledExactlyOnceWith(bubble);
    vi.runAllTimers();
    expect(onTap).not.toHaveBeenCalled();
  });
});
