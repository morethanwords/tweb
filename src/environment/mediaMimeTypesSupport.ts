import IS_MOV_SUPPORTED from "./movSupport";
import IS_WEBP_SUPPORTED from "./webpSupport";

const MEDIA_MIME_TYPES_SUPPORTED = new Set([
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/bmp',
  'video/mp4',
  'video/webm'
]);

if(IS_MOV_SUPPORTED) {
  MEDIA_MIME_TYPES_SUPPORTED.add('video/quicktime');
}

if(IS_WEBP_SUPPORTED) {
  MEDIA_MIME_TYPES_SUPPORTED.add('image/webp');
}

export default MEDIA_MIME_TYPES_SUPPORTED;
