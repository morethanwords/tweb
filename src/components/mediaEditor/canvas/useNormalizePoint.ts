import {createMemo} from 'solid-js';

import {useMediaEditorContext} from '../context';
import {NumberPair} from '../types';


export default function useNormalizePoint() {
  const {editorState} = useMediaEditorContext();

  const size = createMemo(() => editorState.canvasSize.map((x) => x * editorState.pixelRatio));

  return (point: NumberPair) => {
    const transform = editorState.finalTransform;
    const [w, h] = size();

    point = point.map((x) => x * editorState.pixelRatio) as NumberPair;

    point = [
      (point[0] - transform.translation[0] - w / 2) / transform.scale,
      (point[1] - transform.translation[1] - h / 2) / transform.scale
    ];
    const r = [Math.sin(transform.rotation), Math.cos(transform.rotation)];
    point = [point[0] * r[1] + point[1] * r[0], point[1] * r[1] - point[0] * r[0]];
    return point;
  };
}
