import configureBoundTexture from '@components/mediaEditor/webgl/configureBoundTexture';

export type NativePhotoTarget = {texture: WebGLTexture; framebuffer: WebGLFramebuffer};

export function deleteNativePhotoTargets(gl: WebGLRenderingContext, targets: readonly NativePhotoTarget[]) {
  for(const target of targets) {
    if(target.texture) gl.deleteTexture(target.texture);
    if(target.framebuffer) gl.deleteFramebuffer(target.framebuffer);
  }
}

/** Shared RGBA8 attachment allocator. Transactional even for a partial pair. */
export function allocateNativePhotoTargets(gl: WebGLRenderingContext, width: number, height: number, count: number) {
  const targets: NativePhotoTarget[] = [];
  try {
    for(let i = 0; i < count; ++i) {
      const texture = gl.createTexture(), framebuffer = gl.createFramebuffer();
      targets.push({texture, framebuffer});
      if(!texture || !framebuffer) throw new Error('Native photo target allocation failed');
      gl.bindTexture(gl.TEXTURE_2D, texture);
      configureBoundTexture(gl);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      if(gl.getError() !== gl.NO_ERROR) throw new Error('Native photo storage allocation failed');
      gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
      if(gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) throw new Error('Native photo framebuffer incomplete');
    }
    return targets;
  } catch(error) {
    deleteNativePhotoTargets(gl, targets);
    throw error;
  }
}

/** Save only once per render, not per draw. Attribute pointers remain caller-owned,
 * as in nativeSharpen/selective blur. Never changes the scissor rectangle.
 * All sampled caller texture parameters and touched texture units are restored.
 */
export function withNativePhotoState<T>(gl: WebGLRenderingContext, source: WebGLTexture, units: number, run: () => T): T {
  const framebuffer = gl.getParameter(gl.FRAMEBUFFER_BINDING) as WebGLFramebuffer;
  const viewport = gl.getParameter(gl.VIEWPORT) as Int32Array;
  const program = gl.getParameter(gl.CURRENT_PROGRAM) as WebGLProgram;
  const active = gl.getParameter(gl.ACTIVE_TEXTURE) as number;
  const arrayBuffer = gl.getParameter(gl.ARRAY_BUFFER_BINDING) as WebGLBuffer;
  const colorMask = gl.getParameter(gl.COLOR_WRITEMASK) as boolean[];
  const caps = [gl.DITHER, gl.BLEND, gl.SCISSOR_TEST, gl.DEPTH_TEST, gl.STENCIL_TEST, gl.CULL_FACE];
  const enabled = caps.map(cap => gl.isEnabled(cap));
  const textures = Array.from({length: units}, (_, i) => {
    gl.activeTexture(gl.TEXTURE0 + i);
    return gl.getParameter(gl.TEXTURE_BINDING_2D) as WebGLTexture;
  });
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, source);
  const parameters = [gl.TEXTURE_MIN_FILTER, gl.TEXTURE_MAG_FILTER, gl.TEXTURE_WRAP_S, gl.TEXTURE_WRAP_T];
  const sampling = parameters.map(p => gl.getTexParameter(gl.TEXTURE_2D, p) as number);
  try {
    configureBoundTexture(gl);
    caps.forEach(cap => gl.disable(cap));
    gl.colorMask(true, true, true, true);
    return run();
  } finally {
    // The enclosed photo passes never enable these caps; disabled ones already
    // have their inherited state, including on an allocation failure.
    caps.forEach((cap, i) => { if(enabled[i]) gl.enable(cap); });
    gl.colorMask(colorMask[0], colorMask[1], colorMask[2], colorMask[3]);
    gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
    gl.viewport(viewport[0], viewport[1], viewport[2], viewport[3]);
    gl.useProgram(program);
    gl.bindBuffer(gl.ARRAY_BUFFER, arrayBuffer);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, source);
    parameters.forEach((p, i) => gl.texParameteri(gl.TEXTURE_2D, p, sampling[i]));
    textures.forEach((texture, i) => {
      gl.activeTexture(gl.TEXTURE0 + i);
      gl.bindTexture(gl.TEXTURE_2D, texture);
    });
    gl.activeTexture(active);
  }
}
