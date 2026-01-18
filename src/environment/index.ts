import IS_CALL_SUPPORTED from '@environment/callSupport';
import CAN_USE_TRANSFERABLES from '@environment/canUseTransferables';
import IS_CANVAS_FILTER_SUPPORTED from '@environment/canvasFilterSupport';
import IS_EMOJI_SUPPORTED from '@environment/emojiSupport';
import IS_GEOLOCATION_SUPPORTED from '@environment/geolocationSupport';
import IS_GROUP_CALL_SUPPORTED from '@environment/groupCallSupport';
import IMAGE_MIME_TYPES_SUPPORTED from '@environment/imageMimeTypesSupport';
import MEDIA_MIME_TYPES_SUPPORTED from '@environment/mediaMimeTypesSupport';
import IS_PARALLAX_SUPPORTED from '@environment/parallaxSupport';
import IS_SCREEN_SHARING_SUPPORTED from '@environment/screenSharingSupport';
import IS_TOUCH_SUPPORTED from '@environment/touchSupport';
import IS_VIBRATE_SUPPORTED from '@environment/vibrateSupport';
import VIDEO_MIME_TYPES_SUPPORTED from '@environment/videoMimeTypesSupport';
import IS_WEBP_SUPPORTED from '@environment/webpSupport';
import IS_WEBRTC_SUPPORTED from '@environment/webrtcSupport';
import * as userAgent from '@environment/userAgent';
import IS_OPUS_SUPPORTED from '@environment/opusSupport';
import IS_SHARED_WORKER_SUPPORTED from '@environment/sharedWorkerSupport';
import IS_APPLE_MX from '@environment/appleMx';
import IS_LIVE_STREAM_SUPPORTED from '@environment/liveStreamSupport';
import * as IS_VIDEO_SUPPORTED from '@environment/videoSupport';

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
