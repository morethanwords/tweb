import clamp from '@helpers/number/clamp';
import type {NumberPair, ShapeLayerInfo} from '@components/mediaEditor/types';

export const desktopStarAspect = 1.809017 / 1.902113;

export function desktopArrowHeadSide(width: number, strokeWidth: number) {
  return width <= 0 ? 0 : clamp(Math.max(.16 * width, 2.5 * strokeWidth), 0, width / 3);
}

/** updateArrowFrame uses full frame width; arrowPoints uses inset width. */
export function getDesktopArrowFrameHeight(width: number, strokeWidth: number, bend = 0) {
  return 2 * (Math.abs(clamp(bend, -1, 1)) * .35 * width + desktopArrowHeadSide(width, strokeWidth) * .75 + strokeWidth);
}

export function isDesktopShape(info: ShapeLayerInfo) {
  return !!info && (info.shape === 'arrow' ? info.geometryVersion === 'desktop-arrow-v1' : info.geometryVersion === 'desktop-v1');
}

export function desktopArrowPoints(info: ShapeLayerInfo) {
  const width = Math.max(info.width - info.strokeWidth, 1);
  const side = desktopArrowHeadSide(width, info.strokeWidth);
  const middle = clamp(info.bend ?? 0, -1, 1) * .35 * width;
  const direction = info.shapeFlip ? -1 : 1;
  return {
    start: [-direction * width / 2, -middle] as NumberPair,
    control: [0, 3 * middle] as NumberPair,
    end: [direction * (width / 2 - side / 2), -middle] as NumberPair,
    side
  };
}

export function desktopArrowBendHandle(info: ShapeLayerInfo): NumberPair {
  const {start, end, control} = desktopArrowPoints(info);
  return [(start[0] + end[0]) / 4 + control[0] / 2, (start[1] + end[1]) / 4 + control[1] / 2];
}

export function setDesktopArrowBend(info: ShapeLayerInfo, bend: number) {
  info.bend = clamp(bend, -1, 1);
  info.height = getDesktopArrowFrameHeight(info.width, info.strokeWidth, info.bend);
}

/** ItemShape::updateBend: pointer y, not displacement from the initial handle. */
export function desktopArrowBendAt(info: ShapeLayerInfo, localY: number) {
  return clamp(localY / (.35 * Math.max(info.width - info.strokeWidth, 1)), -1, 1);
}
