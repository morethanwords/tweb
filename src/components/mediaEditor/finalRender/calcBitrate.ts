import {VIDEO_HEIGHT_MAX, VIDEO_WIDTH_MAX} from './getResultSize';

export const BITRATE_TARGET_FPS = 30;
const OPTIMAL_BITRATE = 8e6;

export default function calcBitrate(w: number, h: number, fps: typeof BITRATE_TARGET_FPS, quality: 1) {
  return w * h * fps * quality / (VIDEO_WIDTH_MAX * VIDEO_HEIGHT_MAX * BITRATE_TARGET_FPS) * OPTIMAL_BITRATE;
}
