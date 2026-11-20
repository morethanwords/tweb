import {Accessor, batch, onCleanup} from 'solid-js';
import A11yButton from '@components/a11yButton';
import Modes from '@config/modes';
import I18n from '@lib/langPack';
import {useMediaEditorContext} from '@components/mediaEditor/context';
import type {NumberPair, ResizableLayer} from '@components/mediaEditor/types';
import beginLayerTransform from '@components/mediaEditor/canvas/beginLayerTransform';
import {shapeLocalVector} from '@components/mediaEditor/canvas/layerResizeGeometry';
import {desktopArrowBendAt, desktopArrowBendHandle, setDesktopArrowBend} from '@components/mediaEditor/native/desktopShapeGeometry';
import styles from '@components/mediaEditor/canvas/shapeBendHandle.module.scss';
import {mapPreviewVector, previewLayerMatrix, type PreviewAffine} from '@components/mediaEditor/canvas/previewAffine';

export default function ShapeBendHandle(props: {
  layer: ResizableLayer;
  processed: Accessor<{position: NumberPair; rotation: number; scale: number}>;
  container: () => HTMLDivElement;
}) {
  const context = useMediaEditorContext();
  const point = () => {
    const local = desktopArrowBendHandle(props.layer.shapeInfo);
    const preview = context.editorState.paintPreviewAffine;
    if(preview) {
      const p = mapPreviewVector(previewLayerMatrix(preview.forward, [0, 0], props.layer.rotation, props.layer.scale, 1), local);
      const {position} = props.processed();
      return [p[0] + position[0], p[1] + position[1]];
    }
    const {position, rotation, scale} = props.processed();
    const factor = scale / context.editorState.pixelRatio;
    return [position[0] + (local[0] * Math.cos(rotation) - local[1] * Math.sin(rotation)) * factor,
      position[1] + (local[0] * Math.sin(rotation) + local[1] * Math.cos(rotation)) * factor];
  };
  let finish: () => void;
  let press: {id: number; x: number; y: number; center: NumberPair; rotation: number; scale: number; moved: boolean; inverse?: PreviewAffine};
  let control: HTMLElement;
  const end = () => {
    const previous = press;
    press = undefined;
    if(previous && control.hasPointerCapture(previous.id)) control.releasePointerCapture(previous.id);
    finish?.();
    finish = undefined;
  };
  onCleanup(end);
  const change = (bend: number) => {
    finish ??= beginLayerTransform(context, props.layer);
    batch(() => setDesktopArrowBend(props.layer.shapeInfo, bend));
  };
  return <A11yButton
    ref={control}
    class={`media-editor__shape-bend-handle media-editor__resizable-container-circle ${styles.handle}`}
    aria-label={I18n.format('MediaEditor.BendArrow', true)}
    role="slider"
    aria-orientation="vertical"
    aria-valuemin={-100}
    aria-valuemax={100}
    aria-valuenow={Math.round((props.layer.shapeInfo.bend ?? 0) * 100)}
    style={{left: point()[0] + 'px', top: point()[1] + 'px', transform: 'translate(-50%, -50%)',
      width: '24px', height: '24px', padding: '0', border: '0',
      background: 'radial-gradient(circle, #fff 0 4px, transparent 4px)',
      filter: 'drop-shadow(0 0 1px #000)',
      'touch-action': 'none', 'pointer-events': 'auto', 'z-index': 2}}
    onPointerDown={event => {
      if(event.button !== 0 || press) return;
      event.preventDefault();
      event.stopPropagation();
      end();
      if(Modes.a11y) control.focus();
      const rect = props.container().getBoundingClientRect();
      const processed = props.processed();
      press = {id: event.pointerId, x: event.clientX, y: event.clientY, moved: false,
        center: [rect.left + rect.width / 2, rect.top + rect.height / 2],
        rotation: context.editorState.paintPreviewAffine ? props.layer.rotation : processed.rotation,
        scale: context.editorState.paintPreviewAffine ? props.layer.scale : processed.scale / context.editorState.pixelRatio,
        inverse: context.editorState.paintPreviewAffine?.inverse};
      finish = beginLayerTransform(context, props.layer);
      control.setPointerCapture(event.pointerId);
    }}
    onPointerMove={event => {
      if(!press || event.pointerId !== press.id) return;
      if(!press.moved && Math.hypot(event.clientX - press.x, event.clientY - press.y) < 4) return;
      press.moved = true;
      const vector: NumberPair = [event.clientX - press.center[0], event.clientY - press.center[1]];
      const local = shapeLocalVector(press.inverse ? mapPreviewVector(press.inverse, vector) : vector, press.rotation, press.scale);
      change(desktopArrowBendAt(props.layer.shapeInfo, local[1]));
    }}
    onPointerUp={event => { if(event.pointerId === press?.id) end(); }}
    onPointerCancel={end}
    onLostPointerCapture={end}
    onKeyDown={event => {
      if(!Modes.a11y) return;
      const values: Record<string, number> = {ArrowUp: -.05, ArrowDown: .05, PageUp: -.25, PageDown: .25};
      if(event.key !== 'Home' && event.key !== 'End' && values[event.key] === undefined) return;
      event.preventDefault();
      event.stopPropagation();
      change(event.key === 'Home' ? -1 : event.key === 'End' ? 1 : (props.layer.shapeInfo.bend ?? 0) + values[event.key]);
    }}
    onKeyUp={event => {
      if(Modes.a11y && ['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End'].includes(event.key)) end();
    }}
    onBlur={end}
  />;
}
