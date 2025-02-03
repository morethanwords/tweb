import {createMemo, useContext} from 'solid-js';

import MediaEditorContext from '../context';

export default function useNormalizePoint() {
  const context = useContext(MediaEditorContext);
  const [canvasSize] = context.canvasSize;
  const [finalTransform] = context.finalTransform;

  const size = createMemo(() => canvasSize().map((x) => x * context.pixelRatio));

  return (point: [number, number]) => {
    const transform = finalTransform();
    const [w, h] = size();

    point = point.map((x) => x * context.pixelRatio) as [number, number];

    point = [
      (point[0] - transform.translation[0] - w / 2) / transform.scale,
      (point[1] - transform.translation[1] - h / 2) / transform.scale
    ];
    const r = [Math.sin(transform.rotation), Math.cos(transform.rotation)];
    point = [point[0] * r[1] + point[1] * r[0], point[1] * r[1] - point[0] * r[0]];
    return point;
  };
}
