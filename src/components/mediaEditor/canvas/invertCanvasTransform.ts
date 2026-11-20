import type {FinalTransform} from '@components/mediaEditor/canvas/useFinalTransform';
import type {NumberPair} from '@components/mediaEditor/types';

/** From canvas-centred physical pixels to source coordinates; flips belong to the media. */
export default function invertCanvasTransform(point: NumberPair, transform: FinalTransform): NumberPair {
  const x = (point[0] - transform.translation[0]) / transform.scale;
  const y = (point[1] - transform.translation[1]) / transform.scale;
  const sin = Math.sin(transform.rotation), cos = Math.cos(transform.rotation);
  return [x * cos + y * sin, y * cos - x * sin];
}
