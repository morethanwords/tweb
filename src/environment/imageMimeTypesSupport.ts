import IS_WEBP_SUPPORTED from './webpSupport';

const IMAGE_MIME_TYPES_SUPPORTED = new Set([
  'image/jpeg',
  'image/png',
  'image/bmp'
]);

if(IS_WEBP_SUPPORTED) {
  IMAGE_MIME_TYPES_SUPPORTED.add('image/webp');
}

export default IMAGE_MIME_TYPES_SUPPORTED;
