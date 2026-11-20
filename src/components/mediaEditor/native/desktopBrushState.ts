import type {BrushType, MediaEditorContextValue, MediaEditorState} from '@components/mediaEditor/context';
import type {ResizableLayer} from '@components/mediaEditor/types';
import {getBrushStateBank, snapshotBrushProfile} from '@components/mediaEditor/native/brushStateBank';
import {unwrap} from 'solid-js/store';
import {batch} from 'solid-js';
import {getDesktopArrowFrameHeight} from '@components/mediaEditor/native/desktopShapeGeometry';

export const desktopBrushSize = 22.6;

export const desktopBrushColors: Partial<Record<BrushType, string>> = {
  pen: '#ea2739',
  arrow: '#fc964d',
  brush: '#fcde65',
  blur: '#000000',
  eraser: '#000000'
};

export function snapshotDesktopBrushBank(editorState: MediaEditorState) {
  return snapshotBrushProfile(editorState, 'desktop');
}

export function getDesktopBrushBank(context: Pick<MediaEditorContextValue, 'editorState' | 'mediaState'>) {
  return getBrushStateBank(context, 'desktop', (brush, current) => ({
    size: desktopBrushSize,
    color: desktopBrushColors[brush] ?? current.color
  }));
}

/** Desktop arms shapes on plain clicks; Shift, Control, Alt or Meta inserts immediately. */
export function shouldDrawDesktopShape(event: Pick<MouseEvent, 'shiftKey' | 'ctrlKey' | 'altKey' | 'metaKey'> & {detail?: number}, a11y: boolean) {
  return !(event.shiftKey || event.ctrlKey || event.altKey || event.metaKey || a11y && event.detail === 0);
}

/** Live shape previews with one id-addressed history entry per completed input. */
export function createDesktopShapeBrushEdit({editorState, mediaState, actions}: Pick<MediaEditorContextValue, 'editorState' | 'mediaState' | 'actions'>) {
  let pending: {layer: ResizableLayer; before: ResizableLayer};
  const selected = () => mediaState.resizableLayers.find(layer =>
    layer.id === editorState.selectedResizableLayer && layer.type === 'shape' && layer.shapeInfo);
  const snapshot = (layer: ResizableLayer) => structuredClone(unwrap(layer));
  const strokeScale = (layer: ResizableLayer) => {
    const scale = layer?.scale * editorState.finalTransform.scale / editorState.pixelRatio;
    return layer?.scale > 0 && editorState.finalTransform.scale > 0 && editorState.pixelRatio > 0 &&
      Number.isFinite(scale) && scale > 0 ? scale : 0;
  };

  const finish = () => {
    if(!pending) return;
    const {layer, before} = pending;
    pending = undefined;
    const index = mediaState.resizableLayers.indexOf(layer);
    // Undo, mode cancellation or removal may have replaced the live preview already.
    if(index < 0 || before.shapeInfo.color === layer.shapeInfo.color &&
      before.shapeInfo.strokeWidth === layer.shapeInfo.strokeWidth) return;
    actions.pushToHistory({
      path: ['resizableLayers', index],
      oldValue: before,
      newValue: snapshot(layer),
      findBy: {id: layer.id}
    });
  };

  const begin = () => {
    const layer = selected();
    if(pending && pending.layer !== layer) finish();
    if(layer && !pending) pending = {layer, before: snapshot(layer)};
    return layer;
  };

  return {
    selected,
    size: () => {
      const layer = selected();
      const scale = strokeScale(layer);
      return scale ? layer.shapeInfo.strokeWidth * scale : editorState.currentBrush.size;
    },
    setColor(color: string) {
      finish();
      const layer = begin();
      if(layer) layer.shapeInfo.color = color;
      finish();
      return !!layer;
    },
    setSize(size: number) {
      const scale = strokeScale(selected());
      if(!scale) return false;
      const layer = begin();
      if(layer) batch(() => {
        const info = layer.shapeInfo;
        info.strokeWidth = size / scale;
        if(info.shape === 'arrow' && info.geometryVersion === 'desktop-arrow-v1') {
          info.height = getDesktopArrowFrameHeight(info.width, info.strokeWidth, info.bend);
        }
      });
      return !!layer;
    },
    finish
  };
}
