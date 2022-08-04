import {IS_APPLE_MOBILE, IS_SAFARI} from './userAgent';

// mov is not supported in Chrome on macOS
const IS_MOV_SUPPORTED = !!document.createElement('video').canPlayType('video/quicktime') || IS_SAFARI || IS_APPLE_MOBILE;

export default IS_MOV_SUPPORTED;
