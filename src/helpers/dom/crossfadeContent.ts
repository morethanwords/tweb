import {getTransition} from '@config/transitions';
import getLayoutWidth from '@helpers/dom/getLayoutWidth';
import isInSight from '@helpers/dom/isInSight';
import liteMode from '@helpers/liteMode';
import noop from '@helpers/noop';
import sequentialDom from '@helpers/sequentialDom';

/** the `cross-fade` of `Animated` (`@helpers/solid/animations`), and of the DOM that has no Solid around it */
export const CROSS_FADE_KEYFRAMES: Keyframe[] = [{opacity: 0}, {opacity: 1}];

/** the timing of `Animated`, whatever it animates */
export function getAnimatedOptions(duration = 200): KeyframeAnimationOptions {
  return {duration, easing: getTransition('standard').easing};
}

/**
 * A status taking the place of another one - an activity coming or going above all. Shorter than the
 * default: a fade has no distance for the eye to follow, and the word under the chat's name changes
 * often enough that the default reads as the line lagging behind
 */
export const STATUS_CROSSFADE_DURATION = 120;

type Crossfade = {
  leaving: HTMLElement,
  fadingOut: Animation,
  /** what it fades to, as it was given */
  nodes: (Node | string)[],
  /** the text put in, wrapped for the crossfade - a text node has no box to fade */
  wrappers: HTMLElement[],
  fadingIn: Animation[],
  /** how long this one takes, the default or what the caller asked for */
  duration: number,
  /** from the width of what it held to the width of what it holds (`resize`) */
  resizing?: {animation: Animation, from: number, to: number},
  /** of the resize last asked for: a frame starts only the last one */
  resizeVersion?: number
};

const crossfades: WeakMap<HTMLElement, Crossfade> = new WeakMap();

/** Ends the crossfade of `element` at once, leaving it what it was crossfading to */
function finishCrossfade(element: HTMLElement) {
  const crossfade = crossfades.get(element);
  if(!crossfade) {
    return;
  }

  crossfades.delete(element);
  crossfade.fadingOut.cancel();
  crossfade.fadingIn.forEach((animation) => animation.cancel());
  crossfade.resizing?.animation.cancel();
  element.classList.remove('is-crossfading');
  // * unless someone has written over it in the meantime
  if(crossfade.leaving.parentNode === element) {
    crossfade.leaving.remove();
  }

  crossfade.wrappers.forEach((wrapper) => {
    if(wrapper.parentNode === element) {
      wrapper.replaceWith(...wrapper.childNodes);
    }
  });
}

/**
 * What `element` is crossfading to, as `crossfadeContent` was given it, while it does - the
 * element's own children then hold the wrapped text of it, and what fades out
 */
export function getCrossfadingTo(element: HTMLElement) {
  const crossfade = crossfades.get(element);
  return crossfade?.leaving.parentNode === element ? crossfade.nodes : undefined;
}

/** Puts `nodes` in before what is fading out, fading in in step with it */
function enter(crossfade: Crossfade, nodes: (Node | string)[]) {
  const wrappers: HTMLElement[] = [];
  const entering = nodes.map((node) => {
    if(typeof(node) !== 'string' && node.nodeType === Node.ELEMENT_NODE) {
      return node as HTMLElement;
    }

    const wrapper = document.createElement('span');
    wrapper.append(node);
    wrappers.push(wrapper);
    return wrapper;
  });

  crossfade.leaving.before(...entering);
  crossfade.nodes = nodes;
  crossfade.wrappers = wrappers;

  const options = getAnimatedOptions(crossfade.duration);
  const {currentTime} = crossfade.fadingOut;
  crossfade.fadingIn = entering.map((node) => {
    const animation = node.animate(CROSS_FADE_KEYFRAMES, options);
    if(currentTime !== null) animation.currentTime = currentTime;
    return animation;
  });
}

/**
 * Takes an element as wide as its content (`resize`) from the width of what it held to the
 * width of what it holds, in step with what is left of the crossfade. Nothing is read while the
 * caller writes: the widths are read in the next frame's measure phase - the old one off what
 * fades out, which keeps its own width (`width: max-content`), or off the resize under way - and
 * the resize starts in its mutate phase, before that frame paints. Out of sight, the crossfade
 * ends there instead
 */
function resize(element: HTMLElement, crossfade: Crossfade) {
  let from: number;
  const {resizing} = crossfade;
  if(resizing) {
    const {animation} = resizing;
    const progress = animation.effect.getComputedTiming().progress ?? (animation.playState === 'finished' ? 1 : 0);
    from = resizing.from + (resizing.to - resizing.from) * progress;
    animation.cancel();
    crossfade.resizing = undefined;
  }

  const version = crossfade.resizeVersion = (crossfade.resizeVersion || 0) + 1;
  const isCurrent = () => crossfades.get(element) === crossfade && crossfade.resizeVersion === version;
  let to: number, inSight: boolean;
  sequentialDom.measure(() => {
    if(!isCurrent()) {
      return;
    }

    inSight = isInSight(element);
    if(inSight) {
      from ??= getLayoutWidth(crossfade.leaving);
      to = getLayoutWidth(element);
    }
  });

  sequentialDom.mutate(() => {
    if(!isCurrent() || inSight === undefined) {
      return;
    }

    if(!inSight) {
      finishCrossfade(element);
      return;
    }

    if(Math.abs(to - from) < .5) {
      return;
    }

    const options = getAnimatedOptions(crossfade.duration);
    crossfade.resizing = {
      from,
      to,
      animation: element.animate([{width: from + 'px'}, {width: to + 'px'}], {
        ...options,
        duration: Math.max(0, (options.duration as number) - ((crossfade.fadingOut.currentTime as number) || 0))
      })
    };
  });
}

/**
 * Puts `content` in place of what `element` holds with a crossfade: the old content fades out
 * over the new, which fades in. The new content takes the element's flow from the start - so
 * nothing is measured, and whoever looks for it finds it among the element's children - while
 * the old one is laid over the element's own box (`.crossfade-leaving`) and dropped once faded.
 * The `mode` says what the content is to what the element holds:
 *
 * - `crossfade` - another thing, to crossfade to;
 * - `update` - the content is of the kind it holds, new only in its details: a plain replacement,
 *   unless the element is crossfading to it, when the update fades in where that left off;
 * - `replace` - a plain replacement, cutting a crossfade short.
 *
 * With animations off or out of sight it is always the plain replacement.
 *
 * An element as wide as its content - next to something its width moves - can be given `resize`:
 * its width then goes from the old content's to the new one's in step with the crossfade, read
 * and started a frame later (`resize`) - and `duration`, when the default length is not its own
 */
export default function crossfadeContent(
  element: HTMLElement,
  content: Node | string | (Node | string)[],
  mode: 'crossfade' | 'update' | 'replace' = 'crossfade',
  {resize: shouldResize, duration}: {resize?: boolean, duration?: number} = {}
) {
  const nodes = Array.isArray(content) ? content : [content];
  const canAnimate = element.isConnected && !document.hidden && liteMode.isAvailable('animations');
  const running = crossfades.get(element);
  if(mode === 'update' && canAnimate && running?.leaving.parentNode === element) {
    running.fadingIn.forEach((animation) => animation.cancel());
    Array.from(element.childNodes).forEach((node) => {
      if(node !== running.leaving) node.remove();
    });

    enter(running, nodes);
    if(shouldResize) resize(element, running);
    return;
  }

  finishCrossfade(element);

  if(mode !== 'crossfade' || !canAnimate || !element.firstChild) {
    element.replaceChildren(...nodes);
    return;
  }

  const leaving = document.createElement('span');
  leaving.className = 'crossfade-leaving';
  leaving.setAttribute('aria-hidden', 'true');
  leaving.append(...element.childNodes);
  element.classList.add('is-crossfading');
  element.append(leaving);

  const options = getAnimatedOptions(duration);
  const crossfade: Crossfade = {
    leaving,
    // * faded out it stays so: it is dropped only once `finished` comes, which can be a frame later
    fadingOut: leaving.animate(CROSS_FADE_KEYFRAMES.slice().reverse(), {...options, fill: 'forwards'}),
    nodes,
    wrappers: [],
    fadingIn: [],
    duration: options.duration as number
  };

  enter(crossfade, nodes);
  crossfades.set(element, crossfade);
  if(shouldResize) resize(element, crossfade);
  crossfade.fadingOut.finished.then(() => {
    if(crossfades.get(element) === crossfade) {
      finishCrossfade(element);
    }
  }, noop);
}
