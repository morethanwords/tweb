import {createSignal} from 'solid-js';
import {render} from 'solid-js/web';
import Slideshow from '@components/slideshow';
import styles from '@components/slideshow.module.scss';

const swipeMocks = vi.hoisted(() => ({
  // frames held back instead of run at once, while a test needs to see what happens before them
  frames: undefined as (() => void)[] | undefined,
  options: undefined as {
    onFirstSwipe: () => void,
    onReset: () => void,
    onSwipe: (xDiff: number, yDiff: number) => boolean | void,
    verifyTouchTarget: (e: Partial<WheelEvent>) => boolean
  } | undefined
}));

vi.mock('@components/swipeHandler', () => ({
  default: class SwipeHandlerMock {
    constructor(options: typeof swipeMocks.options) {
      swipeMocks.options = options;
    }

    removeListeners() {}
  }
}));

vi.mock('@helpers/schedulers', () => ({
  fastRaf: (callback: () => void) => swipeMocks.frames ? swipeMocks.frames.push(callback) : callback()
}));

describe('Slideshow', () => {
  test('renders clickable dots and reports direct navigation', () => {
    const host = document.createElement('div');
    document.body.append(host);
    const [activeIndex, setActiveIndex] = createSignal(0);
    const onIndexChange = vi.fn((index: number) => setActiveIndex(index));
    const dispose = render(() => (
      <Slideshow
        activeIndex={activeIndex()}
        items={['first', 'second', 'third']}
        onIndexChange={onIndexChange}
      >
        {(item) => <div>{item}</div>}
      </Slideshow>
    ), host);
    const dots = host.querySelectorAll<HTMLButtonElement>(`.${styles.Dot}`);

    expect(dots).toHaveLength(3);
    expect(dots[0].getAttribute('aria-current')).toBe('true');
    dots[2].click();
    expect(onIndexChange).toHaveBeenCalledWith(2);
    expect(activeIndex()).toBe(2);
    expect(dots[0].hasAttribute('aria-current')).toBe(false);
    expect(dots[2].getAttribute('aria-current')).toBe('true');

    dispose();
    host.remove();
  });

  test('reports swipe navigation to a controlled parent', () => {
    const host = document.createElement('div');
    document.body.append(host);
    const [activeIndex, setActiveIndex] = createSignal(0);
    const onIndexChange = vi.fn((index: number) => setActiveIndex(index));
    const dispose = render(() => (
      <Slideshow
        activeIndex={activeIndex()}
        items={['first', 'second']}
        keepItemsMounted
        onIndexChange={onIndexChange}
      >
        {(item) => <div>{item}</div>}
      </Slideshow>
    ), host);
    const slideshow = host.querySelector<HTMLElement>(`.${styles.Slideshow}`)!;
    const items = host.querySelector<HTMLElement>(`.${styles.Items}`)!;
    vi.spyOn(slideshow, 'getBoundingClientRect').mockReturnValue({
      bottom: 200,
      height: 200,
      left: 0,
      right: 300,
      toJSON: () => ({}),
      top: 0,
      width: 300,
      x: 0,
      y: 0
    });
    vi.spyOn(items, 'getBoundingClientRect').mockReturnValue({
      bottom: 200,
      height: 200,
      left: 0,
      right: 300,
      toJSON: () => ({}),
      top: 0,
      width: 300,
      x: 0,
      y: 0
    });

    swipeMocks.options!.onFirstSwipe();
    swipeMocks.options!.onSwipe(-200, 0);
    swipeMocks.options!.onReset();

    expect(onIndexChange).toHaveBeenCalledWith(1);
    expect(activeIndex()).toBe(1);
    dispose();
    host.remove();
  });
});

type Item = {key: string};

// the key of the item shown: the others are hidden from assistive tech
function shownKeys(container: HTMLElement) {
  return [...container.querySelectorAll<HTMLElement>(`.${styles.Item}:not([aria-hidden="true"]) [data-key]`)]
  .map((element) => element.dataset.key);
}

describe('Slideshow stable selection', () => {
  test('preserves the selected key across reorder and clamps when it disappears', () => {
    const [items, setItems] = createSignal<Item[]>([
      {key: 'a'},
      {key: 'b'},
      {key: 'c'}
    ]);
    const container = document.createElement('div');
    const dispose = render(() => (
      <Slideshow
        items={items()}
        initialIndex={2}
        getItemKey={(item) => item.key}
      >
        {(item) => <span data-key={item.key}>{item.key}</span>}
      </Slideshow>
    ), container);

    expect(shownKeys(container)).toEqual(['c']);

    setItems([{key: 'c'}, {key: 'a'}, {key: 'b'}]);
    expect(shownKeys(container)).toEqual(['c']);

    setItems([{key: 'a'}, {key: 'b'}, {key: 'c'}]);
    expect(shownKeys(container)).toEqual(['c']);

    setItems([{key: 'a'}, {key: 'b'}]);
    expect(shownKeys(container)).toEqual(['b']);

    setItems([]);
    expect(shownKeys(container)).toEqual([]);
    dispose();
  });
});

describe('Slideshow paging', () => {
  const rect = {bottom: 200, height: 200, left: 0, right: 300, toJSON: () => ({}), top: 0, width: 300, x: 0, y: 0};

  function renderKeyed() {
    const host = document.createElement('div');
    document.body.append(host);
    const onIndexChange = vi.fn();
    const dispose = render(() => (
      <Slideshow
        items={[{key: 'a'}, {key: 'b'}, {key: 'c'}]}
        getItemKey={(item) => item.key}
        keepItemsMounted
        onIndexChange={onIndexChange}
      >
        {(item) => <span>{item.key}</span>}
      </Slideshow>
    ), host);
    const slideshow = host.querySelector<HTMLElement>(`.${styles.Slideshow}`)!;
    vi.spyOn(slideshow, 'getBoundingClientRect').mockReturnValue(rect);
    const dots = host.querySelectorAll<HTMLButtonElement>(`.${styles.Dot}`);
    // the item shown: the others, off to the sides, are hidden from assistive tech
    const shown = () => [...host.querySelectorAll<HTMLElement>(`.${styles.Item}`)]
    .map((item, index) => item.getAttribute('aria-hidden') === 'true' ? -1 : index)
    .filter((index) => index !== -1);
    return {host, dispose, dots, shown, onIndexChange};
  }

  test('goes to the item picked, not to the one picked before', () => {
    const {host, dispose, dots, shown, onIndexChange} = renderKeyed();
    expect(shown()).toEqual([0]);

    dots[2].click();
    expect(shown()).toEqual([2]);
    expect(dots[2].getAttribute('aria-current')).toBe('true');

    dots[1].click();
    expect(shown()).toEqual([1]);
    expect(onIndexChange.mock.calls).toEqual([[2], [1]]);

    dispose();
    host.remove();
  });

  test('a short drag puts the item back, a longer one pages by one', () => {
    const {host, dispose, shown, onIndexChange} = renderKeyed();
    const drag = (xDiff: number) => {
      swipeMocks.options!.onFirstSwipe();
      swipeMocks.options!.onSwipe(xDiff, 0);
      swipeMocks.options!.onReset();
    };

    drag(-3); // * a press that barely moved is a click
    drag(-40);
    expect(onIndexChange).not.toHaveBeenCalled();
    expect(shown()).toEqual([0]);

    drag(-900);
    expect(onIndexChange.mock.calls).toEqual([[1]]);
    expect(shown()).toEqual([1]);

    dispose();
    host.remove();
  });

  test('a drag whose first move goes a pixel down is still a drag', () => {
    const {host, dispose, onIndexChange} = renderKeyed();

    swipeMocks.options!.onFirstSwipe();
    // * a mouse's first move: giving the gesture up here (true) would let its click open the item
    expect(swipeMocks.options!.onSwipe(0, 2)).not.toBe(true);
    swipeMocks.options!.onSwipe(-900, 2);
    swipeMocks.options!.onReset();
    expect(onIndexChange.mock.calls).toEqual([[1]]);

    dispose();
    host.remove();
  });

  test('a wheel pages when it goes sideways, whichever window made the event', () => {
    const {host, dispose} = renderKeyed();
    const target = host.querySelector('span')!;
    // * a plain object, as one from a Document PiP window is not this window's WheelEvent
    const wheel = (init: Partial<WheelEvent>) => swipeMocks.options!.verifyTouchTarget({type: 'wheel', target, ...init});

    expect(wheel({deltaX: 10, deltaY: 1})).toBe(true);
    expect(wheel({deltaX: 1, deltaY: 10})).toBe(false);
    expect(wheel({deltaX: 10, deltaY: 1, ctrlKey: true})).toBe(false);

    dispose();
    host.remove();
  });

  test('the click a drag ends with does not reach the item', () => {
    const {host, dispose} = renderKeyed();
    const item = host.querySelector('span')!;
    const onItemClick = vi.fn();
    item.addEventListener('click', onItemClick);

    swipeMocks.frames = [];
    swipeMocks.options!.onFirstSwipe();
    swipeMocks.options!.onSwipe(-40, 0);
    swipeMocks.options!.onReset();
    item.click(); // * mouseup's click comes before the next frame
    swipeMocks.frames.forEach((callback) => callback());
    swipeMocks.frames = undefined;
    expect(onItemClick).not.toHaveBeenCalled();

    item.click(); // * a plain click does
    expect(onItemClick).toHaveBeenCalledTimes(1);

    dispose();
    host.remove();
  });
});
