import {unwrap} from 'solid-js/store';

import {FinalTransform} from '../canvas/useFinalTransform';
import {MediaEditorContextValue} from '../context';
import {NumberPair} from '../types';

export type ScaledLayersAndLines = ReturnType<typeof getScaledLayersAndLines>;

export default function getScaledLayersAndLines(
  context: MediaEditorContextValue,
  finalTransform: FinalTransform,
  width: number,
  height: number
) {
  const {mediaState: {resizableLayers, brushDrawnLines}, editorState: {pixelRatio}} = context;

  function processPoint(point: NumberPair) {
    const r = [Math.sin(-finalTransform.rotation), Math.cos(-finalTransform.rotation)];
    point = [point[0] * r[1] + point[1] * r[0], point[1] * r[1] - point[0] * r[0]];
    point = [
      point[0] * finalTransform.scale + width / 2 + finalTransform.translation[0],
      point[1] * finalTransform.scale + height / 2 + finalTransform.translation[1]
    ];
    return point;
  }

  const scaledLines = brushDrawnLines.map(({size, points, ...line}) => ({
    ...line,
    size: size * finalTransform.scale,
    points: points.map(processPoint)
  }));
  const scaledLayers = resizableLayers.map((layerStore) => {
    const layer = {...unwrap(layerStore)};

    layer.position = processPoint(layer.position);
    layer.rotation += finalTransform.rotation;
    layer.scale *= finalTransform.scale;

    if(layer.textInfo) {
      layer.textInfo = {...layer.textInfo};
      layer.textInfo.size *= layer.scale * pixelRatio;
    }
    return layer;
  });

  return {scaledLines, scaledLayers};
}
