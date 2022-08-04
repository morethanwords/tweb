import IMAGE_MIME_TYPES_SUPPORTED from './imageMimeTypesSupport';
import VIDEO_MIME_TYPES_SUPPORTED from './videoMimeTypesSupport';

const arr = [...IMAGE_MIME_TYPES_SUPPORTED].concat([...VIDEO_MIME_TYPES_SUPPORTED]);

const MEDIA_MIME_TYPES_SUPPORTED = new Set(arr);

export default MEDIA_MIME_TYPES_SUPPORTED;
