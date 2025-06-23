import {useMediaEditorContext} from '../context';
import {snapToViewport} from '../utils';

const SIDE_MAX = 2560;
const SIDE_MIN = 400;
export const VIDEO_WIDTH_MAX = 1280;
export const VIDEO_HEIGHT_MAX = 720;

export default function getResultSize(willResultInVideo: boolean) {
  const {editorState: {renderingPayload}, mediaState: {scale, currentImageRatio}} = useMediaEditorContext();

  const imageWidth = renderingPayload.media.width;

  const newRatio = currentImageRatio;

  let scaledWidth = imageWidth / scale,
    scaledHeight = scaledWidth / newRatio;

  if(Math.max(scaledWidth, scaledHeight) < SIDE_MIN) {
    [scaledWidth, scaledHeight] = snapToViewport(newRatio, SIDE_MIN, SIDE_MIN);
  }
  if(willResultInVideo && (scaledWidth > VIDEO_WIDTH_MAX || scaledHeight > VIDEO_HEIGHT_MAX)) {
    [scaledWidth, scaledHeight] = snapToViewport(newRatio, VIDEO_WIDTH_MAX, VIDEO_HEIGHT_MAX);
  }
  if(!willResultInVideo && Math.max(scaledWidth, scaledHeight) > SIDE_MAX) {
    [scaledWidth, scaledHeight] = snapToViewport(newRatio, SIDE_MAX, SIDE_MAX);
  }

  scaledWidth = Math.floor(scaledWidth);
  scaledHeight = Math.floor(scaledHeight);
  scaledWidth = scaledWidth % 2 == 0 ? scaledWidth : scaledWidth - 1;
  scaledHeight = scaledHeight % 2 == 0 ? scaledHeight : scaledHeight - 1;

  return [scaledWidth, scaledHeight];
}
