import desktopGuideSnapping from '@components/mediaEditor/native/desktopGuideSnapping';
import type {NumberPair} from '@components/mediaEditor/types';
import {animateValue} from '@helpers/animateValue';
import {easeOutCubicApply} from '@helpers/easing/easeOutCubic';
import isTargetAnInput from '@helpers/dom/isTargetAnInput';
import type {ExpandedCropRect} from '@components/mediaEditor/native/desktopExpandedCrop';

type Axis = {guide?: number; last?: number; anchor: number; progress: number; cancel?: () => void};

/** One active body drag only. The caller supplies cached physical geometry and
 * owns the one history commit. Animation changes translation, never layout.
 */
export default function desktopGuideDrag(options: {
  document: Document;
  center: NumberPair;
  canvasBounds: ExpandedCropRect;
  halfWidth: number;
  halfHeight: number;
  zoom: number;
  motion: () => boolean;
  write: (diff: NumberPair, guides: {x?: number; y?: number}) => void;
}) {
  const axes: Axis[] = [{anchor: 0, progress: 0}, {anchor: 0, progress: 0}];
  let raw: NumberPair = [0, 0];
  let shift = false;
  let disposed = false;
  const half = [options.halfWidth, options.halfHeight];
  function paint() {
    if(disposed) return;
    const offset = axes.map((axis, i) => axis.last === undefined ? 0 :
      (axis.last - (options.center[i] + raw[i] + axis.anchor * half[i])) * axis.progress);
    options.write([raw[0] + offset[0], raw[1] + offset[1]], {x: axes[0].guide, y: axes[1].guide});
  }
  function recompute() {
    // Quarter-turn projection is a uniform axis permutation: native
    // (12/currentZoom) scene units is exactly 12 CSS pixels. Solve in this
    // domain to avoid round-trip division losing the inclusive boundary.
    const result = desktopGuideSnapping({
      visibleBounds: {x: options.center[0] + raw[0] - half[0], y: options.center[1] + raw[1] - half[1],
        width: half[0] * 2, height: half[1] * 2},
      canvasBounds: options.canvasBounds, zoom: 1, shift
    });
    for(let i = 0; i < 2; ++i) {
      const axis = axes[i];
      const sceneGuide = i ? result.guides.y : result.guides.x;
      const guide = sceneGuide;
      const anchor = guide === undefined ? axis.anchor : Math.round((guide - result.offset[i] - options.center[i] - raw[i]) / half[i]);
      if(guide === axis.guide && anchor === axis.anchor) continue;
      const continues = guide === undefined || guide === axis.last && anchor === axis.anchor;
      axis.cancel?.();
      const from = continues ? axis.progress : 0;
      axis.guide = guide;
      if(guide !== undefined) { axis.last = guide; axis.anchor = anchor; }
      const to = guide === undefined ? 0 : 1;
      if(options.motion()) {
        axis.progress = from;
        axis.cancel = animateValue(from, to, 150, value => { axis.progress = value; paint(); },
          {easing: progress => easeOutCubicApply(progress, 1)});
      } else axis.progress = to;
    }
    paint();
  }
  function key(event: KeyboardEvent) {
    if(event.key !== 'Shift' || event.isComposing || isTargetAnInput(doc.activeElement as HTMLElement) ||
      isTargetAnInput(event.target as HTMLElement) || (event.target as Element)?.closest?.('[contenteditable]:not([contenteditable="false"])')) return;
    shift = event.type === 'keydown';
    recompute();
  }
  const doc = options.document;
  doc.addEventListener('keydown', key);
  doc.addEventListener('keyup', key);
  function dispose() {
    disposed = true;
    axes.forEach(axis => axis.cancel?.());
    doc.removeEventListener('keydown', key);
    doc.removeEventListener('keyup', key);
  }
  return {
    update(x: number, y: number, held: boolean) {
      if(disposed) return;
      raw = [x, y];
      shift = held;
      recompute();
    },
    // Stop at the currently drawn position, as finishStickyDrag does. The
    // caller commits that diff before removing temporary translation/guides.
    dispose
  };
}
