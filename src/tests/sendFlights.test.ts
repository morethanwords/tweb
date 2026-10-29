import SendFlights, {SendFlight} from '@components/chat/sendFlights';

vi.mock('@components/animationIntersector', () => ({default: {}}));
vi.mock('@lib/lottie/lottieLoader', () => ({default: {}}));

type MockAnimation = {
  currentTime: number,
  progress: number,
  frames: Keyframe[],
  effect: {setKeyframes: (frames: Keyframe[]) => void, getComputedTiming: () => {progress: number}},
  finished: Promise<unknown>,
  cancel: ReturnType<typeof vi.fn>
};

class Flight extends SendFlight {
  constructor(flights: SendFlights) {
    super(flights, () => true);
  }

  protected place() {}
  protected prepare(bubble: HTMLElement) {
    this.target = bubble;
    this.hidden = [bubble];
    return bubble.getBoundingClientRect();
  }
  protected build() {}
  protected getTracks() {
    return [{
      element: this.root.appendChild(document.createElement('div')),
      keyframes: [{transform: 'translateY(500px)'}, {transform: `translateY(${this.end.top}px)`}],
      easing: 'linear'
    }];
  }
}

describe('overlapping send flights', () => {
  let animations: Map<Element, MockAnimation[]>;
  let container: HTMLElement;
  let flights: SendFlights;
  let operations: string[];
  let animateDescriptor: PropertyDescriptor;

  beforeEach(() => {
    vi.useFakeTimers();
    animateDescriptor = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'animate');
    animations = new Map();
    operations = [];
    HTMLElement.prototype.animate = vi.fn(function(this: HTMLElement, frames: Keyframe[]) {
      operations.push('animate');
      const animation: MockAnimation = {
        frames,
        currentTime: 0,
        progress: 0,
        effect: {
          setKeyframes: (frames) => animation.frames = frames,
          getComputedTiming: () => ({progress: animation.progress})
        },
        finished: new Promise(() => {}),
        cancel: vi.fn()
      };
      const list = animations.get(this) || [];
      animations.set(this, [...list, animation]);
      return animation as unknown as Animation;
    });
    container = document.body.appendChild(document.createElement('div'));
    flights = new SendFlights({
      container: () => container,
      composer: () => container,
      canFly: () => true,
      viewportHeight: () => 600,
      scrollToEnd: () => 0,
      observed: () => [container]
    });
  });

  afterEach(() => {
    flights.abortAll();
    container.remove();
    vi.useRealTimers();
    vi.restoreAllMocks();
    if(animateDescriptor) Object.defineProperty(HTMLElement.prototype, 'animate', animateDescriptor);
    else delete HTMLElement.prototype.animate;
  });

  function add(top = 100, left = 40) {
    const rect = {top, left, width: 120, height: 30};
    const bubble = container.appendChild(document.createElement('div'));
    bubble.getBoundingClientRect = () => {
      operations.push(`measure ${left} ${top}`);
      return new DOMRect(rect.left, rect.top, rect.width, rect.height);
    };
    const flight = new Flight(flights);
    flight.hold();
    flight.launch(bubble);
    const animation = animations.get(flight.root.firstElementChild)[0];
    return {flight, bubble, rect, animation};
  }

  for(const direction of ['ltr', 'rtl']) {
    test(`a new send moves a completed flight smoothly even when the list does not resize (${direction})`, () => {
      container.dir = direction;
      const first = add(100, direction === 'rtl' ? 240 : 40);
      first.animation.currentTime = 300;
      first.rect.top -= 40;
      // The target and its fixed-height, bottom-aligned parent keep their sizes: no ResizeObserver fires.
      // A resize can arrive before launch; the fixed-height RTL case has no notification at all.
      if(direction === 'ltr') first.flight.measureFollow()?.();
      add();
      const movement = animations.get(first.flight.root)[0];
      expect(movement.frames).toEqual([{transform: 'translate(0px, 0px)'}, {transform: 'translate(0px, -40px)'}]);
      expect(first.animation.frames[1].transform).toBe('translateY(100px)');
      expect(first.animation.currentTime).toBe(300);

      // A third send before that movement finishes starts where the copy is now, not at either end.
      movement.progress = .5;
      first.rect.top -= 40;
      add();
      const next = animations.get(first.flight.root)[1];
      expect(next.frames).toEqual([{transform: 'translate(0px, -20px)'}, {transform: 'translate(0px, -80px)'}]);
      expect(movement.cancel).toHaveBeenCalledOnce();
    });
  }

  test('keeps the copy until both its own flight and the newer list movement finish', () => {
    const first = add();
    first.animation.currentTime = 300;
    first.rect.top -= 40;
    add();
    const movement = animations.get(first.flight.root)[0];
    movement.currentTime = 150;
    vi.advanceTimersByTime(300);
    expect(first.flight.done).not.toBe(true);
    movement.currentTime = 300;
    vi.advanceTimersByTime(150);
    expect(first.flight.done).toBe(true);
    expect(first.flight.root.isConnected).toBe(false);
    expect(first.bubble.className).toBe('');
  });

  test('reads every older target before starting their list movements', () => {
    const first = add(100);
    const second = add(140);
    first.rect.top -= 40;
    second.rect.top -= 40;
    operations.length = 0;
    flights.followOthers(undefined);
    expect(operations).toEqual(['measure 40 100', 'measure 40 140', 'animate', 'animate']);
  });

  // * the composer shrinking under a copy on its way moves its message's place: the way bends to it and still
  // * comes on time, rather than going to the old place first and on to the new one after it
  test('bends its own way to a place that moves while it flies', () => {
    const first = add();
    first.animation.currentTime = 100;
    first.rect.top += 40;
    first.flight.measureFollow()?.();
    expect(animations.get(first.flight.root)).toBeUndefined();
    expect(first.animation.frames[1].transform).toBe('translateY(140px)');

    first.animation.currentTime = 300;
    vi.advanceTimersByTime(300);
    expect(first.flight.done).toBe(true);
  });

  test('reveals a target that changes size while its list movement is running', () => {
    const first = add();
    first.rect.top -= 40;
    add();
    first.rect.height += 20;
    first.flight.measureFollow()?.();
    expect(first.flight.done).toBe(true);
    expect(first.bubble.className).toBe('');
  });
});
