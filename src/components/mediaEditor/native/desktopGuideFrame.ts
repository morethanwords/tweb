import type {MediaEditorContextValue} from '@components/mediaEditor/context';
import type {ResizableLayer} from '@components/mediaEditor/types';
import {isDesktopActionLayer} from '@components/mediaEditor/native/desktopObjectActions';
import {STICKER_SIZE} from '@components/mediaEditor/finalRender/constants';
import {previewLayerMatrix, projectPreviewRect} from '@components/mediaEditor/canvas/previewAffine';

/** Visible scene AABB, without handle margins or a layout read. Unsupported
 * paths deliberately retain the old drag contract (not a selection-frame guess).
 */
export default function desktopGuideFrame(context: MediaEditorContextValue, layer: ResizableLayer, rotation: number, scale: number) {
  if(!isDesktopActionLayer(context, layer)) return;
  const ratio = context.editorState.pixelRatio;
  let width: number, height: number;
  if(layer.type === 'shape') {
    const info = layer.shapeInfo;
    // ItemShape::visibleRect is shapePath().boundingRect() + half stroke.
    // Circle/rounded rectangle paths span shapeRect. Arrow/star/bubble need
    // path extrema, not previewBounds (which is a selection frame).
    if(info?.geometryVersion !== 'desktop-v1' || !['circle', 'rectangle'].includes(info.shape)) return;
    width = (Math.max(info.width - info.strokeWidth, 1) + info.strokeWidth) / ratio;
    height = (Math.max(info.height - info.strokeWidth, 1) + info.strokeWidth) / ratio;
  } else if(layer.type === 'image') {
    width = layer.displayWidth / ratio;
    height = layer.displayHeight / ratio;
  } else if(layer.type === 'text') {
    // The existing text rendering cache is in CSS pixels, including padding.
    width = layer.textRenderingInfo?.width;
    height = layer.textRenderingInfo?.height;
  } else {
    if(!(layer.sticker?.w > 0) || layer.sticker.w !== layer.sticker.h) return;
    width = height = STICKER_SIZE;
  }
  const zoom = context.editorState.finalTransform.scale / ratio;
  if(![width, height, scale, zoom].every(value => Number.isFinite(value) && value > 0) || !Number.isFinite(rotation)) return;
  const preview = context.editorState.paintPreviewAffine;
  if(preview) {
    const bounds = projectPreviewRect(previewLayerMatrix(preview.forward, [0, 0], layer.rotation, layer.scale, ratio),
      {x: -width / 2, y: -height / 2, width, height});
    return {halfWidth: bounds.width / 2, halfHeight: bounds.height / 2, zoom: 1};
  }
  const cos = Math.abs(Math.cos(rotation)), sin = Math.abs(Math.sin(rotation));
  return {
    halfWidth: (cos * width + sin * height) * scale / 2,
    halfHeight: (sin * width + cos * height) * scale / 2,
    zoom
  };
}
