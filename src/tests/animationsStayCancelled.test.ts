vi.mock('@helpers/liteMode', () => ({default: {isAvailable: () => true}}));
vi.mock('@components/icon', () => ({default: () => document.createElement('span')}));

import {startOnNextFrame} from '@components/chat/bubbleShape';
import AiSendFlight from '@components/chat/aiSendFlight';
import {queueAnimationFrames} from '@/tests/helpers/animationFrames';

/**
 * An animation that is cancelled is over: nothing of the chat's starts it again, and an element taken out of the page
 * takes what it plays with it.
 *
 * - The ways of a changing message, a flying one and a flying reaction are timed from the next frame
 *   (`startOnNextFrame`): given a start time then. A change finished before that frame (a window change, the safety
 *   timeout of a tab hidden meanwhile) cancelled them, and a cancelled animation has no start time either: given one,
 *   it ran again, and held its last frame for good.
 * - The send button's aura breathes in an endless loop; it was taken out of the page with the loop still on.
 */

type FakeAnimation = Animation & {target: Element, iterations: number};

function fakeAnimation(target: Element, iterations = 1): FakeAnimation {
  const animation = {
    target,
    iterations,
    playState: 'running' as AnimationPlayState,
    startTime: null as CSSNumberish,
    timeline: {currentTime: 1000},
    playbackRate: 1,
    finished: Promise.resolve(),
    cancel() {
      animation.playState = 'idle';
      animation.startTime = null;
    }
  };
  return animation as any as FakeAnimation;
}

describe('startOnNextFrame', () => {
  let frames: FrameRequestCallback[];
  beforeEach(() => {
    frames = queueAnimationFrames().frames;
  });
  afterEach(() => vi.restoreAllMocks());

  test('starts at the next frame what waits for it', () => {
    const animation = fakeAnimation(document.createElement('div'));
    startOnNextFrame([animation]);
    expect(animation.startTime).toBe(null);
    frames.forEach((frame) => frame(0));
    expect(animation.startTime).toBe(1000);
  });

  test('leaves cancelled what was cancelled before that frame', () => {
    const cancelled = fakeAnimation(document.createElement('div'));
    const waiting = fakeAnimation(document.createElement('div'));
    startOnNextFrame([cancelled, waiting]);
    cancelled.cancel();
    frames.forEach((frame) => frame(0));
    expect(cancelled.playState).toBe('idle');
    expect(cancelled.startTime).toBe(null);
    expect(waiting.startTime).toBe(1000);
  });
});

describe('the AI send flight', () => {
  let animations: FakeAnimation[];
  beforeEach(() => {
    animations = [];
    vi.useFakeTimers();
    (Element.prototype as any).animate = function(_keyframes: Keyframe[], options?: number | KeyframeAnimationOptions) {
      const animation = fakeAnimation(this, typeof(options) === 'object' ? options.iterations ?? 1 : 1);
      animations.push(animation);
      return animation;
    };
    (Element.prototype as any).getAnimations = function(options?: {subtree?: boolean}) {
      return animations.filter(({target, playState}) => playState !== 'idle' &&
        (target === this || (options?.subtree && this.contains(target))));
    };
  });
  afterEach(() => {
    vi.useRealTimers();
    delete (Element.prototype as any).animate;
    delete (Element.prototype as any).getAnimations;
  });

  function startFlight() {
    const parent = document.createElement('div');
    const button = document.createElement('button');
    button.classList.add('send');
    const glyph = document.createElement('span');
    glyph.classList.add('btn-send-icon-send');
    button.append(glyph);
    parent.append(button);
    document.body.append(parent);
    const flight = new AiSendFlight(button);
    flight.start();
    const loops = animations.filter(({iterations}) => iterations === Infinity);
    expect(loops.length).toBeGreaterThan(0);
    return {flight, loops, parent};
  }

  // * depart: the message goes; cancel: it is stopped
  test.each(['depart', 'cancel'] as const)('a send that ends by %s leaves no loop running', async(end) => {
    const {flight, loops, parent} = startFlight();
    flight[end]();
    await vi.advanceTimersByTimeAsync(1000);
    expect(loops.filter(({playState}) => playState !== 'idle')).toEqual([]);
    parent.remove();
  });
});
