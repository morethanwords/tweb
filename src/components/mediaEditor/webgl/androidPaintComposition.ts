import type {AndroidShapeGeometry} from '@components/mediaEditor/native/androidShapeGeometry';
import type {AndroidShapeRGBA} from '@components/mediaEditor/webgl/androidShapeUniforms';
import {bindAndroidShapeUniforms, getAndroidShapeUniforms, validateAndroidShapeUniforms} from '@components/mediaEditor/webgl/androidShapeUniforms';
import {androidShapesFragment, androidShapesVertex} from '@components/mediaEditor/webgl/androidShapesShader';
import {androidPaintTransferFragment} from '@components/mediaEditor/webgl/androidPaintCompositionShaders';
import {initShaderProgram} from '@components/mediaEditor/webgl/initShaderProgram';
import {initPositionBuffer, initTextureBuffer} from '@components/mediaEditor/webgl/initBuffers';
import configureBoundTexture from '@components/mediaEditor/webgl/configureBoundTexture';

/** Row zero is native painting y=0: logical top after native display projection.
 * Raw WebGL readPixels still starts at framebuffer bottom. No implicit upload flip.
 */
export type AndroidPaintSource = {
  kind: 'straight-rgba8';
  orientation: 'native-painting-rows';
  texture: WebGLTexture;
  width: number;
  height: number;
};
export type AndroidPaintEraseMask = Omit<AndroidPaintSource, 'kind'> & {kind: 'alpha-mask-rgba8'};
export type AndroidPaintOperation =
  | {kind: 'shape-over'; shape: AndroidShapeGeometry; rgba: AndroidShapeRGBA}
  | {kind: 'native-erase'; mask: AndroidPaintEraseMask; alpha: number};

/** Android renderBlitShape: ColorUtils.setAlphaComponent(color,
 * (int)(Color.alpha(color) * previewOpacity)); NOT rounding to nearest byte. */
export function androidPaintPreviewAlpha(alphaByte: number, previewOpacity: number) {
  if(!Number.isInteger(alphaByte) || alphaByte < 0 || alphaByte > 255 || !Number.isFinite(previewOpacity) || previewOpacity < 0 || previewOpacity > 1) {
    throw new RangeError('Invalid Android preview alpha');
  }
  return Math.trunc(Math.fround(Math.fround(alphaByte) * Math.fround(previewOpacity))) / 255;
}

type Target = {source: AndroidPaintSource; framebuffer: WebGLFramebuffer};

/** Caller owns a dedicated WebGL1 context; state is clobbered.
 * Two owned straight RGBA8 targets, reused until dimensions change; no readbacks,
 * DOM, per-point allocations of GPU resources, or legacy persisted-field changes.
 * Source must belong to this context. Owned outputs are borrowed until resize,
 * disposal, or their next write (not durable history snapshots).
 * Native Painting.commitShapeInternal samples its attached target: undefined
 * feedback. We intentionally use distinct ping-pong textures, preserving the
 * defined source equations rather than that unsafe native implementation detail.
 */
export function createAndroidPaintComposition(gl: WebGLRenderingContext) {
  const programs: WebGLProgram[] = [];
  const buffers: WebGLBuffer[] = [];
  let targets: Target[] = [];
  let disposed = false;
  const release = (items: Target[]) => items.forEach(item => {
    gl.deleteFramebuffer(item.framebuffer);
    gl.deleteTexture(item.source.texture);
  });
  const dispose = () => {
    if(disposed) return;
    disposed = true;
    release(targets);
    targets = [];
    buffers.forEach(buffer => gl.deleteBuffer(buffer));
    programs.forEach(program => gl.deleteProgram(program));
  };
  try {
    const compile = (fragment: string) => {
      const program = initShaderProgram(gl, androidShapesVertex, fragment);
      if(!program) throw new Error('Android paint shader compilation failed');
      programs.push(program);
      return program;
    };
    const shapeProgram = compile(androidShapesFragment), transferProgram = compile(androidPaintTransferFragment);
    const position = initPositionBuffer(gl, 2, 2);
    if(!position) throw new Error('Android paint position allocation failed');
    buffers.push(position);
    const uv = initTextureBuffer(gl);
    if(!uv) throw new Error('Android paint UV allocation failed');
    buffers.push(uv);
    const transferNames = ['source', 'eraseMask', 'erasing', 'flipY', 'eraseAlpha'] as const;
    const locations = <T extends string>(program: WebGLProgram, names: readonly T[]) => Object.fromEntries(names.map(name => [name, gl.getUniformLocation(program, name)])) as Record<T, WebGLUniformLocation>;
    const shapeUniforms = {...getAndroidShapeUniforms(gl, shapeProgram), ...locations(shapeProgram, ['texture', 'clear', 'composite'] as const)};
    const transferUniforms = locations(transferProgram, transferNames);
    const attributes = programs.map(program => [gl.getAttribLocation(program, 'inPosition'), gl.getAttribLocation(program, 'inTexcoord')]);
    const limit = gl.getParameter(gl.MAX_TEXTURE_SIZE) as number;
    const viewportLimit = gl.getParameter(gl.MAX_VIEWPORT_DIMS) as Int32Array;
    const assertLive = () => { if(disposed) throw new Error('Android paint composition disposed'); };
    const dimensions = (width: number, height: number) => {
      if(!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0 || width > limit || height > limit || width > viewportLimit[0] || height > viewportLimit[1]) {
        throw new RangeError('Invalid Android paint dimensions');
      }
    };
    const sourceValid = (source: AndroidPaintSource | AndroidPaintEraseMask) => {
      dimensions(source.width, source.height);
      if(!source.texture || !gl.isTexture(source.texture) || source.orientation !== 'native-painting-rows') throw new RangeError('Invalid Android paint source orientation/texture');
    };
    const resize = (width: number, height: number) => {
      assertLive();
      dimensions(width, height);
      if(targets[0]?.source.width === width && targets[0]?.source.height === height) return;
      const next: Target[] = [];
      try {
        for(let i = 0; i < 2; ++i) {
          const texture = gl.createTexture();
          if(!texture) throw new Error('Android paint texture allocation failed');
          const framebuffer = gl.createFramebuffer();
          if(!framebuffer) {
            gl.deleteTexture(texture);
            throw new Error('Android paint framebuffer allocation failed');
          }
          next.push({source: {kind: 'straight-rgba8', orientation: 'native-painting-rows', texture, width, height}, framebuffer});
          gl.activeTexture(gl.TEXTURE0);
          gl.bindTexture(gl.TEXTURE_2D, texture);
          configureBoundTexture(gl);
          gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
          gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
          gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
          if(gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) throw new Error('Incomplete Android paint framebuffer');
        }
      } catch(error) {
        release(next);
        throw error;
      } finally {
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      }
      release(targets);
      targets = next;
    };
    const begin = (program: WebGLProgram, framebuffer: WebGLFramebuffer | null, width: number, height: number) => {
      gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
      gl.viewport(0, 0, width, height);
      [gl.BLEND, gl.DEPTH_TEST, gl.STENCIL_TEST, gl.CULL_FACE, gl.SCISSOR_TEST, gl.DITHER].forEach(flag => gl.disable(flag));
      gl.colorMask(true, true, true, true);
      gl.useProgram(program);
      const attrib = attributes[program === shapeProgram ? 0 : 1];
      buffers.forEach((buffer, i) => {
        gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
        gl.vertexAttribPointer(attrib[i], 2, gl.FLOAT, false, 0, 0);
        gl.enableVertexAttribArray(attrib[i]);
      });
    };
    const bind = (unit: number, texture: WebGLTexture) => {
      gl.activeTexture(gl.TEXTURE0 + unit);
      gl.bindTexture(gl.TEXTURE_2D, texture);
    };
    const copy = (source: AndroidPaintSource, target: Target) => {
      begin(transferProgram, target.framebuffer, source.width, source.height);
      bind(0, source.texture);
      bind(1, source.texture);
      gl.uniform1i(transferUniforms.source, 0);
      gl.uniform1i(transferUniforms.eraseMask, 1);
      gl.uniform1i(transferUniforms.erasing, 0);
      gl.uniform1i(transferUniforms.flipY, 0);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    };
    return {
      resize,
      /** Reset owned painting only; the adjusted source image is never attached. */
      clear(width: number, height: number): AndroidPaintSource {
        resize(width, height);
        begin(transferProgram, targets[0].framebuffer, width, height);
        gl.clearColor(0, 0, 0, 0);
        gl.clear(gl.COLOR_BUFFER_BIT);
        return {...targets[0].source};
      },
      /** Full pre-stroke copy, then borrow a distinct target for dirty stamp writes.
       * Repeated previews always start from committed, not the previous preview. */
      stampTarget(source: AndroidPaintSource): Target {
        assertLive();
        sourceValid(source);
        resize(source.width, source.height);
        const target = targets.find(item => item.source.texture !== source.texture);
        if(!target) throw new Error('Android paint feedback forbidden');
        copy(source, target);
        return {source: {...target.source}, framebuffer: target.framebuffer};
      },
      apply(source: AndroidPaintSource, operation: AndroidPaintOperation): AndroidPaintSource {
        assertLive();
        sourceValid(source);
        if(source.kind !== 'straight-rgba8') throw new RangeError('Expected straight RGBA8 source');
        if(operation.kind === 'shape-over') {
          const {shape: s, rgba} = operation;
          validateAndroidShapeUniforms(s, rgba);
          if(s.paintingSize[0] !== source.width || s.paintingSize[1] !== source.height) throw new RangeError('Invalid Android shape composition dimensions');
        } else if(operation.kind === 'native-erase') {
          sourceValid(operation.mask);
          if(operation.mask.kind !== 'alpha-mask-rgba8' || operation.mask.width !== source.width || operation.mask.height !== source.height ||
            !Number.isFinite(operation.alpha) || operation.alpha < 0 || operation.alpha > 1) throw new RangeError('Invalid native eraser uniforms');
        } else throw new RangeError('Unknown Android paint operation');
        // A source borrowed from us cannot survive a resize. Reject before freeing it.
        if(targets.some(item => item.source.texture === source.texture) && (targets[0].source.width !== source.width || targets[0].source.height !== source.height)) throw new RangeError('Owned source dimensions changed');
        if(operation.kind === 'native-erase' && targets.some(item => item.source.texture === operation.mask.texture) &&
          (targets[0].source.width !== source.width || targets[0].source.height !== source.height)) throw new RangeError('Owned mask dimensions changed');
        resize(source.width, source.height);
        const target = targets.find(item => item.source.texture !== source.texture && (operation.kind !== 'native-erase' || item.source.texture !== operation.mask.texture));
        if(!target) throw new Error('Android paint feedback forbidden: no distinct target');
        const program = operation.kind === 'shape-over' ? shapeProgram : transferProgram;
        begin(program, target.framebuffer, source.width, source.height);
        bind(0, source.texture);
        // Bind both units away from the attachment, even when the shader ignores unit 1.
        bind(1, operation.kind === 'native-erase' ? operation.mask.texture : source.texture);
        if(operation.kind === 'shape-over') {
          const {shape: s, rgba} = operation, u = shapeUniforms;
          gl.uniform1i(u.texture, 0);
          bindAndroidShapeUniforms(gl, u, s, rgba);
          gl.uniform1i(u.clear, 0);
          gl.uniform1i(u.composite, 1);
        } else {
          gl.uniform1i(transferUniforms.source, 0);
          gl.uniform1i(transferUniforms.eraseMask, 1);
          gl.uniform1i(transferUniforms.erasing, 1);
          gl.uniform1i(transferUniforms.flipY, 0);
          gl.uniform1f(transferUniforms.eraseAlpha, operation.alpha);
        }
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        return {...target.source};
      },
      /** Straight-alpha default framebuffer only: premultipliedAlpha:false.
       * Native display inversion makes logical top-left sample storage row j.
       * No Canvas2D bridge/readback. Target drawing-buffer dimensions must match.
       */
      present(source: AndroidPaintSource, target: {kind: 'straight-canvas'; orientation: 'logical-top-left'}) {
        assertLive();
        sourceValid(source);
        const contextAttributes = gl.getContextAttributes();
        if(source.kind !== 'straight-rgba8' || target.kind !== 'straight-canvas' || target.orientation !== 'logical-top-left' ||
          gl.drawingBufferWidth !== source.width || gl.drawingBufferHeight !== source.height || contextAttributes?.alpha !== true || contextAttributes.premultipliedAlpha !== false) {
          throw new RangeError('Expected matching straight-alpha presentation canvas');
        }
        begin(transferProgram, null, source.width, source.height);
        bind(0, source.texture);
        bind(1, source.texture);
        gl.uniform1i(transferUniforms.source, 0);
        gl.uniform1i(transferUniforms.eraseMask, 1);
        gl.uniform1i(transferUniforms.erasing, 0);
        gl.uniform1i(transferUniforms.flipY, 1);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      },
      dispose
    };
  } catch(error) {
    dispose();
    throw error;
  }
}
