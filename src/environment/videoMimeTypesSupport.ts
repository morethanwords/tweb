import IS_MOV_SUPPORTED from './movSupport';

const VIDEO_MIME_TYPES_SUPPORTED = new Set([
  'image/gif', // have to display it as video
  'video/mp4',
  'video/webm'
]);

if(IS_MOV_SUPPORTED) {
  VIDEO_MIME_TYPES_SUPPORTED.add('video/quicktime');
}

export default VIDEO_MIME_TYPES_SUPPORTED;
