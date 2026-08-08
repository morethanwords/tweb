import {createRoot} from 'solid-js';
import {useCollapsable} from '@hooks/useCollapsable';

// A wheel as Firefox dispatches it: the standard `deltaY` only. Chromium/WebKit additionally
// carry the legacy `wheelDeltaY` (roughly `-deltaY * 1.2`), which is what the hook used to read.
const wheel = (deltaY: number, withLegacyWheelDelta?: boolean) => {
  const event = new WheelEvent('wheel', {deltaY, bubbles: true, cancelable: true});
  if(withLegacyWheelDelta) {
    Object.defineProperty(event, 'wheelDeltaY', {value: -deltaY * 1.2});
  }

  return event;
};

const setup = () => {
  const listenWheelOn = document.createElement('div');
  const container = document.createElement('div');
  const scrollable = document.createElement('div');
  document.body.append(listenWheelOn, container, scrollable);

  let dispose: () => void;
  const collapsable = createRoot((_dispose) => {
    dispose = _dispose;
    return useCollapsable({
      scrollable: () => scrollable,
      container: () => container,
      listenWheelOn,
      disableHoverWhenFolded: true
    });
  });

  return {
    ...collapsable,
    listenWheelOn,
    container,
    cleanup: () => {
      dispose();
      [listenWheelOn, container, scrollable].forEach((element) => element.remove());
    }
  };
};

describe('useCollapsable wheel direction', () => {
  test('unfolds on a standard wheel-up without the non-standard wheelDeltaY (Firefox)', () => {
    const {progress, STATE_FOLDED, STATE_UNFOLDED, listenWheelOn, cleanup} = setup();

    expect(progress()).toBe(STATE_FOLDED);
    listenWheelOn.dispatchEvent(wheel(-100));
    expect(progress()).toBe(STATE_UNFOLDED);

    cleanup();
  });

  test('still unfolds when the legacy wheelDeltaY is present (Chromium/WebKit)', () => {
    const {progress, STATE_FOLDED, STATE_UNFOLDED, listenWheelOn, cleanup} = setup();

    expect(progress()).toBe(STATE_FOLDED);
    listenWheelOn.dispatchEvent(wheel(-100, true));
    expect(progress()).toBe(STATE_UNFOLDED);

    cleanup();
  });

  test('folds back on a wheel-down', () => {
    const {progress, STATE_FOLDED, STATE_UNFOLDED, listenWheelOn, cleanup} = setup();

    listenWheelOn.dispatchEvent(wheel(-100));
    expect(progress()).toBe(STATE_UNFOLDED);

    listenWheelOn.dispatchEvent(wheel(100));
    expect(progress()).toBe(STATE_FOLDED);

    cleanup();
  });

  test('starts folded and non-interactive, and a wheel-up gets it out of that state', () => {
    const {folded, listenWheelOn, container, cleanup} = setup();

    expect(folded()).toBe(true);
    expect(container.classList.contains('disable-hover')).toBe(true);

    listenWheelOn.dispatchEvent(wheel(-100));
    expect(folded()).toBe(false);

    cleanup();
  });
});
