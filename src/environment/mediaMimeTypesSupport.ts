import IMAGE_MIME_TYPES_SUPPORTED from '@environment/imageMimeTypesSupport';
import VIDEO_MIME_TYPES_SUPPORTED from '@environment/videoMimeTypesSupport';

const arr = [...IMAGE_MIME_TYPES_SUPPORTED].concat([...VIDEO_MIME_TYPES_SUPPORTED]);

const MEDIA_MIME_TYPES_SUPPORTED = new Set(arr);

export default MEDIA_MIME_TYPES_SUPPORTED;
