import {snapToViewport} from '@components/mediaEditor/utils';
import {defaultCodec, highResCodec} from '@components/mediaEditor/finalRender/calcCodecAndBitrate';

const SIDE_MAX = 2560;
const SIDE_MIN = 240;


type Args = {
  videoType: 'video' | 'gif';
  imageWidth: number;
  imageRatio: number;
  cropOffset: {width: number; height: number;};
  newRatio: number;
  scale: number;
  quality?: number;
  desktopCropSize?: readonly [number, number];
};

export default function getResultSize({imageWidth, cropOffset, imageRatio, newRatio, scale, videoType, quality, desktopCropSize}: Args) {
  let scaledWidth: number, scaledHeight: number;

  if(desktopCropSize) {
    if(videoType || quality || !Number.isFinite(desktopCropSize[0]) || desktopCropSize[0] <= 0 ||
      !Number.isFinite(desktopCropSize[1]) || desktopCropSize[1] <= 0) {
      throw new Error('Invalid expanded crop output policy');
    }
    // Web v1 client policy, not Desktop pixel parity: keep the existing
    // 240…2560 long-side limits and floor-to-even output dimensions.
    [scaledWidth, scaledHeight] = desktopCropSize;
    newRatio = scaledWidth / scaledHeight;
  } else {
    const [w] = snapToViewport(imageRatio, cropOffset.width, cropOffset.height);
    const [cw] = snapToViewport(newRatio, cropOffset.width, cropOffset.height);
    scaledWidth = cw / (w * scale) * imageWidth;
    scaledHeight = scaledWidth / newRatio;
  }

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

  if(desktopCropSize && (scaledWidth < 2 || scaledHeight < 2)) {
    throw new Error('Expanded crop is too narrow for the Web v1 even-size output policy');
  }

  return [scaledWidth, scaledHeight];
}
