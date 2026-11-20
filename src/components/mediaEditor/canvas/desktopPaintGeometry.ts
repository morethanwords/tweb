import type {MediaEditorContextValue} from '@components/mediaEditor/context';
import desktopCropSession from '@components/mediaEditor/native/desktopCropSession';
import {desktopCropOrientation, isDesktopCropGeometryActive} from '@components/mediaEditor/native/desktopCropGeometry';
import {desktopExpandedCropPlacement, type ExpandedCropRect} from '@components/mediaEditor/native/desktopExpandedCrop';
import {desktopPaintLayoutRound as round, type DesktopPaintCameraGeometry} from '@components/mediaEditor/native/desktopPaintCamera';
import {invertPreviewAffine, projectPreviewRect, type PreviewAffine} from '@components/mediaEditor/canvas/previewAffine';

export type PaintPreviewGeometry = {
  camera: DesktopPaintCameraGeometry;
  sourceFromLayer: PreviewAffine;
  sourceBounds: ExpandedCropRect;
};

/** Desktop photo_editor_content.cpp:261–334, editor_paint.cpp:432–487.
 * Immediate ordinary Paint layout only. Web policy: 5 CSS px margins, as the
 * existing Desktop crop viewport. No upscale. Rounding is Qt integer layout,
 * not DPR rounding, and ratioW/ratioH remain separate throughout.
 */
export default function desktopPaintGeometry(context: MediaEditorContextValue): PaintPreviewGeometry | undefined {
  const {editorState: state, mediaState: media} = context;
  if(context.isEditingForAvatar || !isDesktopCropGeometryActive(context) || !state.canvasSize || !state.mediaSize) return;
  const [width, height] = state.canvasSize.map(value => Math.floor(value));
  const [w, h] = state.mediaSize;
  if(width <= 10 || height <= 10) return;
  let descriptor: ReturnType<ReturnType<typeof desktopCropSession>['descriptor']>;
  let orientation: ReturnType<typeof desktopCropOrientation>;
  try {
    descriptor = desktopCropSession(context).descriptor();
    orientation = desktopCropOrientation(media.rotation, media.flip);
  } catch{
    return; // Invalid descriptors/unsupported orientation never acquire a new meaning.
  }
  if(!descriptor) return;
  const scene = desktopExpandedCropPlacement(descriptor.crop, state.mediaSize).scene;
  const {angle, flipped} = orientation;
  const swap = Math.abs(angle / 90) % 2 === 1;
  const scale = Math.min(1, ((swap ? height : width) - 10) / scene.width,
    ((swap ? width : height) - 10) / scene.height);
  const image = {x: round(-scene.width * scale / 2 - scene.x * scale),
    y: round(-scene.height * scale / 2 - scene.y * scale), width: round(w * scale), height: round(h * scale)};
  const canvas = {x: image.x + round(scene.x * scale), y: image.y + round(scene.y * scale),
    width: round(scene.width * scale), height: round(scene.height * scale)};
  if(image.width <= 0 || image.height <= 0 || canvas.width <= 0 || canvas.height <= 0) return;
  const c = Math.round(Math.cos(angle * Math.PI / 180)), s = Math.round(Math.sin(angle * Math.PI / 180));
  const sign = flipped ? -1 : 1;
  const layout: PreviewAffine = [sign * c, s, -sign * s, c, Math.floor(width / 2), Math.floor(height / 2)];
  const fitted = projectPreviewRect(layout, canvas);
  const imageDisplay = projectPreviewRect(layout, image);
  const rw = imageDisplay.width / (swap ? h : w) * sign;
  const rh = imageDisplay.height / (swap ? w : h);
  const sourceFromLayer: PreviewAffine = [media.flip[0], 0, 0, media.flip[1], w / 2, h / 2];
  return {
    camera: {viewport: fitted, outerViewport: {x: 0, y: 0, width, height}, scene,
      transform: [rw * c, rh * s, -rw * s, rh * c, 0, 0], direction: 'ltr'},
    sourceFromLayer,
    sourceBounds: projectPreviewRect(invertPreviewAffine(sourceFromLayer), scene)
  };
}
