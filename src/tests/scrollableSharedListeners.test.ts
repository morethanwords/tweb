import {beforeEach, describe, expect, it, vi} from 'vitest';

// * MOUNT_CLASS_TO is how the registry is reachable from a test, exactly as it is from the console
const ctx = vi.hoisted(() => ({}) as any);

vi.mock('@config/debug', () => ({default: false, MOUNT_CLASS_TO: ctx}));
vi.mock('@environment/touchSupport', () => ({default: false}));
vi.mock('@environment/overlayScrollSupport', () => ({IS_OVERLAY_SCROLL_SUPPORTED: () => true}));
vi.mock('@environment/userAgent', () => ({IS_MOBILE_SAFARI: false, IS_SAFARI: false, IS_FIREFOX: false}));
vi.mock('@helpers/fastSmoothScroll', () => ({default: () => Promise.resolve()}));

import Scrollable from '@components/scrollable';
import {dispatchHeavyAnimationEvent, interruptHeavyAnimation} from '@hooks/useHeavyAnimationCheck';

const registry = () => ctx.listeningScrollables as Set<WeakRef<any>>;
const live = () => [...registry()].map((ref) => ref.deref()).filter(Boolean);

const make = () => {
  const el = document.createElement('div');
  document.body.append(el);
  return new Scrollable(el);
};

const runHeavyAnimation = async() => {
  let resolve: () => void;
  const promise = new Promise<void>((r) => resolve = r);
  dispatchHeavyAnimationEvent(promise);
  return {
    end: async() => {
      resolve();
      // * the end travels through promise.finally -> Promise.race -> .then, so let the queue drain
      await new Promise((r) => setTimeout(r, 0));
    }
  };
};

describe('scrollable shared listeners', () => {
  beforeEach(() => {
    // * module state outlives a test: an animation left running would swallow the next start
    interruptHeavyAnimation();
    live().forEach((scrollable) => scrollable.destroy());
    registry().clear();
    document.body.replaceChildren();
  });

  it('registers every instance weakly, never the instance itself', () => {
    const scrollable = make();
    const refs = [...registry()];
    expect(refs).toHaveLength(1);
    expect(refs[0]).toBeInstanceOf(WeakRef);
    expect(refs[0].deref()).toBe(scrollable);
    // * the whole point: nothing module-level holds the instance strongly, so an owner that never
    // * calls destroy() no longer pins it - and with it, its container's entire subtree
    expect([...registry()].some((ref) => (ref as any) === scrollable)).toBe(false);
  });

  it('subscribes to window once, not once per instance', () => {
    const spy = vi.spyOn(window, 'addEventListener');
    make();
    make();
    make();
    // * at most one, whatever the order tests run in: the subscription may already have happened in
    // * an earlier test. With a listener per instance this would be three
    expect(spy.mock.calls.filter(([type]) => String(type) === 'resize').length).toBeLessThanOrEqual(1);
    spy.mockRestore();
  });

  it('delivers heavy animation start and end to every live instance', async() => {
    const a = make(), b = make();
    const animation = await runHeavyAnimation();
    expect(a.isHeavyAnimationInProgress).toBe(true);
    expect(b.isHeavyAnimationInProgress).toBe(true);

    await animation.end();
    expect(a.isHeavyAnimationInProgress).toBe(false);
    expect(b.isHeavyAnimationInProgress).toBe(false);
  });

  it('catches up an instance created while an animation is already running', async() => {
    const animation = await runHeavyAnimation();
    const late = make();
    // * a shared subscription cannot re-fire the start, so setListeners has to ask
    expect(late.isHeavyAnimationInProgress).toBe(true);

    await animation.end();
    expect(late.isHeavyAnimationInProgress).toBe(false);
  });

  it('drops an instance on destroy and stops delivering to it', async() => {
    const scrollable = make();
    scrollable.destroy();
    expect(registry().size).toBe(0);

    await runHeavyAnimation();
    expect(scrollable.isHeavyAnimationInProgress).toBe(false);
  });

  it('prunes refs whose scrollable was collected', async() => {
    const kept = make();
    const collected = {deref: () => undefined} as WeakRef<any>;
    registry().add(collected);
    expect(registry().size).toBe(2);

    await runHeavyAnimation();
    expect(registry().has(collected)).toBe(false);
    expect(live()).toEqual([kept]);
  });
});
