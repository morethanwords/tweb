import {createEffect, onCleanup} from 'solid-js';
import type {MediaEditorContextValue} from '@components/mediaEditor/context';
import createDesktopPaintCamera, {desktopPaintWheelAngles, type DesktopPaintCameraGeometry} from '@components/mediaEditor/native/desktopPaintCamera';
import {basePreviewAffine, createPaintPreviewAffine, multiplyPreviewAffine, type PreviewAffine} from '@components/mediaEditor/canvas/previewAffine';
import sequentialDom from '@helpers/sequentialDom';
import isTargetAnInput from '@helpers/dom/isTargetAnInput';
import desktopPaintGeometry, {type PaintPreviewGeometry} from '@components/mediaEditor/canvas/desktopPaintGeometry';

/** Deliberately false until every consumer and actual browser/export checks pass.
 * No URL/localStorage switch. The explicit fixture registration is not a rollout.
 */
export const DESKTOP_PAINT_PREVIEW_ENABLED = false;
type GeometrySource = () => DesktopPaintCameraGeometry;
const fixtures = new WeakMap<MediaEditorContextValue, GeometrySource | true>();

/** Geometry is raw, UNFLIPPED source coordinates; the image keeps its own flip.
 * Explicit mounted-test opt-in only. Call before mounting the surface.
 */
export function registerPaintPreviewFixture(context: MediaEditorContextValue, geometry?: GeometrySource) {
  if(fixtures.has(context)) throw new Error('Paint preview fixture already registered');
  fixtures.set(context, geometry || true);
  return () => fixtures.delete(context);
}

export function attachDesktopPaintPreview(surface: HTMLElement, context: MediaEditorContextValue) {
  // No listener, reactive effect or geometry cost in the disabled production path.
  if(!fixtures.has(context)) return {dispose() {}};
  const {editorState} = context;
  const doc = surface.ownerDocument;
  let camera: ReturnType<typeof createDesktopPaintCamera>;
  let geometry: PaintPreviewGeometry;
  let pendingGeometry: PaintPreviewGeometry;
  const editingPointers = new Set<number>();
  let disposed = false, revision = 0;
  let pan: {id: number; start: [number, number]; latest: [number, number]; origin?: [number, number]};
  const eligible = () => !!fixtures.get(context) && !context.isEditingForAvatar &&
    surface.closest('[data-editor-platform="desktop"]') &&
    ['brush', 'text', 'sticker', 'shapes'].includes(editorState.currentTab);
  const busy = () => editorState.editingTextLayer !== undefined || !!editorState.drawingShape || editingPointers.size > 0;
  const excluded = (target: EventTarget) => {
    const element = target as HTMLElement;
    return isTargetAnInput(element) || !!element?.closest?.('button, input, select, textarea, [role="button"], [role="slider"], [contenteditable]');
  };
  function publish() {
    if(!camera || !editorState.mediaSize || !editorState.canvasSize) return;
    const m = camera.snapshot().previewTransform;
    const raw: PreviewAffine = [m[0], m[1], m[2], m[3], m[4], m[5]];
    const forward = multiplyPreviewAffine(raw, geometry.sourceFromLayer);
    editorState.paintPreviewAffine = {...createPaintPreviewAffine(
      basePreviewAffine(editorState.finalTransform, editorState.canvasSize, editorState.pixelRatio), forward), sourceBounds: geometry.sourceBounds};
  }
  function endPan() {
    const previous = pan;
    pan = undefined;
    camera?.endPan();
    if(previous && surface.hasPointerCapture?.(previous.id)) surface.releasePointerCapture(previous.id);
  }
  function reset() {
    ++revision;
    endPan();
    camera = undefined;
    pendingGeometry = undefined;
    editingPointers.clear();
    editorState.paintPreviewAffine = undefined;
  }
  createEffect(() => {
    if(disposed) return;
    const source = fixtures.get(context);
    if(!eligible() || !source || !editorState.canvasSize || !editorState.mediaSize) {
      reset();
      return;
    }
    let next: PaintPreviewGeometry;
    if(source === true) next = desktopPaintGeometry(context);
    else {
      const [w, h] = editorState.mediaSize;
      next = {camera: source(), sourceFromLayer: [1, 0, 0, 1, w / 2, h / 2],
        sourceBounds: {x: -w / 2, y: -h / 2, width: w, height: h}};
    }
    if(!next) { reset(); return; }
    if(editingPointers.size || editorState.editingTextLayer !== undefined) { pendingGeometry = next; return; }
    applyGeometry(next);
  });
  function applyGeometry(next: PaintPreviewGeometry) {
    pendingGeometry = undefined;
    geometry = next;
    // Web media is a physical LTR island, regardless of interface language.
    const bounds = {...geometry.camera, direction: 'ltr' as const};
    ++revision;
    endPan();
    if(camera) camera.resize(bounds);
    else camera = createDesktopPaintCamera(bounds);
    publish();
  }
  const measureOrigin = (apply: (origin: [number, number]) => void) => {
    const version = revision;
    let origin: [number, number];
    void sequentialDom.measure(() => {
      if(disposed || version !== revision) return;
      const rect = surface.getBoundingClientRect();
      origin = [rect.left, rect.top];
    }).then(() => sequentialDom.mutate(() => {
      if(!disposed && version === revision && origin && eligible()) apply(origin);
    }));
  };
  // Explicit DOM policy: round CSS event positions to integer logical Qt inputs.
  function local(client: [number, number], origin: [number, number]): [number, number] {
    const v = camera.snapshot().viewport;
    return [Math.round(client[0] - origin[0] - v.x), Math.round(client[1] - origin[1] - v.y)];
  }
  function wheel(event: WheelEvent) {
    if(!camera || !eligible() || busy() || pan || excluded(event.target) || event.buttons) return;
    event.preventDefault();
    event.stopPropagation();
    const client: [number, number] = [event.clientX, event.clientY];
    const delta = {deltaX: event.deltaX, deltaY: event.deltaY, deltaMode: event.deltaMode};
    measureOrigin(origin => {
      if(!camera || busy() || pan) return;
      camera.wheel(desktopPaintWheelAngles(delta, camera.snapshot().viewport), local(client, origin));
      publish();
    });
  }
  function down(event: PointerEvent) {
    if(event.button !== 1 || !camera || !eligible() || pan || excluded(event.target)) return;
    // Capture phase prevents both browser autoscroll and the painting/selection press.
    event.preventDefault();
    event.stopImmediatePropagation();
    if(busy()) return;
    const gesture = pan = {id: event.pointerId, start: [event.clientX, event.clientY], latest: [event.clientX, event.clientY]} as NonNullable<typeof pan>;
    surface.setPointerCapture?.(event.pointerId);
    measureOrigin(origin => {
      if(pan !== gesture || !camera) return;
      gesture.origin = origin;
      camera.pointerDown(1, local(gesture.start, origin));
      camera.pointerMove(local(gesture.latest, origin));
      publish();
    });
  }
  function move(event: PointerEvent) {
    if(!pan || event.pointerId !== pan.id) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    pan.latest = [event.clientX, event.clientY];
    if(pan.origin && camera) {
      camera.pointerMove(local(pan.latest, pan.origin));
      publish();
    }
  }
  function up(event: PointerEvent) {
    if(event.pointerId !== pan?.id) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    endPan();
  }
  function lost(event: PointerEvent) {
    endEditingPointer(event);
    if(event.pointerId === pan?.id) endPan();
  }
  function beginEditingPointer(event: PointerEvent) {
    if(event.button !== 0 || !eligible()) return;
    const target = event.target as Node;
    if(surface.contains(target) || editorState.resizeHandlesContainer?.contains(target)) editingPointers.add(event.pointerId);
  }
  function endEditingPointer(event: PointerEvent) {
    if(!editingPointers.delete(event.pointerId)) return;
    // The owner's bubble/target handlers finish their document edit first.
    queueMicrotask(() => {
      if(disposed || editingPointers.size || editorState.editingTextLayer !== undefined || !eligible() || !pendingGeometry) return;
      const next = pendingGeometry;
      pendingGeometry = undefined;
      applyGeometry(next);
    });
  }
  const active = {capture: true, passive: false};
  surface.addEventListener('wheel', wheel, active);
  surface.addEventListener('pointerdown', down, active);
  doc.addEventListener('pointerdown', beginEditingPointer, true);
  doc.addEventListener('pointerup', endEditingPointer, true);
  doc.addEventListener('pointercancel', endEditingPointer, true);
  doc.addEventListener('lostpointercapture', lost, true);
  doc.addEventListener('pointermove', move, active);
  doc.addEventListener('pointerup', up, active);
  doc.addEventListener('pointercancel', up, active);
  surface.addEventListener('lostpointercapture', lost);
  const dispose = () => {
    if(disposed) return;
    disposed = true;
    reset();
    surface.removeEventListener('wheel', wheel, true);
    surface.removeEventListener('pointerdown', down, true);
    doc.removeEventListener('pointerdown', beginEditingPointer, true);
    doc.removeEventListener('pointerup', endEditingPointer, true);
    doc.removeEventListener('pointercancel', endEditingPointer, true);
    doc.removeEventListener('lostpointercapture', lost, true);
    doc.removeEventListener('pointermove', move, true);
    doc.removeEventListener('pointerup', up, true);
    doc.removeEventListener('pointercancel', up, true);
    surface.removeEventListener('lostpointercapture', lost);
  };
  onCleanup(dispose);
  return {dispose};
}
