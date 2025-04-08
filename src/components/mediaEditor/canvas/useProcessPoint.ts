import {createMemo, useContext} from 'solid-js';

import MediaEditorContext from '../context';

export default function useProcessPoint(densityAware = true) {
  const context = useContext(MediaEditorContext);
  const [canvasSize] = context.canvasSize;
  const [finalTransform] = context.finalTransform;

  const size = createMemo(() => canvasSize().map((x) => x * context.pixelRatio));

  return (point: [number, number]) => {
    const [w, h] = size();

    const transform = finalTransform();
    const r = [Math.sin(-transform.rotation), Math.cos(-transform.rotation)];
    point = [point[0] * r[1] + point[1] * r[0], point[1] * r[1] - point[0] * r[0]];
    point = [
      (point[0] * transform.scale + w / 2 + transform.translation[0]) / (densityAware ? 1 : context.pixelRatio),
      (point[1] * transform.scale + h / 2 + transform.translation[1]) / (densityAware ? 1 : context.pixelRatio)
    ];
    return point;
  };
}
