import {createMemo} from 'solid-js';

import {useMediaEditorContext} from '../context';
import {NumberPair} from '../types';

export default function useProcessPoint(densityAware = true) {
  const {editorState} = useMediaEditorContext();

  const size = createMemo(() => editorState.canvasSize.map((x) => x * editorState.pixelRatio));

  return (point: NumberPair) => {
    const [w, h] = size();

    const transform = editorState.finalTransform;
    const r = [Math.sin(-transform.rotation), Math.cos(-transform.rotation)];
    point = [point[0] * r[1] + point[1] * r[0], point[1] * r[1] - point[0] * r[0]];
    point = [
      (point[0] * transform.scale + w / 2 + transform.translation[0]) / (densityAware ? 1 : editorState.pixelRatio),
      (point[1] * transform.scale + h / 2 + transform.translation[1]) / (densityAware ? 1 : editorState.pixelRatio)
    ];
    return point;
  };
}
