import {IS_SAFARI, IS_APPLE_MOBILE} from './userAgent';

const video = document.createElement('video');
const IS_WEBM_SUPPORTED = !!video.canPlayType('video/webm') && !IS_SAFARI && !IS_APPLE_MOBILE;
// mov is not supported in Chrome on macOS
const IS_MOV_SUPPORTED = !!video.canPlayType('video/quicktime') || IS_SAFARI || IS_APPLE_MOBILE;
const IS_H265_SUPPORTED = !!video.canPlayType('video/mp4; codecs="hev1"');
const IS_AV1_SUPPORTED = !IS_SAFARI;

export {
  IS_WEBM_SUPPORTED,
  IS_MOV_SUPPORTED,
  IS_H265_SUPPORTED,
  IS_AV1_SUPPORTED
};
