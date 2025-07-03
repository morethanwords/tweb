import {snapToViewport} from '../utils';
import {defaultCodec, highResCodec} from './calcCodecAndBitrate';

const SIDE_MAX = 2560;
const SIDE_MIN = 240;


type Args = {
  videoType: 'video' | 'gif';
  imageWidth: number;
  imageRatio: number;
  cropOffset: { width: number; height: number; };
  newRatio: number;
  scale: number;
  quality?: number;
};

export default function getResultSize({imageWidth, cropOffset, imageRatio, newRatio, scale, videoType, quality}: Args) {
  const [w] = snapToViewport(imageRatio, cropOffset.width, cropOffset.height);
  const [cw] = snapToViewport(newRatio, cropOffset.width, cropOffset.height);

  let scaledWidth = cw / (w * scale) * imageWidth,
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
