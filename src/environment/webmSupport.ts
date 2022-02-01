import { IS_APPLE_MOBILE, IS_SAFARI } from "./userAgent";

const IS_WEBM_SUPPORTED = !!document.createElement('video').canPlayType('video/webm') && !IS_SAFARI && !IS_APPLE_MOBILE;

(window as any).IS_WEBM_SUPPORTED = IS_WEBM_SUPPORTED;
export default IS_WEBM_SUPPORTED;
