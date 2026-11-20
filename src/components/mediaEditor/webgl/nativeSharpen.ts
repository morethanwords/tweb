import {initPositionBuffer} from '@components/mediaEditor/webgl/initBuffers';
import {initShaderProgram} from '@components/mediaEditor/webgl/initShaderProgram';
import configureBoundTexture from '@components/mediaEditor/webgl/configureBoundTexture';
import {nativeSharpenFragmentSource, nativeSharpenVertexSource} from '@components/mediaEditor/webgl/shaderSources';

export type NativeSharpenState = {
  resources?: {
    program: WebGLProgram;
    position: WebGLBuffer;
    texture: WebGLTexture;
    framebuffer: WebGLFramebuffer;
    attributes: {position: number; uv: number};
    uniforms: {source: WebGLUniformLocation; size: WebGLUniformLocation; strength: WebGLUniformLocation};
    maxWidth: number;
    maxHeight: number;
  };
  width?: number;
  height?: number;
  source?: WebGLTexture;
  revision?: number;
  strength?: number;
};

export function nativeSharpenStrength(normalized: number) {
  return Math.fround(Math.fround(0.11) + Math.fround(Math.fround(normalized) * Math.fround(0.6)));
}

function createResources(gl: WebGLRenderingContext) {
  const program = initShaderProgram(gl, nativeSharpenVertexSource, nativeSharpenFragmentSource);
  const position = program && initPositionBuffer(gl, 1, 1);
  const texture = position && gl.createTexture();
  const framebuffer = texture && gl.createFramebuffer();
  if(!program || !position || !texture || !framebuffer) {
    if(program) gl.deleteProgram(program);
    if(position) gl.deleteBuffer(position);
    if(texture) gl.deleteTexture(texture);
    if(framebuffer) gl.deleteFramebuffer(framebuffer);
    throw new Error('Unable to allocate native sharpen resources');
  }
  gl.bindTexture(gl.TEXTURE_2D, texture);
  configureBoundTexture(gl);
  const viewport = gl.getParameter(gl.MAX_VIEWPORT_DIMS) as Int32Array;
  const maxTexture = gl.getParameter(gl.MAX_TEXTURE_SIZE) as number;
  return {
    program, position, texture, framebuffer,
    maxWidth: Math.min(maxTexture, viewport[0]),
    maxHeight: Math.min(maxTexture, viewport[1]),
    attributes: {position: gl.getAttribLocation(program, 'aPosition'), uv: gl.getAttribLocation(program, 'aUv')},
    uniforms: {
      source: gl.getUniformLocation(program, 'uSource'),
      size: gl.getUniformLocation(program, 'uSize'),
      strength: gl.getUniformLocation(program, 'uStrength')
    }
  };
}

/** Photo-only, source-space pass. No CPU readback. Context teardown owns resources.
 * Input is currently the loaded RGB source, NOT Android's quantized HSV/Enhance
 * output: this matches the sharpen stage, not the complete Android pipeline.
 */
export function renderNativeSharpen(gl: WebGLRenderingContext, state: NativeSharpenState, source: WebGLTexture,
  uv: WebGLBuffer, width: number, height: number, normalized: number, revision = 0) {
  const strength = nativeSharpenStrength(normalized);
  if(state.source === source && state.width === width && state.height === height && state.revision === revision && state.strength === strength) {
    return state.resources.texture;
  }
  gl.activeTexture(gl.TEXTURE0);
  const resources = state.resources ||= createResources(gl);
  if(!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || width > resources.maxWidth || height > resources.maxHeight) {
    throw new RangeError('Native sharpen source exceeds supported render dimensions');
  }
  const dither = gl.isEnabled(gl.DITHER);
  try {
    gl.bindFramebuffer(gl.FRAMEBUFFER, resources.framebuffer);
    if(state.width !== width || state.height !== height) {
      state.source = undefined;
      gl.bindTexture(gl.TEXTURE_2D, resources.texture);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      if(gl.getError() !== gl.NO_ERROR) throw new Error('Unable to allocate native sharpen target storage');
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, resources.texture, 0);
      if(gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) throw new Error('Incomplete native sharpen framebuffer');
    }
    gl.disable(gl.DITHER);
    gl.viewport(0, 0, width, height);
    gl.useProgram(resources.program);
    gl.bindBuffer(gl.ARRAY_BUFFER, resources.position);
    gl.vertexAttribPointer(resources.attributes.position, 2, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(resources.attributes.position);
    gl.bindBuffer(gl.ARRAY_BUFFER, uv);
    gl.vertexAttribPointer(resources.attributes.uv, 2, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(resources.attributes.uv);
    gl.bindTexture(gl.TEXTURE_2D, source);
    gl.uniform1i(resources.uniforms.source, 0);
    gl.uniform2f(resources.uniforms.size, width, height);
    gl.uniform1f(resources.uniforms.strength, strength);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    Object.assign(state, {source, width, height, revision, strength});
    return resources.texture;
  } finally {
    if(dither) gl.enable(gl.DITHER);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.activeTexture(gl.TEXTURE0);
  }
}
