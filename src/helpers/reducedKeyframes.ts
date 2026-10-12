import liteMode, {AnimationLevel} from '@helpers/liteMode';

// * what reduced animations keep: what fades or recolours, and the size of what grows or shrinks
// * where it stands - the same list as `$animation-level-reduced` in _animationLevel.scss, so the
// * two cannot part. Anything else - a transform, a position, a padding or a font size - moves
const KEPT: ReadonlySet<string> = new Set([
  'opacity', 'visibility', 'color', 'backgroundColor', 'background', 'borderColor', 'borderTopColor',
  'borderRightColor', 'borderBottomColor', 'borderLeftColor', 'outlineColor', 'boxShadow', 'fill',
  'stroke', 'strokeDasharray', 'strokeWidth', 'filter', 'backdropFilter', 'fontWeight',
  'width', 'height', 'minWidth', 'minHeight', 'maxWidth', 'maxHeight', 'flexBasis',
  'gridTemplateRows', 'gridTemplateColumns'
]);
const isKept = (property: string) => KEPT.has(property) || property.startsWith('margin');

const TIMING: ReadonlySet<string> = new Set(['offset', 'easing', 'composite']);

/**
 * What is left of keyframes with reduced animations: what fades, recolours or grows where it
 * stands, without what moves - or nothing when they only move. Every keyframe stays, so the
 * timing does too - one left with no property takes it from its neighbours, or the element
 */
export default function reducedKeyframes(keyframes: Keyframe[]): Keyframe[] | undefined {
  let kept = false;
  const reduced = keyframes.map((keyframe) => {
    const left: Keyframe = {};
    for(const property in keyframe) {
      if(TIMING.has(property) || isKept(property)) {
        left[property] = keyframe[property];
        kept ||= !TIMING.has(property);
      }
    }

    return left;
  });

  return kept ? reduced : undefined;
}

/** The keyframes to play at an animation level: all of them, what is left without movement, or none */
export function keyframesAtLevel(keyframes: Keyframe[], level: AnimationLevel = liteMode.getAnimationLevel()) {
  return level === 2 ? keyframes : (level ? reducedKeyframes(keyframes) : undefined);
}
