import type {NumberPair} from '@components/mediaEditor/types';
import type {ShapeLayerInfo} from '@components/mediaEditor/types';
import {desktopShapeDraftFrame} from '@components/mediaEditor/canvas/shapeDrawingGeometry';
import {getDesktopArrowFrameHeight} from '@components/mediaEditor/native/desktopShapeGeometry';

/** Scene-local vector, undoing the layer's rotation and uniform display scale. */
export function shapeLocalVector(vector: NumberPair, rotation: number, scale: number): NumberPair {
  const cos = Math.cos(rotation), sin = Math.sin(rotation);
  return [(vector[0] * cos + vector[1] * sin) / scale, (vector[1] * cos - vector[0] * sin) / scale];
}

/** ItemShape::mouseMoveEvent Ctrl branch: independent frame, never generic scale. */
export function desktopShapeStretch(info: ShapeLayerInfo, local: NumberPair, mediaSize: NumberPair) {
  const frame = desktopShapeDraftFrame(info.shape, Math.abs(2 * local[0]), info.shape === 'arrow' ? info.height : Math.abs(2 * local[1]), mediaSize, info.strokeWidth, false);
  if(info.shape === 'arrow') frame.height = getDesktopArrowFrameHeight(frame.width, info.strokeWidth, info.bend);
  return frame;
}

/** Resize from the actual pointer press, not a rounded layout width or an ideal handle center. */
export default function layerResizeGeometry(initialVector: NumberPair, vector: NumberPair, initialScale: number, initialRotation: number, mediaRotation: number, shift: boolean) {
  const initialLength = Math.hypot(...initialVector);
  if(!initialLength || vector[0] === initialVector[0] && vector[1] === initialVector[1]) {
    return {scale: initialScale, rotation: initialRotation};
  }

  const angle = Math.atan2(
    initialVector[0] * vector[1] - initialVector[1] * vector[0],
    initialVector[0] * vector[0] + initialVector[1] * vector[1]
  );
  const rotation = initialRotation + angle;
  return {
    scale: shift ? initialScale : Math.max(0.05, initialScale * Math.hypot(...vector) / initialLength),
    rotation: shift ? Math.round((rotation + mediaRotation) / (Math.PI / 4)) * Math.PI / 4 - mediaRotation : rotation
  };
}
