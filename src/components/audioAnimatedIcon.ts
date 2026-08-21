import createElementFromMarkup from '@helpers/createElementFromMarkup';
import forwardMarkup from '@/assets/audioIcons/forward.svg?raw';
import pauseplayMarkup from '@/assets/audioIcons/pauseplay.svg?raw';
import playpauseMarkup from '@/assets/audioIcons/playpause.svg?raw';
import rewindMarkup from '@/assets/audioIcons/rewind.svg?raw';


/**
 * The four animated audio glyphs. `playpause` / `pauseplay` are transitions — each one starts on the
 * glyph it is named after and freezes on the other. `forward` / `rewind` rest on their finished
 * frame and simply replay, so they read as a pulse rather than a change of state.
 */
export type AudioAnimatedIconName = 'playpause' | 'pauseplay' | 'forward' | 'rewind';

const MARKUP: Record<AudioAnimatedIconName, string> = {
  playpause: playpauseMarkup,
  pauseplay: pauseplayMarkup,
  forward: forwardMarkup,
  rewind: rewindMarkup
};

/**
 * Chrome no longer renders SMIL (since 150): the timeline advances and `beginEvent` fires, but the
 * animated value never reaches the element, so a glyph only ever snaps between its first and last
 * frame — which is what "the animation sometimes doesn't play" turned out to be. So the glyph's own
 * keyframes are replayed through the Web Animations API instead, which every engine has.
 *
 * Only the path morph needs more than that: `d` is animatable as a CSS property in Chrome and
 * Firefox but not yet in Safari, and that is the one case left on SMIL — which Safari does still
 * render. The choice is made per glyph rather than per browser, so the seek pulses, which only move
 * their shapes about, take the Web Animations path everywhere.
 */
const CAN_ANIMATE = typeof Element !== 'undefined' && typeof Element.prototype.animate === 'function';
const CAN_ANIMATE_PATH = CAN_ANIMATE && typeof CSS !== 'undefined' && !!CSS.supports?.('d', 'path("M 0 0")');

/** One SMIL animation is one CSS value, so animations sharing a target become one set of keyframes. */
type GlyphAnimation = {target: SVGElement, keyframes: Keyframe[], duration: number};

const parseDuration = (value: string) => parseFloat(value) * (value.endsWith('ms') ? 1 : 1000);

/** The SMIL transform types the glyphs use, written as the CSS functions that mean the same. */
function transformFunction(type: string, value: string) {
  const [first, second, third] = value.trim().split(/[\s,]+/);
  switch(type) {
    case 'translate':
      return `translate(${first}px, ${second || 0}px)`;
    case 'scale':
      return `scale(${first}, ${second || first})`;
    case 'rotate':
      // SMIL takes the centre inline; CSS has to walk to it and back, since transform-origin is
      // pinned to the user-space origin below
      return third === undefined ?
        `rotate(${first}deg)` :
        `translate(${second}px, ${third}px) rotate(${first}deg) translate(${-parseFloat(second)}px, ${-parseFloat(third)}px)`;
    default:
      return '';
  }
}

/**
 * Reads a glyph's SMIL declarations as Web Animations keyframes. Exported for the tests — the
 * conversion is the part that has to keep matching the assets.
 */
export function readGlyphAnimations(svg: SVGSVGElement): GlyphAnimation[] {
  const byTarget = new Map<SVGElement, SVGAnimationElement[]>();
  (Array.from(svg.querySelectorAll('animate, animateTransform')) as SVGAnimationElement[]).forEach((animation) => {
    const target = animation.parentElement as any as SVGElement;
    const list = byTarget.get(target);
    if(list) list.push(animation);
    else byTarget.set(target, [animation]);
  });

  const result: GlyphAnimation[] = [];
  byTarget.forEach((animations, target) => {
    // the whole glyph is authored on one clock, so the first declaration's timing describes the rest
    const first = animations[0];
    const duration = parseDuration(first.getAttribute('dur'));
    const offsets = first.getAttribute('keyTimes').split(';').map(Number);
    const splines = (first.getAttribute('keySplines') || '').split(';').filter(Boolean);

    const keyframes = offsets.map((offset, index): Keyframe => {
      const keyframe: Keyframe = {offset};
      let transform = '';

      animations.forEach((animation) => {
        const value = animation.getAttribute('values').split(';')[index].trim();
        if(animation.getAttribute('attributeName') === 'd') {
          keyframe.d = `path("${value}")`;
          return;
        }

        // SMIL composition: an additive declaration stacks onto the ones before it, a plain one
        // replaces the base transform outright
        const piece = transformFunction(animation.getAttribute('type'), value);
        transform = animation.getAttribute('additive') === 'sum' && transform ? `${transform} ${piece}` : piece;
      });

      if(transform) {
        keyframe.transform = transform;
      }

      // a spline describes the segment that STARTS at its keyframe, which is what `easing` means here
      const spline = splines[index];
      if(spline) {
        keyframe.easing = `cubic-bezier(${spline.trim().split(/[\s,]+/).join(', ')})`;
      }

      return keyframe;
    });

    result.push({target, keyframes, duration});
  });

  return result;
}

export type AudioAnimatedIcon = {
  element: SVGSVGElement,
  duration: number,
  /** Replays a glyph that is already on screen — one being mounted starts from its markup. */
  play: () => void,
  /** How far the glyph has moved, in ms. */
  elapsed: () => number,
  /** Starts the glyph part-way, so a morph that interrupts another can pick it up where it stands. */
  seek: (ms: number) => void
};

/**
 * Builds one of the glyphs. It holds its first frame until `play()` runs — nothing moves just
 * because the icon was mounted.
 */
export default function createAudioAnimatedIcon(name: AudioAnimatedIconName, autoplay?: boolean): AudioAnimatedIcon {
  const element = createElementFromMarkup(MARKUP[name]) as any as SVGSVGElement;
  element.classList.add('audio-animated-icon');

  const parsed = readGlyphAnimations(element);
  const morphsPath = parsed.some(({keyframes}) => keyframes.some((keyframe) => keyframe.d));

  if(!CAN_ANIMATE || (morphsPath && !CAN_ANIMATE_PATH)) {
    const animations = Array.from(element.querySelectorAll('animate, animateTransform')) as SVGAnimationElement[];
    // The start is declared on the element rather than triggered afterwards: `beginElement()` on a
    // node inserted in this same task can be dropped, because its timeline has not started yet.
    if(autoplay) {
      animations.forEach((animation) => animation.setAttribute('begin', '0s'));
    }

    return {
      element,
      duration: parsed[0]?.duration || 0,
      play: () => animations.forEach((animation) => animation.beginElement()),
      // Both deliberately inert: seeking SMIL into the middle of a morph is what froze the glyph the
      // last time it was tried, so a morph on this path always runs from its own first frame.
      elapsed: () => 0,
      seek: () => {}
    };
  }

  // the declarations would only fight the Web Animations ones in a browser that runs both
  element.querySelectorAll('animate, animateTransform').forEach((animation) => animation.remove());
  // SMIL turns about the user-space origin; CSS would turn about the middle of the view box
  parsed.forEach(({target, keyframes}) => {
    if(keyframes.some((keyframe) => keyframe.transform)) {
      target.style.transformOrigin = '0px 0px';
    }
  });

  let animations: Animation[];
  const start = (offset?: number) => {
    animations = parsed.map(({target, keyframes, duration}) => {
      const animation = target.animate(keyframes, {duration, fill: 'forwards'});
      if(offset) animation.currentTime = offset;
      return animation;
    });
  };

  if(autoplay) {
    start();
  }

  return {
    element,
    duration: parsed[0]?.duration || 0,
    play: () => {
      animations?.forEach((animation) => animation.cancel());
      start();
    },
    elapsed: () => (animations?.[0]?.currentTime as number) || 0,
    seek: (ms) => {
      if(animations) animations.forEach((animation) => animation.currentTime = ms);
      else start(ms);
    }
  };
}

/**
 * The play button's glyph. Animating means starting on the glyph already on screen and moving to the
 * new one; the very first call is silent, so a row that mounts mid-playback simply shows the pause
 * glyph rather than performing for nobody.
 */
export function createPlayPauseIcon(getContainer: () => HTMLElement) {
  let playing: boolean;
  let current: AudioAnimatedIcon;

  return (next: boolean, animate = true) => {
    if(playing === next) {
      return;
    }

    const isFirst = playing === undefined;
    playing = next;

    const shouldAnimate = animate && !isFirst;
    const name: AudioAnimatedIconName = shouldAnimate ?
      (next ? 'playpause' : 'pauseplay') :
      (next ? 'pauseplay' : 'playpause');

    const icon = createAudioAnimatedIcon(name, shouldAnimate);

    // The two files are the same move in opposite directions, so a morph that interrupts another
    // starts as far from its own beginning as the one it cut short had left to run: the glyph turns
    // around where it stands, instead of jumping back to a whole play or pause first. Pressing the
    // button repeatedly is exactly where that jump was visible.
    if(shouldAnimate && current) {
      const elapsed = Math.min(current.elapsed(), icon.duration);
      if(elapsed) {
        icon.seek(icon.duration - elapsed);
      }
    }

    current = icon;
    getContainer().replaceChildren(icon.element);
  };
}
