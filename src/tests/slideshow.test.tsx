import {createSignal} from 'solid-js';
import {render} from 'solid-js/web';
import Slideshow from '@components/slideshow';
import styles from '@components/slideshow.module.scss';

const swipeMocks = vi.hoisted(() => ({
  options: undefined as {
    onFirstSwipe: () => void,
    onReset: () => void,
    onSwipe: (xDiff: number, yDiff: number) => boolean
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
  fastRaf: (callback: () => void) => callback()
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
    expect(items.style.transform).toBe('translate(-100%, 0)');
    dispose();
    host.remove();
  });
});

type Item = {key: string};

function getItemsTransform(container: HTMLElement) {
  return (container.firstElementChild.children[0] as HTMLElement).style.transform;
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

    expect(getItemsTransform(container)).toBe('translate(-200%, 0)');

    setItems([{key: 'c'}, {key: 'a'}, {key: 'b'}]);
    expect(getItemsTransform(container)).toBe('translate(0%, 0)');

    setItems([{key: 'a'}, {key: 'b'}, {key: 'c'}]);
    expect(getItemsTransform(container)).toBe('translate(-200%, 0)');

    setItems([{key: 'a'}, {key: 'b'}]);
    expect(getItemsTransform(container)).toBe('translate(-100%, 0)');

    setItems([]);
    expect(getItemsTransform(container)).toBe('translate(0%, 0)');
    dispose();
  });
});
