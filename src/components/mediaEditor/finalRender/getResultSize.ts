import {useContext} from 'solid-js';

import MediaEditorContext from '../context';
import {snapToViewport} from '../utils';

const SIDE_MAX = 2560;
const SIDE_MIN = 400;
const VIDEO_WIDTH_MAX = 1280;
const VIDEO_HEIGHT_MAX = 720;

export default function getResultSize(hasAnimatedStickers: boolean) {
  const context = useContext(MediaEditorContext);
  const [currentImageRatio] = context.currentImageRatio;
  const [scale] = context.scale;
  const [renderingPayload] = context.renderingPayload;

  const imageWidth = renderingPayload().image.width;

  const newRatio = currentImageRatio();

  let scaledWidth = imageWidth / scale(),
    scaledHeight = scaledWidth / newRatio;

  if(Math.max(scaledWidth, scaledHeight) < SIDE_MIN) {
    [scaledWidth, scaledHeight] = snapToViewport(newRatio, SIDE_MIN, SIDE_MIN);
  }
  if(hasAnimatedStickers && (scaledWidth > VIDEO_WIDTH_MAX || scaledHeight > VIDEO_HEIGHT_MAX)) {
    [scaledWidth, scaledHeight] = snapToViewport(newRatio, VIDEO_WIDTH_MAX, VIDEO_HEIGHT_MAX);
  }
  if(!hasAnimatedStickers && Math.max(scaledWidth, scaledHeight) > SIDE_MAX) {
    [scaledWidth, scaledHeight] = snapToViewport(newRatio, SIDE_MAX, SIDE_MAX);
  }

  scaledWidth = Math.floor(scaledWidth);
  scaledHeight = Math.floor(scaledHeight);
  scaledWidth = scaledWidth % 2 == 0 ? scaledWidth : scaledWidth - 1;
  scaledHeight = scaledHeight % 2 == 0 ? scaledHeight : scaledHeight - 1;

  return [scaledWidth, scaledHeight];
}
