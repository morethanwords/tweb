import IS_CALL_SUPPORTED from './callSupport';
import CAN_USE_TRANSFERABLES from './canUseTransferables';
import IS_CANVAS_FILTER_SUPPORTED from './canvasFilterSupport';
import IS_EMOJI_SUPPORTED from './emojiSupport';
import IS_GEOLOCATION_SUPPORTED from './geolocationSupport';
import IS_GROUP_CALL_SUPPORTED from './groupCallSupport';
import IMAGE_MIME_TYPES_SUPPORTED from './imageMimeTypesSupport';
import MEDIA_MIME_TYPES_SUPPORTED from './mediaMimeTypesSupport';
import IS_PARALLAX_SUPPORTED from './parallaxSupport';
import IS_SCREEN_SHARING_SUPPORTED from './screenSharingSupport';
import IS_TOUCH_SUPPORTED from './touchSupport';
import IS_VIBRATE_SUPPORTED from './vibrateSupport';
import VIDEO_MIME_TYPES_SUPPORTED from './videoMimeTypesSupport';
import IS_WEBP_SUPPORTED from './webpSupport';
import IS_WEBRTC_SUPPORTED from './webrtcSupport';
import * as userAgent from './userAgent';
import IS_OPUS_SUPPORTED from './opusSupport';
import IS_SHARED_WORKER_SUPPORTED from './sharedWorkerSupport';
import IS_APPLE_MX from './appleMx';
import IS_LIVE_STREAM_SUPPORTED from './liveStreamSupport';
import * as IS_VIDEO_SUPPORTED from './videoSupport';

const ENVIRONMENT = {
  CAN_USE_TRANSFERABLES,
  IS_APPLE_MX,
  IS_CALL_SUPPORTED,
  IS_CANVAS_FILTER_SUPPORTED,
  IS_EMOJI_SUPPORTED,
  IS_GEOLOCATION_SUPPORTED,
  IS_GROUP_CALL_SUPPORTED,
  IS_PARALLAX_SUPPORTED,
  IS_SCREEN_SHARING_SUPPORTED,
  IS_TOUCH_SUPPORTED,
  ...IS_VIDEO_SUPPORTED,
  IS_VIBRATE_SUPPORTED,
  IS_OPUS_SUPPORTED,
  IS_SHARED_WORKER_SUPPORTED,
  IS_WEBP_SUPPORTED,
  IS_WEBRTC_SUPPORTED,
  IS_LIVE_STREAM_SUPPORTED,
  IMAGE_MIME_TYPES_SUPPORTED,
  MEDIA_MIME_TYPES_SUPPORTED,
  VIDEO_MIME_TYPES_SUPPORTED,
  ...userAgent
};

export default ENVIRONMENT;
