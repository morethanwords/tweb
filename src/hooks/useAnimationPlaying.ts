import {createSignal, onCleanup} from 'solid-js';
import animationIntersector, {AnimationItemNested} from '@components/animationIntersector';

type ObserveOptions = Omit<Parameters<typeof animationIntersector.addAnimation>[0], 'animation'>;

/**
 * Whether the animation intersector lets something play: in sight, the window in use, not under a popup or a peek
 * over its own. `observe` registers the element with it (the renderer's own play and pause stay with the caller) and
 * unregisters with the current owner.
 */
export default function useAnimationPlaying() {
  const [playing, setPlaying] = createSignal(false);

  const observe = (options: ObserveOptions) => {
    const animation = new AnimationItemNested({
      onPlay: () => setPlaying(true),
      onPause: () => setPlaying(false)
    });

    animationIntersector.addAnimation({...options, animation});
    onCleanup(() => animationIntersector.removeAnimationByPlayer(animation));
  };

  return [playing, observe] as const;
}
