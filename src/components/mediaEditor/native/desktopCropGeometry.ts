import {desktopExpandedCropPlacement, mapDesktopCropRect, validateDesktopExpandedCrop, type DesktopExpandedCrop, type ExpandedCropRect} from '@components/mediaEditor/native/desktopExpandedCrop';
import type {NumberPair} from '@components/mediaEditor/types';
import type {FinalTransform} from '@components/mediaEditor/canvas/useFinalTransform';
import type {MediaEditorContextValue} from '@components/mediaEditor/context';

export function hasDesktopCropDescriptor(context: Pick<MediaEditorContextValue, 'mediaState'>) {
  // hasOwnProperty itself is not a Solid store subscription. Read the value as
  // well so deletion by Reset/Cancel updates the wheel and controller branch.
  const descriptor = context.mediaState.desktopExpandedCrop;
  if(descriptor !== undefined) return true;
  return Object.prototype.hasOwnProperty.call(context.mediaState, 'desktopExpandedCrop');
}

export function isDesktopCropGeometryActive(context: Pick<MediaEditorContextValue, 'mediaState' | 'canUseDesktopExpandedCrop'>) {
  const turns = context.mediaState.rotation / (Math.PI / 2);
  return !!context.canUseDesktopExpandedCrop && (hasDesktopCropDescriptor(context) ||
    Number.isFinite(turns) && Math.abs(turns - Math.round(turns)) < 1e-8 &&
    context.mediaState.scale === 1 && context.mediaState.translation.every(value => value === 0));
}

/** Desktop a532622be61ffb811c34311583c9fd4828786833. The Web shader flips
 * source axes before rotation; Qt's crop mapper flips the output horizontal axis.
 */
export function desktopCropOrientation(rotation: number, flip: readonly number[]) {
  const turns = rotation / (Math.PI / 2);
  if(!Number.isFinite(turns) || Math.abs(turns - Math.round(turns)) > 1e-8 || flip.length !== 2 ||
    (flip[0] !== 1 && flip[0] !== -1) || (flip[1] !== 1 && flip[1] !== -1)) {
    throw new Error('Expanded crop requires quarter turns and discrete flips; reset the crop first');
  }
  const angle = Math.round(turns) * 90;
  return flip[0] < 0 ? (flip[1] < 0 ? {angle: angle + 180, flipped: false} : {angle: -angle, flipped: true}) :
    flip[1] < 0 ? {angle: 180 - angle, flipped: true} : {angle, flipped: false};
}

export function desktopCropGeometry(descriptor: DesktopExpandedCrop, sourceSize: readonly [number, number], rotation: number, flip: readonly number[]) {
  const validated = validateDesktopExpandedCrop(descriptor, sourceSize);
  const orientation = desktopCropOrientation(rotation, flip);
  return {...desktopExpandedCropPlacement(validated.crop, sourceSize, orientation.angle, orientation.flipped), orientation};
}

/** Same source-centred transform for preview, WebGL export, brush and layers.
 * Room is a view choice, never saved source geometry or an export multiplier.
 */
export function desktopCropView(descriptor: DesktopExpandedCrop, rotation: number, flip: NumberPair, viewport: ExpandedCropRect, room = 1, showSource = false) {
  const geometry = desktopCropGeometry(descriptor, descriptor.sourceSize, rotation, flip);
  const holder = geometry.size;
  const source = geometry.source;
  const left = showSource ? Math.min(0, source.x) : 0;
  const top = showSource ? Math.min(0, source.y) : 0;
  const width = (showSource ? Math.max(holder[0], source.x + source.width) : holder[0]) - left;
  const height = (showSource ? Math.max(holder[1], source.y + source.height) : holder[1]) - top;
  const scale = Math.min(viewport.width / width, viewport.height / height) * room;
  const x = viewport.x + (viewport.width - width * scale) / 2 - left * scale;
  const y = viewport.y + (viewport.height - height * scale) / 2 - top * scale;
  const transform: FinalTransform = {
    scale, rotation, flip: [flip[0], flip[1]],
    translation: [x + (source.x + source.width / 2) * scale, y + (source.y + source.height / 2) * scale],
    transparentOutside: true
  };
  return {
    geometry, transform,
    crop: {x, y, width: holder[0] * scale, height: holder[1] * scale},
    image: {x: x + source.x * scale, y: y + source.y * scale, width: source.width * scale, height: source.height * scale}
  };
}

export function fullDesktopCrop(sourceSize: readonly [number, number]): DesktopExpandedCrop {
  return {version: 'desktop-crop-v1', sourceSize: [sourceSize[0], sourceSize[1]],
    crop: {x: 0, y: 0, width: sourceSize[0], height: sourceSize[1]}, background: 'desktop-source-gradient-v1'};
}

export function desktopCropSourceRect(descriptor: DesktopExpandedCrop, rotation: number, flip: NumberPair) {
  const {angle, flipped} = desktopCropOrientation(rotation, flip);
  return mapDesktopCropRect(descriptor.crop, descriptor.sourceSize, angle, flipped);
}
