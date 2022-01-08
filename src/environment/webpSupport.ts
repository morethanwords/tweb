const IS_WEBP_SUPPORTED = document.createElement('canvas').toDataURL('image/webp').startsWith('data:image/webp');

export default IS_WEBP_SUPPORTED;
