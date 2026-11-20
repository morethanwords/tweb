import type {MediaEditorContextValue} from '@components/mediaEditor/context';
import insertResizableLayer from '@components/mediaEditor/insertResizableLayer';
import type {EditorShape, ResizableLayer} from '@components/mediaEditor/types';
import invertCanvasTransform from '@components/mediaEditor/canvas/invertCanvasTransform';
import {desktopBrushColors, desktopBrushSize, snapshotDesktopBrushBank} from '@components/mediaEditor/native/desktopBrushState';
import {desktopStarAspect, getDesktopArrowFrameHeight} from '@components/mediaEditor/native/desktopShapeGeometry';
import {desktopActionsForCreation} from '@components/mediaEditor/native/desktopObjectActions';

export const editorShapes = ['circle', 'rectangle', 'star', 'bubble', 'arrow'] as const;

/** Disarming a pending tool is not an edit: preserve selection, brushes and history. */
export function cancelPendingEditorShape({editorState}: Pick<MediaEditorContextValue, 'editorState'>) {
  if(editorState.currentTab !== 'shapes' || !editorState.drawingShape) return false;
  editorState.drawingShape = undefined;
  editorState.currentTab = 'brush';
  return true;
}

/** Insert a local shape at the visible canvas centre. The shell owns the drawing mode. */
export function addEditorShape(context: MediaEditorContextValue, shape: EditorShape, filled: boolean, insert = true) {
  const {editorState} = context;
  const {mediaSize, canvasSize, finalTransform: transform, pixelRatio, currentBrush} = editorState;
  if(!mediaSize || !canvasSize || !(transform.scale > 0)) return;
  // Desktop borrows Pen for non-colour tools without changing the selected tool
  // or its saved settings. Android and the legacy avatar editor keep their brush.
  const desktop = editorState.resizeHandlesContainer?.closest('[data-editor-platform="desktop"]');
  const nativeGeometry = !!desktop && !context.isEditingForAvatar && shape !== 'arrow';
  const nativeArrow = !!desktop && !context.isEditingForAvatar && shape === 'arrow';
  const brush = desktop && (currentBrush.brush === 'blur' || currentBrush.brush === 'eraser') ?
    snapshotDesktopBrushBank(editorState).get('pen') ?? {color: desktopBrushColors.pen, size: desktopBrushSize} : currentBrush;

  // ShapeInput.start(): radius = image's short side / 5.
  const size = Math.min(...mediaSize) * 2 / 5;
  const strokeWidth = brush.size * pixelRatio / transform.scale;
  const layer: ResizableLayer = {
    id: context.resizableLayersSeed++,
    type: 'shape',
    ...desktopActionsForCreation(context, !desktop),
    position: invertCanvasTransform([0, 0], transform),
    rotation: -transform.rotation,
    scale: 1,
    shapeInfo: {
      shape,
      ...(nativeGeometry ? {geometryVersion: 'desktop-v1' as const} : {}),
      ...(nativeArrow ? {geometryVersion: 'desktop-arrow-v1' as const} : {}),
      filled,
      color: brush.color,
      width: size,
      height: nativeArrow ? getDesktopArrowFrameHeight(size, strokeWidth) : nativeGeometry && shape === 'star' ? size * desktopStarAspect : size,
      strokeWidth
    }
  };

  if(insert) insertResizableLayer(context, layer);
  return layer;
}
