import type {MediaEditorContextValue} from '@components/mediaEditor/context';
import desktopCropSession from '@components/mediaEditor/native/desktopCropSession';
import {desktopExpandedCropPlacement, type ExpandedCropRect} from '@components/mediaEditor/native/desktopExpandedCrop';
import {projectPreviewRect} from '@components/mediaEditor/canvas/previewAffine';

/** Scene::canvasRect is source union crop, not the widget viewport. Project
 * that source-space rectangle with the SAME source-centred affine used by
 * useProcessPoint(false). Quarter turns only permute/reverse scene axes, so
 * snapping their AABBs remains equivalent (including 12/currentZoom).
 * Arbitrary turns need oblique guide segments and scene-space drag inversion.
 * Flips are unsupported: useProcessPoint currently does not reflect layers.
 */
export default function desktopGuideCanvas(context: MediaEditorContextValue): ExpandedCropRect | undefined {
  const {editorState, mediaState} = context;
  if(!Object.prototype.hasOwnProperty.call(mediaState, 'desktopExpandedCrop') &&
    (mediaState.scale !== 1 || mediaState.translation.some(value => value !== 0))) return;
  const {finalTransform: transform, mediaSize: size, canvasSize: viewport, pixelRatio: ratio} = editorState;
  const turns = transform.rotation / (Math.PI / 2);
  if(!size || !viewport || !Number.isFinite(turns) || Math.abs(turns - Math.round(turns)) > 1e-8 ||
    transform.flip.some(value => value !== 1)) return;
  const zoom = transform.scale / ratio;
  if(![...size, ...viewport, ratio, zoom].every(value => Number.isFinite(value) && value > 0) ||
    !transform.translation.every(Number.isFinite)) return;
  let scene: ExpandedCropRect;
  try {
    const descriptor = desktopCropSession(context).descriptor();
    if(!descriptor) return;
    scene = desktopExpandedCropPlacement(descriptor.crop, size).scene;
  } catch{
    return; // Unknown/invalid descriptors never acquire a new interpretation.
  }
  // Keep all supported-case guards above: flips/arbitrary turns still fall back
  // as a whole branch, not a mixture of scalar and affine guide contracts.
  const preview = editorState.paintPreviewAffine;
  if(preview) {
    const m = preview.forward;
    if(!(Math.abs(m[1]) < 1e-8 && Math.abs(m[2]) < 1e-8 || Math.abs(m[0]) < 1e-8 && Math.abs(m[3]) < 1e-8)) return;
    return projectPreviewRect(m, {
      x: scene.x - size[0] / 2, y: scene.y - size[1] / 2, width: scene.width, height: scene.height
    });
  }
  const angle = Math.round(turns) * Math.PI / 2;
  const cos = Math.round(Math.cos(angle)), sin = Math.round(Math.sin(angle));
  const points = [[scene.x, scene.y], [scene.x + scene.width, scene.y],
    [scene.x, scene.y + scene.height], [scene.x + scene.width, scene.y + scene.height]].map(([x, y]) => {
    x -= size[0] / 2;
    y -= size[1] / 2;
    return [(x * cos - y * sin) * zoom + viewport[0] / 2 + transform.translation[0] / ratio,
      (x * sin + y * cos) * zoom + viewport[1] / 2 + transform.translation[1] / ratio];
  });
  const x = Math.min(...points.map(point => point[0])), y = Math.min(...points.map(point => point[1]));
  return {x, y, width: Math.max(...points.map(point => point[0])) - x, height: Math.max(...points.map(point => point[1])) - y};
}
