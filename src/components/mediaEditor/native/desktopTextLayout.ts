import type {HistoryItem} from '@components/mediaEditor/context';
import type {NumberPair, ResizableLayer, TextRenderingInfo} from '@components/mediaEditor/types';

/** Local geometry → source-image scene geometry, before viewport zoom/DPR.
 * resizableLayers.processedLayer applies layer.scale * finalTransform.scale;
 * useFinalTransform supplies viewport zoom/DPR separately. Insertion's inverse
 * zoom is already part of layer.scale and must not be applied a second time.
 * This is a geometric conversion, NOT a native editScale/bakeScale policy.
 */
export function getDesktopTextSceneScale(layerScale: number) {
  if(!Number.isFinite(layerScale) || layerScale <= 0) throw new RangeError('Invalid text layer scale');
  return layerScale;
}

/** Convert an explicitly chosen scene-space measurement box/font to the local
 * DOM space consumed by measureDesktopText. No viewport scale or DPR belongs
 * here. Choosing native session limits BEFORE/AFTER its separate proxy scale
 * remains the editing controller's job, not the measurement adapter's policy.
 */
export function getDesktopTextLocalMeasurementGeometry(sceneWrapWidth: number, sceneFontSize: number, layerScale: number) {
  const scale = getDesktopTextSceneScale(layerScale);
  return {wrapWidth: sceneWrapWidth / scale, fontSize: sceneFontSize / scale};
}

/** Export-only device-pixel conversion proven by getScaledLayersAndLines:37–41
 * and drawTextLayer:18–25. Do not feed viewport finalTransform.scale here:
 * useFinalTransform already includes DPR, whereas this is the export transform.
 */
export function getDesktopTextExportScale(layerScale: number, exportTransformScale: number, pixelRatio: number) {
  return getDesktopTextSceneScale(layerScale) * exportTransformScale * pixelRatio;
}

/** All arguments/results are native scene units, not CSS or device pixels.
 * scene_item_text.cpp ComputeTextLayoutSpec / TextBackgroundPadding.
 */
export function getDesktopTextLayoutSpec(imageSize: NumberPair, fontSize: number, style: string, widthFloor = 0) {
  const shortSide = Math.min(...imageSize);
  const hasBackground = style === 'framed' || style === 'semi-transparent' || style === 'opaque';
  const padding = hasBackground ? Math.trunc(fontSize * .4) : 0;
  const maxTextWidth = Math.max(Math.trunc(shortSide * .8) - 2 * padding, 20);
  return {
    padding,
    maxTextWidth,
    minTextWidth: Math.min(Math.max(Math.trunc(shortSide * .16) - 2 * padding, 1), maxTextWidth),
    wrapWidth: Math.max(maxTextWidth, widthFloor),
    maxHeight: shortSide / 3,
    minFontSize: Math.max(shortSide / 50, 1)
  };
}

/** startEditing retains the original unwrapped width; createAtCenter uses zero. */
export function getDesktopTextWidthFloor(unwrappedIdealWidth: number, draft: boolean) {
  return draft ? 0 : Math.ceil(unwrappedIdealWidth) + 2;
}

/** adjustProxyWidth: measured at wrapWidth, with the placeholder in an empty document. */
export function getDesktopTextProxyWidth(
  spec: ReturnType<typeof getDesktopTextLayoutSpec>,
  idealWidth: number,
  placeholderWidth?: number
) {
  const ideal = Math.max(Math.ceil(idealWidth), placeholderWidth ?? 0);
  return Math.min(Math.max(ideal + 2, spec.minTextWidth), spec.wrapWidth);
}

/** One step only: the caller must stage the next measurement, never force-layout in a loop.
 * Deliberately never grows a font, including an old font already below today's minimum.
 */
export function getNextDesktopTextFontSize(
  spec: ReturnType<typeof getDesktopTextLayoutSpec>,
  fontSize: number,
  documentHeight: number
) {
  return fontSize > spec.minFontSize && documentHeight > spec.maxHeight ?
    Math.max(fontSize * .9, spec.minFontSize) : fontSize;
}

/** Build one text-session history entry from a recovered, measured document.
 * No live store/DOM writes: callers publish this only after recovery has completed.
 * `edited` tracks input, not focus/layout/font readiness, so legacy documents stay untouched.
 * `fontSize` is local editor size (the measurement adapter owns scene conversion).
 * `current` includes independent formatting, but NOT session-owned automatic shrink:
 * keep that size local until commit so undo can restore the latest explicit size.
 */
export function createDesktopTextSessionEdit({before, current, index, edited, renderingInfo, fontSize}: {
  before: ResizableLayer;
  current: ResizableLayer;
  index: number;
  edited: boolean;
  renderingInfo: TextRenderingInfo;
  fontSize: number;
}): HistoryItem | undefined {
  if(!edited || index < 0) return;
  // Native undo can return to the starting text while a loaded font changes
  // its measured geometry. That is not a text edit to add to history.
  if(fontSize === current.textInfo.size && JSON.stringify(before.textRenderingInfo?.lines.map(line => line.content)) ===
    JSON.stringify(renderingInfo.lines.map(line => line.content))) return;
  const after = structuredClone(current);
  after.textRenderingInfo = structuredClone(renderingInfo);
  after.textInfo.size = fontSize;
  const oldValue = structuredClone(current);
  oldValue.textRenderingInfo = structuredClone(before.textRenderingInfo);
  // Other format actions retain their own entries. Only this session's automatic
  // size adjustment joins the recovered text in its undo/redo snapshot.
  if(JSON.stringify(oldValue) === JSON.stringify(after)) return;
  return {
    path: ['resizableLayers', index],
    oldValue,
    newValue: after,
    findBy: {id: current.id}
  };
}
