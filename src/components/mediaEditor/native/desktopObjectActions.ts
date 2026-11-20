import type {MediaEditorContextValue} from '@components/mediaEditor/context';
import type {NumberPair, ResizableLayer} from '@components/mediaEditor/types';
import {isDesktopShape} from '@components/mediaEditor/native/desktopShapeGeometry';
import {desktopEditorFonts} from '@components/mediaEditor/fonts';
import {STICKER_SIZE} from '@components/mediaEditor/finalRender/constants';

/** Called only by creation paths, with the profile captured before async work. */
export function desktopActionsForCreation(context: Pick<MediaEditorContextValue, 'isEditingForAvatar'>, mobile: boolean): Pick<ResizableLayer, 'desktopActions'> {
  return !context.isEditingForAvatar && !mobile ? {desktopActions: {version: 1}} : {};
}

/** Creation contract only: usable by guides before placement geometry is ready. */
export function isDesktopActionLayer(context: Pick<MediaEditorContextValue, 'isEditingForAvatar'>, layer: ResizableLayer): boolean {
  if(context.isEditingForAvatar) return false;
  // An unknown explicit contract must not be reinterpreted via a font/shape.
  if(layer.desktopActions && layer.desktopActions.version !== 1) return false;
  return layer.desktopActions?.version === 1 ||
    layer.type === 'shape' && isDesktopShape(layer.shapeInfo) ||
    layer.type === 'text' && desktopEditorFonts.some(({font}) => font === layer.textInfo?.font);
}

/** undefined = legacy contract; false = identified native object without a safe frame.
 * a532622 scene_item_base.cpp:559–571 uses inner frame sizes, NOT boundingRect's
 * handle margins or a rotated scene AABB. Resizing lives in layer.scale here,
 * whereas ItemBase bakes it into _horizontalSize / _verticalSize.
 */
export function desktopDuplicatePosition(context: Pick<MediaEditorContextValue, 'isEditingForAvatar' | 'editorState'>, layer: ResizableLayer): NumberPair | false | undefined {
  if(!isDesktopActionLayer(context, layer)) return;
  const {mediaSize, pixelRatio} = context.editorState;
  if(!mediaSize?.every(value => Number.isFinite(value) && value > 0) || !Number.isFinite(pixelRatio) || pixelRatio <= 0) return false;
  let width: number, height: number;
  if(layer.type === 'image') {
    width = layer.displayWidth;
    height = layer.displayHeight;
  } else if(layer.type === 'text') {
    // Text/sticker frames are CSS-local: ResizableContainer applies scale but
    // does not divide their frame by DPR. Their export drawers multiply by DPR.
    // Images/shapes instead divide source-sized frames by DPR in the preview.
    width = layer.textRenderingInfo?.width * pixelRatio;
    height = layer.textRenderingInfo?.height * pixelRatio;
  } else if(layer.type === 'shape') {
    width = layer.shapeInfo?.width;
    height = layer.shapeInfo?.height;
  } else {
    // ItemSticker::updatePixmap sets the aspect ratio from decoded content.
    // Web K's existing frame is 200 square. Non-square native frame parity is
    // not implemented; neither a document's pixels nor a rotated DOM box is it.
    if(!(layer.sticker?.w > 0) || layer.sticker.w !== layer.sticker.h) return false;
    width = height = STICKER_SIZE * pixelRatio;
  }
  if(![width, height, layer.scale].every(value => Number.isFinite(value) && value > 0) ||
    !layer.position.every(Number.isFinite)) return false;
  // EnsureScene (editor_paint.cpp:103–107) uses QRectF(QPointF(), imageSize).
  // Desktop's scene is source-top-left based; Web K stores source-centered
  // positions. Crop/view rotation changes neither source origin nor extents.
  // generateData() truncates absolute scene position before adding thirds.
  return [Math.trunc(layer.position[0] + mediaSize[0] / 2) - mediaSize[0] / 2 + Math.trunc(width * layer.scale / 3),
    Math.trunc(layer.position[1] + mediaSize[1] / 2) - mediaSize[1] / 2 + Math.trunc(height * layer.scale / 3)];
}
