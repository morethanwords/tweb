import {IS_MOV_SUPPORTED} from './videoSupport';

export type VIDEO_MIME_TYPE = 'image/gif' | 'video/mp4' | 'video/webm' | 'video/quicktime';
const VIDEO_MIME_TYPES_SUPPORTED: Set<VIDEO_MIME_TYPE> = new Set([
  'image/gif', // have to display it as video
  'video/mp4',
  'video/webm'
]);

if(IS_MOV_SUPPORTED) {
  VIDEO_MIME_TYPES_SUPPORTED.add('video/quicktime');
}

export default VIDEO_MIME_TYPES_SUPPORTED;
