import animateSomethingWithScroll from '@helpers/animateSomethingWithScroll';
import {cancelAnimationByKey, getAnimationInstance} from '@helpers/animation';
import deferredPromise from '@helpers/cancellablePromise';
import type Scrollable from '@components/scrollable';
import type ScrollSaver from '@helpers/scrollSaver';
import {resizeObserverInstances} from '@/tests/mocks/resizeObserver';

vi.mock('@hooks/useHeavyAnimationCheck', () => ({dispatchHeavyAnimationEvent: vi.fn()}));

function createAnimation(container = document.createElement('div')) {
  const completion = deferredPromise<void>();
  const restore = vi.fn();
  const placeholder = document.createElement('div');
  animateSomethingWithScroll(
    completion,
    {container} as unknown as Scrollable,
    {restore} as unknown as ScrollSaver,
    placeholder
  );
  const observer = resizeObserverInstances[resizeObserverInstances.length - 1];
  const resize = () => observer.callback([{target: placeholder} as unknown as ResizeObserverEntry], observer);
  return {container, completion, restore, observer, resize};
}

describe('scroll restoration during a resizing animation', () => {
  it('restores after layout and after final placeholder cleanup, then releases the observer', async() => {
    const animation = createAnimation();
    animation.resize();
    expect(animation.restore).toHaveBeenCalledTimes(1);

    animation.completion.resolve();
    await animation.completion;
    await Promise.resolve();

    expect(animation.restore).toHaveBeenCalledTimes(2);
    expect(animation.observer.disconnect).toHaveBeenCalled();
    expect(getAnimationInstance(animation.container)).toBeUndefined();
  });

  it('lets only the newest deletion restore a shared scroll container', async() => {
    const first = createAnimation();
    const second = createAnimation(first.container);
    await Promise.resolve();

    expect(first.observer.disconnect).toHaveBeenCalled();
    first.resize();
    second.resize();
    expect(first.restore).not.toHaveBeenCalled();
    expect(second.restore).toHaveBeenCalledTimes(1);

    first.completion.resolve();
    await first.completion;
    expect(first.restore).not.toHaveBeenCalled();
    expect(getAnimationInstance(first.container)).toBeDefined();

    second.completion.resolve();
    await second.completion;
    await Promise.resolve();
    expect(getAnimationInstance(first.container)).toBeUndefined();
  });

  it('stops pinning after scrolling or leaving the chat cancels the animation', async() => {
    const animation = createAnimation();
    cancelAnimationByKey(animation.container);
    await Promise.resolve();

    animation.resize();
    animation.completion.resolve();
    await animation.completion;

    expect(animation.restore).not.toHaveBeenCalled();
    expect(animation.observer.disconnect).toHaveBeenCalled();
    expect(getAnimationInstance(animation.container)).toBeUndefined();
  });
});
