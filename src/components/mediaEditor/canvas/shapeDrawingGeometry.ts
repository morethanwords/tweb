import type {EditorShape, NumberPair} from '@components/mediaEditor/types';
import {distance} from '@components/mediaEditor/utils';
import clamp from '@helpers/number/clamp';
import {desktopStarAspect, getDesktopArrowFrameHeight} from '@components/mediaEditor/native/desktopShapeGeometry';

/** Scene's threshold is measured after zoom, not in source-image pixels. */
export function desktopShapeDragStarted(start: NumberPair, end: NumberPair) {
  return distance(start, end) >= 4;
}

/** ItemBase::applyStretch / fitsMinimumSize, in source-image units. */
export function desktopShapeDraftFrame(shape: EditorShape, width: number, height: number, mediaSize: NumberPair, strokeWidth = 0, draft = true) {
  const side = Math.max(...mediaSize);
  const minimum = Math.max(Math.floor(side * .05), 1);
  const maximum = Math.max(Math.floor(side), 1);
  width = clamp(width, draft ? 1 : minimum, maximum);
  height = clamp(height, draft || shape === 'arrow' ? 1 : minimum, maximum);
  if(shape === 'arrow') height = shapeDrawingGeometry(shape, [0, 0], [width, 0], false, strokeWidth).height;
  return {width, height, fits: width >= minimum && (shape === 'arrow' || height >= minimum)};
}

/** Desktop Scene::updateShapeDrawing, in the drawing surface's (unrotated) CSS pixels. */
export default function shapeDrawingGeometry(shape: EditorShape, start: NumberPair, end: NumberPair, shift: boolean, strokeWidth: number) {
  let width = end[0] - start[0], height = end[1] - start[1];
  if(shape === 'arrow') {
    const length = Math.hypot(width, height);
    let rotation = Math.atan2(height, width);
    if(shift) {
      // Qt SafeRound rounds half steps away from zero, unlike Math.round for negatives.
      const steps = rotation / (Math.PI / 4);
      rotation = Math.sign(steps) * Math.round(Math.abs(steps)) * Math.PI / 4;
    }
    // ItemShape::updateArrowFrame: a straight arrow's frame follows its head and stroke.
    return {
      center: [(start[0] + end[0]) / 2, (start[1] + end[1]) / 2] as NumberPair,
      width: length,
      height: getDesktopArrowFrameHeight(length, strokeWidth),
      rotation
    };
  }
  if(shift) {
    // ItemShape::defaultAspectRatio; its star's native bounding box is not square.
    const ratio = shape === 'star' ? desktopStarAspect : 1;
    const side = Math.max(Math.abs(width), Math.abs(height) / ratio);
    width = (width < 0 ? -side : side);
    height = (height < 0 ? -side : side) * ratio;
  }
  return {
    center: [start[0] + width / 2, start[1] + height / 2] as NumberPair,
    width: Math.abs(width),
    height: Math.abs(height),
    rotation: 0
  };
}
