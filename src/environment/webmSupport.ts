import {IS_APPLE_MOBILE, IS_SAFARI} from './userAgent';

const IS_WEBM_SUPPORTED = !!document.createElement('video').canPlayType('video/webm') && !IS_SAFARI && !IS_APPLE_MOBILE;

export default IS_WEBM_SUPPORTED;
