import {initPositionBuffer} from '@components/mediaEditor/webgl/initBuffers';
import {initShaderProgram} from '@components/mediaEditor/webgl/initShaderProgram';
import {nativeGaussianFragment, nativeGaussianVertex, nativeSelectiveMixFragment, nativeSelectiveMixVertex} from '@components/mediaEditor/webgl/nativeSelectiveBlurShaders';
import type {MediaType} from '@components/mediaEditor/types';
import {allocateNativePhotoTargets, deleteNativePhotoTargets, withNativePhotoState} from '@components/mediaEditor/webgl/nativePhotoPass';

/** Native shader coordinates, NOT NativeAdjustments.blur. No saved-state adapter.
 * center Y is normalized by width with a (width-height)/2 offset, not by height.
 * angleRadians is PhotoFilterBlurControl's delivered angle (UI angle + PI/2).
 * excludeBlurSize is the shader's transition width, not an inner radius.
 */
export type NativeSelectiveBlurDescriptor = {
  mode: 'off' | 'radial' | 'linear';
  widthNormalizedCenter: readonly [number, number];
  excludeSize: number;
  excludeBlurSize: number;
  angleRadians: number;
};

type Target = {texture: WebGLTexture; framebuffer: WebGLFramebuffer};
export type NativeSelectiveBlurState = {
  resources?: {
    gaussian: WebGLProgram;
    mix: WebGLProgram;
    position: WebGLBuffer;
    vertical: Target;
    horizontal: Target;
    output: Target;
    width: number;
    height: number;
  };
  source?: WebGLTexture;
  revision?: number;
};

export function disposeNativeSelectiveBlur(gl: WebGLRenderingContext, state: NativeSelectiveBlurState) {
  const r = state.resources;
  if(r) {
    deleteNativePhotoTargets(gl, [r.vertical, r.horizontal, r.output]);
    gl.deleteBuffer(r.position);
    gl.deleteProgram(r.gaussian);
    gl.deleteProgram(r.mix);
  }
  state.resources = undefined;
  state.source = undefined;
  state.revision = undefined;
}

/** TEST-ONLY candidate for a future processing version. Input MUST be the final
 * tools RGBA8 result in UV row order. No tools, transforms, UI or policy inferred.
 * Android FilterShaders.drawBlurPass: V -> H -> mix, all source-sized RGBA8.
 * Caller increments revision whenever the tools texture's contents change.
 * Incoming tools sampling is temporarily LINEAR/CLAMP, then restored. Scissoring
 * is disabled for full-frame writes and its enable state restored; its box is
 * never changed. Attribute/buffer bindings remain owned by this stage's caller.
 * Off/video/original return the input texture without allocating or drawing.
 */
export function renderNativeSelectiveBlur(gl: WebGLRenderingContext, state: NativeSelectiveBlurState, input: {
  toolsResult: WebGLTexture;
  width: number;
  height: number;
  revision: number;
  mediaType: MediaType;
  original?: boolean;
}, descriptor: NativeSelectiveBlurDescriptor): WebGLTexture {
  if(input.mediaType === 'video' || input.original || descriptor.mode === 'off') return input.toolsResult;
  if(gl.isContextLost()) throw new Error('Selective blur context lost');
  const {width, height} = input;
  const dims = gl.getParameter(gl.MAX_VIEWPORT_DIMS) as Int32Array;
  const max = gl.getParameter(gl.MAX_TEXTURE_SIZE) as number;
  if(!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 ||
    width > Math.min(max, dims[0]) || height > Math.min(max, dims[1])) throw new RangeError('Selective blur dimensions unsupported');
  if(![...descriptor.widthNormalizedCenter, descriptor.excludeSize, descriptor.excludeBlurSize, descriptor.angleRadians].every(Number.isFinite) ||
    descriptor.excludeBlurSize <= 0) throw new RangeError('Invalid native selective blur descriptor');

  return withNativePhotoState(gl, input.toolsResult, 2, () => {
    if(state.resources && (state.resources.width !== width || state.resources.height !== height)) disposeNativeSelectiveBlur(gl, state);
    if(!state.resources) {
      const programs: WebGLProgram[] = [];
      let targets: Target[] = [];
      let position: WebGLBuffer;
      try {
        const gaussian = initShaderProgram(gl, nativeGaussianVertex, nativeGaussianFragment);
        if(!gaussian) throw new Error('Selective Gaussian shader failed');
        programs.push(gaussian);
        const mix = initShaderProgram(gl, nativeSelectiveMixVertex, nativeSelectiveMixFragment);
        if(!mix) throw new Error('Selective mix shader failed');
        programs.push(mix);
        position = initPositionBuffer(gl, 1, 1);
        if(!position) throw new Error('Selective blur buffer allocation failed');
        targets = allocateNativePhotoTargets(gl, width, height, 3);
        state.resources = {gaussian, mix, position, vertical: targets[0], horizontal: targets[1], output: targets[2], width, height};
      } catch(error) {
        deleteNativePhotoTargets(gl, targets);
        programs.forEach(p => gl.deleteProgram(p));
        if(position) gl.deleteBuffer(position);
        throw error;
      }
    }
    const r = state.resources;
    gl.viewport(0, 0, width, height);
    const use = (p: WebGLProgram) => {
      gl.useProgram(p);
      gl.bindBuffer(gl.ARRAY_BUFFER, r.position);
      const attribute = gl.getAttribLocation(p, 'position');
      gl.vertexAttribPointer(attribute, 2, gl.FLOAT, false, 0, 0);
      gl.enableVertexAttribArray(attribute);
    };
    if(state.source !== input.toolsResult || state.revision !== input.revision) {
      state.source = undefined;
      use(r.gaussian);
      gl.uniform1i(gl.getUniformLocation(r.gaussian, 'source'), 0);
      for(const [target, source, dx, dy] of [
        [r.vertical, input.toolsResult, 0, 1 / height],
        [r.horizontal, r.vertical.texture, 1 / width, 0]
      ] as const) {
        gl.bindFramebuffer(gl.FRAMEBUFFER, target.framebuffer);
        gl.bindTexture(gl.TEXTURE_2D, source);
        gl.uniform2f(gl.getUniformLocation(r.gaussian, 'stepOffset'), dx, dy);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      }
      state.source = input.toolsResult;
      state.revision = input.revision;
    }
    use(r.mix);
    gl.bindFramebuffer(gl.FRAMEBUFFER, r.output.framebuffer);
    gl.bindTexture(gl.TEXTURE_2D, input.toolsResult);
    gl.uniform1i(gl.getUniformLocation(r.mix, 'source'), 0);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, r.horizontal.texture);
    gl.uniform1i(gl.getUniformLocation(r.mix, 'blurred'), 1);
    gl.uniform1i(gl.getUniformLocation(r.mix, 'linear'), descriptor.mode === 'linear' ? 1 : 0);
    gl.uniform2f(gl.getUniformLocation(r.mix, 'excludePoint'), ...descriptor.widthNormalizedCenter);
    gl.uniform1f(gl.getUniformLocation(r.mix, 'excludeSize'), descriptor.excludeSize);
    gl.uniform1f(gl.getUniformLocation(r.mix, 'excludeBlurSize'), descriptor.excludeBlurSize);
    gl.uniform1f(gl.getUniformLocation(r.mix, 'aspectRatio'), height / width);
    gl.uniform1f(gl.getUniformLocation(r.mix, 'angle'), descriptor.angleRadians);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    return r.output.texture;
  });
}
