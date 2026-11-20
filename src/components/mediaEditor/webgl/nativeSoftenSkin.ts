import {initPositionBuffer, initTextureBuffer} from '@components/mediaEditor/webgl/initBuffers';
import {initShaderProgram} from '@components/mediaEditor/webgl/initShaderProgram';
import configureBoundTexture from '@components/mediaEditor/webgl/configureBoundTexture';
import {allocateNativePhotoTargets, deleteNativePhotoTargets, withNativePhotoState} from '@components/mediaEditor/webgl/nativePhotoPass';
import type {NativePhotoTarget} from '@components/mediaEditor/webgl/nativePhotoPass';
import {createSkinGaussian, createSkinToneLut, skinVertex, skinSingleVertex, skinOverlayFragment, skinHighpassFragment, skinBoostFragment, skinCompositeFragment} from '@components/mediaEditor/webgl/nativeSoftenSkinShaders';

export type NativeSkinStage = 'overlay' | 'vertical' | 'horizontal' | 'highpass' | 'boost' | 'composite';
export type NativeSoftenSkinInput = {
  version: 'android-photo-skin-v1';
  mediaType: 'image';
  /** Original bitmap upload, NOT sharpen/tools output. No upload/premultiplication
   * conversion here: components are used as stored, including hidden RGB.
   * Android Bitmap uploads may already be premultiplied; this pass does not undo
   * that. Row zero stays row zero, no CSS/DPR, image direction or display flip. */
  bitmap: WebGLTexture;
  width: number;
  height: number;
  revision: number;
  original?: boolean;
};
type Program = {
  program: WebGLProgram;
  position: number;
  uv: number;
  uniforms: Record<string, WebGLUniformLocation>;
};
type Resources = {
  programs: Program[];
  buffers: WebGLBuffer[];
  targets: NativePhotoTarget[];
  curve: WebGLTexture;
  width: number;
  height: number;
};
export type NativeSoftenSkinState = {
  resources?: Resources;
  source?: WebGLTexture;
  revision?: number;
};

function release(gl: WebGLRenderingContext, r: Resources) {
  deleteNativePhotoTargets(gl, r.targets);
  r.programs.forEach(p => gl.deleteProgram(p.program));
  r.buffers.forEach(b => gl.deleteBuffer(b));
  if(r.curve) gl.deleteTexture(r.curve);
}

export function disposeNativeSoftenSkin(gl: WebGLRenderingContext, state: NativeSoftenSkinState) {
  if(state.resources) release(gl, state.resources);
  state.resources = undefined;
  state.source = undefined;
  state.revision = undefined;
}

function allocate(gl: WebGLRenderingContext, width: number, height: number): Resources {
  const gaussian = createSkinGaussian(width);
  const r: Resources = {programs: [], buffers: [], targets: [], curve: undefined, width, height};
  try {
    for(const [vertex, fragment] of [
      [skinSingleVertex, skinOverlayFragment], [gaussian.vertex, gaussian.fragment],
      [skinVertex, skinHighpassFragment], [skinSingleVertex, skinBoostFragment], [skinVertex, skinCompositeFragment]
    ]) {
      const program = initShaderProgram(gl, vertex, fragment);
      if(!program) throw new Error('Native skin shader compilation failed');
      const p: Program = {program, position: -1, uv: -1, uniforms: {}};
      r.programs.push(p);
      p.position = gl.getAttribLocation(program, 'position');
      p.uv = gl.getAttribLocation(program, 'inputTexCoord');
      for(const name of ['sTexture', 'inputImageTexture2', 'inputImageTexture3', 'toneCurveTexture', 'mixturePercent', 'texelWidthOffset', 'texelHeightOffset']) {
        p.uniforms[name] = gl.getUniformLocation(program, name);
      }
    }
    const position = initPositionBuffer(gl, 2, 2);
    if(!position) throw new Error('Native skin position buffer allocation failed');
    r.buffers.push(position);
    // Source-exact vertexInvertBuffer, with the existing buffer allocator.
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]));
    const uv = initTextureBuffer(gl);
    if(!uv) throw new Error('Native skin UV buffer allocation failed');
    r.buffers.push(uv);
    r.targets = allocateNativePhotoTargets(gl, width, height, 3);
    r.curve = gl.createTexture();
    if(!r.curve) throw new Error('Native skin curve allocation failed');
    gl.bindTexture(gl.TEXTURE_2D, r.curve);
    configureBoundTexture(gl);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 256, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, createSkinToneLut());
    if(gl.getError() !== gl.NO_ERROR) throw new Error('Native skin curve upload failed');
    return r;
  } catch(error) {
    release(gl, r);
    throw error;
  }
}

/** ISOLATED candidate, no production wiring or saved-value migration.
 * Reference: Telegram Android 21f7d109da6ab3506c9e9577f98c6a38771ab335.
 * FilterGLThread.drawRunnable places skin BEFORE enhance -> photo sharpen ->
 * custom tools -> selective blur, never after tools. A future activation must
 * invalidate downstream HSV/histograms when this output changes. No face
 * landmarks or detector result enter this shader API. UI availability is a
 * separate, currently unknown web policy; no classifier is implied here.
 * FilterShaders.drawSkinSmoothPass: overlay -> V -> H -> highpass -> boost ->
 * composite. Three distinct ping-pong RGBA8 attachments; every draw quantizes.
 * Alpha: overlay/highpass/boost preserve source alpha, Gaussian blurs all RGBA,
 * composite FORCES 1 even for transparent input. No straight/premul conversion.
 * Preparation cached by source identity/revision; intensity only redraws final.
 * Optional observer is synchronous TEST instrumentation: borrowed target valid
 * only during callback; must not mutate GL state. Production never reads pixels.
 * Caller owns attribute pointers (same convention as other isolated passes).
 */
export function renderNativeSoftenSkin(gl: WebGLRenderingContext, state: NativeSoftenSkinState, input: NativeSoftenSkinInput, intensity: number,
  observe?: (stage: NativeSkinStage, target: NativePhotoTarget) => void): WebGLTexture {
  if(input.version !== 'android-photo-skin-v1' || input.mediaType !== 'image') throw new RangeError('Expected versioned Android photo skin input');
  if(!Number.isFinite(intensity) || intensity < 0 || intensity > 1) throw new RangeError('Invalid native skin intensity');
  if(input.original || intensity === 0) return input.bitmap;
  if(gl.isContextLost()) throw new Error('Native skin context lost');
  const {width, height} = input;
  const max = gl.getParameter(gl.MAX_TEXTURE_SIZE) as number, dims = gl.getParameter(gl.MAX_VIEWPORT_DIMS) as Int32Array;
  if(!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0 || width > Math.min(max, dims[0]) || height > Math.min(max, dims[1]) ||
    !Number.isSafeInteger(input.revision) || !input.bitmap || !gl.isTexture(input.bitmap)) throw new RangeError('Invalid native skin dimensions/source/revision');
  if(state.resources?.targets.some(t => t.texture === input.bitmap) || state.resources?.curve === input.bitmap) throw new RangeError('Native skin feedback forbidden');
  return withNativePhotoState(gl, input.bitmap, 3, () => {
    if(!state.resources || state.resources.width !== width || state.resources.height !== height) {
      const next = allocate(gl, width, height);
      // Allocate first: a failed resize leaves the old complete cache intact.
      if(state.resources) release(gl, state.resources);
      state.resources = next;
      state.source = undefined;
      state.revision = undefined;
    }
    const r = state.resources;
    gl.viewport(0, 0, width, height);
    const draw = (stage: NativeSkinStage, programIndex: number, targetIndex: number, textures: readonly WebGLTexture[], dx = 0, dy = 0) => {
      const p = r.programs[programIndex], target = r.targets[targetIndex];
      if(textures.includes(target.texture)) throw new Error('Native skin feedback forbidden');
      gl.bindFramebuffer(gl.FRAMEBUFFER, target.framebuffer);
      gl.useProgram(p.program);
      for(const [i, attribute] of [p.position, p.uv].entries()) {
        gl.bindBuffer(gl.ARRAY_BUFFER, r.buffers[i]);
        gl.vertexAttribPointer(attribute, 2, gl.FLOAT, false, 0, 0);
        gl.enableVertexAttribArray(attribute);
      }
      // Clear ALL touched sampling units away from the attachment, even when the
      // program has no sampler on that unit (also useful for feedback auditing).
      for(let i = 0; i < 3; ++i) {
        gl.activeTexture(gl.TEXTURE0 + i);
        gl.bindTexture(gl.TEXTURE_2D, textures[i] || textures[0]);
      }
      gl.uniform1i(p.uniforms.sTexture, 0);
      if(programIndex === 1) {
        gl.uniform1f(p.uniforms.texelWidthOffset, Math.fround(dx));
        gl.uniform1f(p.uniforms.texelHeightOffset, Math.fround(dy));
      } else if(programIndex === 2) gl.uniform1i(p.uniforms.inputImageTexture2, 1);
      else if(programIndex === 4) {
        gl.uniform1i(p.uniforms.inputImageTexture3, 1);
        gl.uniform1i(p.uniforms.toneCurveTexture, 2);
        gl.uniform1f(p.uniforms.mixturePercent, Math.fround(intensity));
      }
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      observe?.(stage, target);
    };
    if(state.source !== input.bitmap || state.revision !== input.revision) {
      state.source = undefined;
      draw('overlay', 0, 0, [input.bitmap]);
      draw('vertical', 1, 1, [r.targets[0].texture], 0, 1 / height);
      draw('horizontal', 1, 2, [r.targets[1].texture], 1 / width, 0);
      draw('highpass', 2, 1, [r.targets[0].texture, r.targets[2].texture]);
      draw('boost', 3, 2, [r.targets[1].texture]);
      state.source = input.bitmap;
      state.revision = input.revision;
    }
    draw('composite', 4, 1, [input.bitmap, r.targets[2].texture, r.curve]);
    return r.targets[1].texture;
  });
}
