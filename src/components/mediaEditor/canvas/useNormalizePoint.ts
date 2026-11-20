import {createMemo} from 'solid-js';

import {useMediaEditorContext} from '@components/mediaEditor/context';
import {NumberPair} from '@components/mediaEditor/types';
import invertCanvasTransform from '@components/mediaEditor/canvas/invertCanvasTransform';
import {mapPreviewAffine} from '@components/mediaEditor/canvas/previewAffine';


export default function useNormalizePoint() {
  const {editorState} = useMediaEditorContext();

  const size = createMemo(() => editorState.canvasSize.map((x) => x * editorState.pixelRatio));

  return (point: NumberPair) => {
    if(editorState.paintPreviewAffine) return mapPreviewAffine(editorState.paintPreviewAffine.inverse, point);
    const transform = editorState.finalTransform;
    const [w, h] = size();

    return invertCanvasTransform([
      point[0] * editorState.pixelRatio - w / 2,
      point[1] * editorState.pixelRatio - h / 2
    ], transform);
  };
}
