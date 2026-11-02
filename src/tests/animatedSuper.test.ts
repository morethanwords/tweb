import {AnimatedSuper} from '@components/animatedSuper';
import {AnimatedCounter} from '@components/animatedCounter';
import {setAppWindow} from '@helpers/appWindow';

/*
 * A row a change leaves is taken away once its transition is over. The transition starts in the frame
 * that renders the change, which a long task right after the change (a paid reaction's effect starting)
 * holds back - so the time is counted from that frame, or the row went halfway through its fade.
 */

let frames: FrameRequestCallback[];

beforeEach(() => {
  frames = [];
  vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => frames.push(callback));
  vi.spyOn(window, 'cancelAnimationFrame').mockImplementation((handle) => {
    frames[handle - 1] = undefined;
  });
  vi.useFakeTimers({toFake: ['setTimeout', 'clearTimeout']});
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  document.body.replaceChildren();
});

function renderFrame() {
  const callbacks = frames;
  frames = [];
  callbacks.forEach((callback) => callback?.(performance.now()));
}

/** rows 1 and 2, rolling from 1 to 2 */
function rollFromOneToTwo() {
  const animatedSuper = new AnimatedSuper({duration: 200});
  document.body.append(animatedSuper.container);
  animatedSuper.getRow(1).textContent = '1';
  animatedSuper.getRow(2).textContent = '2';
  animatedSuper.animate(2, 1);
  return animatedSuper;
}

test('a row a change leaves stays for the transition counted from the frame that renders the change', () => {
  const animatedSuper = rollFromOneToTwo();

  // * the long task: no frame for a while
  vi.advanceTimersByTime(1000);
  expect(animatedSuper.container.textContent).toBe('12');

  renderFrame();
  vi.advanceTimersByTime(199);
  expect(animatedSuper.container.textContent).toBe('12');
  vi.advanceTimersByTime(1);
  expect(animatedSuper.container.textContent).toBe('2');
});

test('a change that comes before the rows of the last one are gone keeps the ones it needs', () => {
  const animatedSuper = rollFromOneToTwo();
  renderFrame();
  vi.advanceTimersByTime(100);

  // * back to 1 halfway: the frame of the first change does not take it away under the second
  animatedSuper.animate(1, 2);
  vi.advanceTimersByTime(1000);
  expect(animatedSuper.container.textContent).toBe('12');
  renderFrame();
  vi.advanceTimersByTime(200);
  expect(animatedSuper.container.textContent).toBe('1');
});

test('a counter keeps the decimals a shorter text leaves until their roll is over', () => {
  const counter = new AnimatedCounter({duration: 200});
  document.body.append(counter.container);
  counter.setCount(10, true);
  renderFrame();
  vi.advanceTimersByTime(200);
  expect(counter.decimals.length).toBe(2);

  counter.setCount(9, true);
  vi.advanceTimersByTime(1000);
  expect(counter.decimals.length).toBe(2);
  renderFrame();
  vi.advanceTimersByTime(200);
  expect(counter.decimals.length).toBe(1);
});

test('what waits for the end of a roll is done at once when the app changes windows', () => {
  // * the frames and timers of a Picture-in-Picture window close with it: the app leaving it must not leave
  // * the rows of a roll, or the decimals of a shorter count, behind
  const iframe = document.createElement('iframe');
  document.body.append(iframe);
  const counter = new AnimatedCounter({duration: 200});
  document.body.append(counter.container);
  counter.setCount(10, true);
  counter.setCount(9, true);
  const animatedSuper = rollFromOneToTwo();

  setAppWindow(iframe.contentWindow);
  try {
    expect(counter.decimals.length).toBe(1);
    expect(animatedSuper.container.textContent).toBe('2');
  } finally {
    setAppWindow(window);
  }

  // * and its frame, coming after all, does nothing more
  iframe.remove();
  renderFrame();
  vi.advanceTimersByTime(1000);
  expect(animatedSuper.container.textContent).toBe('2');
});
