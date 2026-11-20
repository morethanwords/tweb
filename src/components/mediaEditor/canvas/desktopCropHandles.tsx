import {batch, createEffect, For, onCleanup, onMount} from 'solid-js';
import A11yButton from '@components/a11yButton';
import SpotlightMask from '@components/mediaEditor/canvas/cropSpotlight';
import {useMediaEditorContext} from '@components/mediaEditor/context';
import desktopCropSession from '@components/mediaEditor/native/desktopCropSession';
import {beginDesktopCropDrag, desktopCropFromDisplay, desktopCropToDisplay, desktopCropToIntegerRect, type CropEdge} from '@components/mediaEditor/native/desktopExpandedCrop';
import Modes from '@config/modes';
import I18n from '@lib/langPack';
import styles from '@components/mediaEditor/canvas/desktopCropHandles.module.scss';
import {hasUnsupportedDesktopCropLayers} from '@components/mediaEditor/native/desktopCropAvailability';

const handles = [
  {edge: 'top-left', x: 0, y: 0, label: 'MediaEditor.CropTopLeft'},
  {edge: 'top-right', x: 1, y: 0, label: 'MediaEditor.CropTopRight'},
  {edge: 'bottom-left', x: 0, y: 1, label: 'MediaEditor.CropBottomLeft'},
  {edge: 'bottom-right', x: 1, y: 1, label: 'MediaEditor.CropBottomRight'},
  {edge: 'left', x: 0, y: .5, label: 'MediaEditor.CropLeft'},
  {edge: 'right', x: 1, y: .5, label: 'MediaEditor.CropRight'},
  {edge: 'top', x: .5, y: 0, label: 'MediaEditor.CropTop'},
  {edge: 'bottom', x: .5, y: 1, label: 'MediaEditor.CropBottom'}
] as const;

/** Physical source geometry, also in RTL. No source-coverage zoom, pinch or
 * legacy translation. The view and Ctrl permission are frozen at pointer down.
 */
export default function DesktopCropHandles() {
  const context = useMediaEditorContext();
  const {editorState, mediaState} = context;
  const session = desktopCropSession(context);
  const cropping = () => editorState.currentTab === 'crop';
  let root: HTMLDivElement;
  let gesture: ReturnType<typeof beginDesktopCropDrag>;
  let start: {x: number; y: number; pointer: number; target: HTMLElement};
  let controlHeld = false;
  const rect = () => {
    const view = session.view(), descriptor = session.descriptor();
    if(!view || !descriptor) return {x: 0, y: 0, width: 0, height: 0};
    const {angle, flipped} = view.geometry.orientation;
    return desktopCropToDisplay(descriptor.crop, descriptor.sourceSize, view.image, angle, flipped);
  };
  function begin(edge: CropEdge, ctrl: boolean) {
    if(!cropping() || editorState.isMoving) return false;
    const view = session.view();
    if(!view) return false;
    const sourceCrop = session.descriptor().crop;
    const size = editorState.canvasSize;
    gesture = beginDesktopCropDrag({image: view.image, crop: rect(),
      available: {x: 5, y: 5, width: size[0] - 10, height: size[1] - 10},
      edge, ctrl, expansionAllowed: !hasUnsupportedDesktopCropLayers(mediaState.resizableLayers), pointer: {x: 0, y: 0},
      fixedAspectRatio: editorState.fixedImageRatioKey ? sourceCrop.width / sourceCrop.height : undefined});
    batch(() => {
      session.setLocked(view);
      editorState.isMoving = true;
    });
    return true;
  }
  function move(x: number, y: number) {
    if(!gesture) return;
    const view = session.locked(), descriptor = session.descriptor();
    const {angle, flipped} = view.geometry.orientation;
    const crop = desktopCropToIntegerRect(desktopCropFromDisplay(gesture.update({x, y}), descriptor.sourceSize, view.image, angle, flipped));
    session.setDraft({...descriptor, crop});
  }
  function finish(cancel = false) {
    if(!gesture) return;
    const draft = session.draft();
    gesture = undefined;
    const pointer = start;
    start = undefined;
    batch(() => {
      if(!cancel && draft) session.commit(draft);
      session.setDraft(undefined);
      session.setLocked(undefined);
      session.setRoom(controlHeld);
      editorState.isMoving = false;
    });
    if(pointer?.target.hasPointerCapture?.(pointer.pointer)) pointer.target.releasePointerCapture(pointer.pointer);
  }
  function down(event: PointerEvent, edge: CropEdge) {
    if(event.button !== 0 || !event.isPrimary || !begin(edge, event.ctrlKey)) return;
    event.preventDefault();
    event.stopPropagation();
    const target = event.currentTarget as HTMLElement;
    start = {x: event.clientX, y: event.clientY, pointer: event.pointerId, target};
    target.setPointerCapture(event.pointerId);
  }
  function key(event: KeyboardEvent, edge: CropEdge) {
    if(!Modes.a11y || !cropping()) return;
    // Coordinates describe the picture, not reading order; ArrowLeft always
    // moves its physical left edge left, including in an RTL interface.
    const delta = {ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1]}[event.key];
    if(!delta || !begin(edge, event.ctrlKey)) return;
    event.preventDefault();
    event.stopPropagation();
    // A keyboard step is a source pixel, not a screen pixel that rounds to
    // nothing when zoomed in. Shift advances ten source pixels.
    const step = (event.shiftKey ? 10 : 1) * session.locked().transform.scale;
    move(delta[0] * step, delta[1] * step);
    finish();
  }
  onMount(() => {
    const doc = root.ownerDocument, win = doc.defaultView;
    const control = (event: KeyboardEvent) => {
      controlHeld = event.ctrlKey;
      if(event.key === 'Escape' && gesture) {
        finish(true);
        event.preventDefault();
        event.stopPropagation();
        return;
      }
      if(!cropping() || gesture) return;
      session.setRoom(event.ctrlKey);
    };
    const blur = () => { finish(true); session.setRoom(false); };
    doc.addEventListener('keydown', control, true);
    doc.addEventListener('keyup', control);
    win.addEventListener('blur', blur);
    onCleanup(() => {
      blur();
      doc.removeEventListener('keydown', control, true);
      doc.removeEventListener('keyup', control);
      win.removeEventListener('blur', blur);
    });
  });
  createEffect(() => {
    if(!cropping()) { finish(true); session.setRoom(false); }
  });
  const id = `desktop-crop-${Math.random().toString(36).slice(2)}`;
  return <>
    <SpotlightMask id={id} left={rect().x} top={rect().y} width={rect().width} height={rect().height} />
    <div ref={root} class={styles.root} style={{display: cropping() ? undefined : 'none',
      left: `${rect().x}px`, top: `${rect().y}px`, width: `${rect().width}px`, height: `${rect().height}px`}}
      onPointerMove={event => { if(start && event.pointerId === start.pointer) move(event.clientX - start.x, event.clientY - start.y); }}
      onPointerUp={event => { if(event.pointerId === start?.pointer) finish(); }}
      onPointerCancel={() => finish(true)} onLostPointerCapture={() => finish(true)}>
      <A11yButton class={styles.move} aria-label={I18n.format('MediaEditor.CropMove', true)}
        onPointerDown={event => down(event, 'move')} onKeyDown={event => key(event, 'move')} />
      <For each={handles.filter(handle => !editorState.fixedImageRatioKey || handle.edge.includes('-'))}>{handle =>
        <A11yButton class={styles.handle} data-crop-edge={handle.edge} aria-label={I18n.format(handle.label, true)}
          style={{left: `${handle.x * 100}%`, top: `${handle.y * 100}%`, cursor: `${handle.edge.includes('-') ? handle.x === handle.y ? 'nwse' : 'nesw' : handle.x === .5 ? 'ns' : 'ew'}-resize`}}
          onPointerDown={event => down(event, handle.edge)} onKeyDown={event => key(event, handle.edge)} />
      }</For>
    </div>
  </>;
}
