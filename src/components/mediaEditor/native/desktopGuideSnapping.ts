import type {ExpandedCropRect} from '@components/mediaEditor/native/desktopExpandedCrop';

export type DesktopGuideSnapping = {
  offset: [number, number];
  guides: {x?: number; y?: number};
};

// tdesktop a532622be61ffb811c34311583c9fd4828786833:
// scene_item_base.cpp:385–459, editor.style sticky trigger.
// Bounds are the visible item's scene AABB at the RAW drag position, not the
// handle box or the already-snapped position. All coordinates are physical.
function snapAxis(start: number, length: number, canvasStart: number, canvasLength: number, threshold: number) {
  const candidates: {shift: number; guide: number; priority: number}[] = [];
  for(let line = 0; line < 5; ++line) {
    const guide = canvasStart + canvasLength * (line / 4);
    for(let anchor = 0; anchor < 3; ++anchor) {
      candidates.push({
        shift: guide - (start + length * (anchor / 2)),
        guide,
        priority: (anchor === 1 ? 0 : 3) + (line === 2 ? 0 : line === 0 || line === 4 ? 1 : 2)
      });
    }
  }
  candidates.sort((a, b) => a.priority - b.priority);
  const kept: number[] = [];
  let best = threshold;
  let result: {shift: number; guide: number};
  for(const candidate of candidates) {
    if(Math.abs(candidate.shift) > threshold || kept.some(shift => Math.abs(shift - candidate.shift) < threshold * 2)) continue;
    kept.push(candidate.shift);
    // Deliberately <=: an equally near, later retained candidate replaces it.
    if(Math.abs(candidate.shift) <= best) {
      best = Math.abs(candidate.shift);
      result = candidate;
    }
  }
  return result;
}

/** Pure Shift BODY-drag target, not resizing, freehand, animation or export.
 * The caller owns eligibility, raw bounds, zoom and modifier lifetime. It must
 * reevaluate on Shift transitions even without movement, and apply this same
 * offset to companion selections. No viewport-based document activation here.
 */
export default function desktopGuideSnapping(input: {
  visibleBounds: ExpandedCropRect;
  canvasBounds: ExpandedCropRect;
  zoom: number;
  shift: boolean;
}): DesktopGuideSnapping {
  const {visibleBounds: item, canvasBounds: canvas, zoom, shift} = input;
  const result: DesktopGuideSnapping = {offset: [0, 0], guides: {}};
  if(!shift || !Number.isFinite(zoom) || zoom <= 0) return result;
  const threshold = 12 / zoom;
  if(!Number.isFinite(threshold)) return result;
  for(const rect of [item, canvas]) {
    if(![rect.x, rect.y, rect.width, rect.height, rect.x + rect.width, rect.y + rect.height].every(Number.isFinite) || rect.width < 0 || rect.height < 0) return result;
  }
  if(canvas.width === 0 || canvas.height === 0) return result;
  const x = snapAxis(item.x, item.width, canvas.x, canvas.width, threshold);
  const y = snapAxis(item.y, item.height, canvas.y, canvas.height, threshold);
  if(x) { result.offset[0] = x.shift; result.guides.x = x.guide; }
  if(y) { result.offset[1] = y.shift; result.guides.y = y.guide; }
  return result;
}
