import {snapToViewport} from '../utils';
import {defaultCodec, highResCodec} from './calcCodecAndBitrate';

const SIDE_MAX = 2560;
const SIDE_MIN = 400;

export const VIDEO_WIDTH_MAX = highResCodec.width;
export const VIDEO_HEIGHT_MAX = highResCodec.height;

type Args = {
  videoType: 'video' | 'gif';
  imageWidth: number;
  newRatio: number;
  scale: number;
  quality?: number;
};

export default function getResultSize({imageWidth, newRatio, scale, videoType, quality}: Args) {
  let scaledWidth = imageWidth / scale,
    scaledHeight = scaledWidth / newRatio;

  const willResultInVideo = !!videoType;

  if(Math.max(scaledWidth, scaledHeight) < SIDE_MIN) {
    [scaledWidth, scaledHeight] = snapToViewport(newRatio, SIDE_MIN, SIDE_MIN);
  }
  if(videoType === 'gif' && (scaledWidth > defaultCodec.width || scaledHeight > defaultCodec.height)) {
    [scaledWidth, scaledHeight] = snapToViewport(newRatio, defaultCodec.width, defaultCodec.height);
  }
  if(videoType === 'video' && (scaledWidth > highResCodec.width || scaledHeight > highResCodec.height)) {
    [scaledWidth, scaledHeight] = snapToViewport(newRatio, highResCodec.width, highResCodec.height);
  }
  if(!willResultInVideo && Math.max(scaledWidth, scaledHeight) > SIDE_MAX) {
    [scaledWidth, scaledHeight] = snapToViewport(newRatio, SIDE_MAX, SIDE_MAX);
  }

  if(quality) {
    scaledHeight = quality;
    scaledWidth = quality * newRatio;
  }

  scaledWidth = Math.floor(scaledWidth);
  scaledHeight = Math.floor(scaledHeight);
  scaledWidth = scaledWidth % 2 == 0 ? scaledWidth : scaledWidth - 1;
  scaledHeight = scaledHeight % 2 == 0 ? scaledHeight : scaledHeight - 1;

  return [scaledWidth, scaledHeight];
}
