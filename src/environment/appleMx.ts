let IS_APPLE_MX = false;

try {
  // Awesome detect from https://stackoverflow.com/a/65412357
  const ctx = document.createElement('canvas').getContext('webgl');
  const extension = ctx.getExtension('WEBGL_debug_renderer_info');
  const renderer: string = extension && ctx.getParameter(extension.UNMASKED_RENDERER_WEBGL) || '';
  if((renderer.match(/Apple/) && !renderer.match(/Apple GPU/)) ||
    ctx.getSupportedExtensions().indexOf('WEBGL_compressed_texture_s3tc_srgb') === -1) {
    IS_APPLE_MX = true;
  }
} catch(err) {

}

export default IS_APPLE_MX;
