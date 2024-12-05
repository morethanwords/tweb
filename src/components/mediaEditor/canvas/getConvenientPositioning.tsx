import {useContext} from 'solid-js';

import MediaEditorContext from '../context';
import {snapToViewport} from '../utils';

import {useCropOffset} from './useCropOffset';

type Options = {
  rotation: number;
  translation: [number, number];
  scale: number;
  extendCrop?: [[number, number], [number, number]];
};

export default function getConvenientPositioning({
  scale,
  translation,
  rotation,
  extendCrop = [
    [0, 0],
    [0, 0]
  ]
}: Options) {
  const context = useContext(MediaEditorContext);
  const [currentImageRatio] = context.currentImageRatio;
  const [imageSize] = context.imageSize;

  const cropOffset = useCropOffset();

  const [w, h] = imageSize();
  const [imageWidth, imageHeight] = snapToViewport(w / h, cropOffset().width, cropOffset().height);

  const imageLeftTop = [-imageWidth / 2, imageHeight / 2];

  const imagePoints = [
    [imageLeftTop[0], imageLeftTop[1]],
    [imageLeftTop[0] + imageWidth, imageLeftTop[1]],
    [imageLeftTop[0] + imageWidth, imageLeftTop[1] - imageHeight],
    [imageLeftTop[0], imageLeftTop[1] - imageHeight]
  ].map((point) => {
    const r = [Math.sin(rotation), Math.cos(rotation)];
    point = [point[0] * r[1] - point[1] * r[0], point[1] * r[1] + point[0] * r[0]].map((x) => x * scale);
    point = [point[0] + translation[0], point[1] + translation[1]];
    const r2 = [Math.sin(-rotation), Math.cos(-rotation)];
    point = [point[0] * r2[1] - point[1] * r2[0], point[1] * r2[1] + point[0] * r2[0]];
    return point;
  });

  const [cropWidth, cropHeight] = snapToViewport(currentImageRatio(), cropOffset().width, cropOffset().height);

  const cropLeftTop = [-cropWidth / 2, cropHeight / 2];
  const cropPoints = [
    [cropLeftTop[0] + extendCrop[0][0], cropLeftTop[1] + extendCrop[0][1]],
    [cropLeftTop[0] + cropWidth + extendCrop[1][0], cropLeftTop[1] + extendCrop[0][1]],
    [cropLeftTop[0] + cropWidth + extendCrop[1][0], cropLeftTop[1] - cropHeight + extendCrop[1][1]],
    [cropLeftTop[0] + extendCrop[0][0], cropLeftTop[1] - cropHeight + extendCrop[1][1]]
  ].map((point) => {
    const r = [Math.sin(-rotation), Math.cos(-rotation)];
    return [point[0] * r[1] - point[1] * r[0], point[1] * r[1] + point[0] * r[0]];
  });
  const cropPointsX = cropPoints.map((p) => p[0]);
  const cropPointsY = cropPoints.map((p) => p[1]);

  return {
    cropMinX: Math.min(...cropPointsX),
    cropMaxX: Math.max(...cropPointsX),
    cropMinY: Math.min(...cropPointsY),
    cropMaxY: Math.max(...cropPointsY),
    imageMinX: imagePoints[0][0],
    imageMaxX: imagePoints[2][0],
    imageMinY: imagePoints[2][1],
    imageMaxY: imagePoints[0][1]
  };
}
