import configureBoundTexture from '@components/mediaEditor/webgl/configureBoundTexture';
import {initShaderProgram} from '@components/mediaEditor/webgl/initShaderProgram';
import {androidBrushParameters, androidCompositeAlpha, AndroidStamp, AndroidStampBounds, AndroidStampDescriptor} from '@components/mediaEditor/webgl/androidStampsContract';
import {androidStampCompositeFragment, androidStampFragment, androidStampVertex} from '@components/mediaEditor/webgl/androidStampsShaders';
import type {AndroidPaintEraseMask} from '@components/mediaEditor/webgl/androidPaintComposition';

type StampImages = Record<'radial' | 'elliptical' | 'neon', TexImageSource>;

/** Isolated opt-in renderer. Caller owns an EXCLUSIVE WebGL context/state during
 * calls and must dispose before losing it. No Input sampling, CSS migration,
 * history, blur, arrow construction, or production activation here. Eraser only
 * exposes a radial mask to the shared paint-only compositor, never the image.
 * Source/output are straight RGBA8 native rows (logical downward painting Y).
 * Output must already contain source outside the returned dirty bounds. Source
 * must be the pre-stroke snapshot, never the current preview or attached output.
 * Every composite recomputes dirty pixels from that snapshot, not from itself.
 */
export function createAndroidStampRenderer(gl: WebGLRenderingContext, images: StampImages, maxPixels = 4 * 1024 * 1024) {
  if(!Number.isSafeInteger(maxPixels) || maxPixels < 1) throw new RangeError('Invalid Android mask budget');
  const textures: WebGLTexture[] = [];
  const programs: WebGLProgram[] = [];
  let buffer: WebGLBuffer;
  let framebuffer: WebGLFramebuffer;
  let disposed = false;
  const dispose = () => {
    if(disposed) return;
    disposed = true;
    textures.forEach(texture => gl.deleteTexture(texture));
    programs.forEach(program => gl.deleteProgram(program));
    if(buffer) gl.deleteBuffer(buffer);
    if(framebuffer) gl.deleteFramebuffer(framebuffer);
  };
  try {
    const makeProgram = (fragment: string) => {
      const program = initShaderProgram(gl, androidStampVertex, fragment);
      if(!program) throw new Error('Unable to compile Android stamp shaders');
      programs.push(program);
      return {
        program,
        position: gl.getAttribLocation(program, 'position'),
        uv: gl.getAttribLocation(program, 'uv'),
        size: gl.getUniformLocation(program, 'size'),
        neon: gl.getUniformLocation(program, 'neon')
      };
    };
    const stampProgram = makeProgram(androidStampFragment);
    const compositeProgram = makeProgram(androidStampCompositeFragment);
    const stampUniform = gl.getUniformLocation(stampProgram.program, 'stamp');
    const intensityUniform = gl.getUniformLocation(stampProgram.program, 'intensity');
    const sourceUniform = gl.getUniformLocation(compositeProgram.program, 'source');
    const maskUniform = gl.getUniformLocation(compositeProgram.program, 'mask');
    const colorUniform = gl.getUniformLocation(compositeProgram.program, 'color');
    buffer = gl.createBuffer();
    framebuffer = gl.createFramebuffer();
    if(!buffer || !framebuffer) throw new Error('Unable to allocate Android stamp resources');
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, 16 * 4, gl.DYNAMIC_DRAW);
    gl.activeTexture(gl.TEXTURE0);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.NONE);
    const makeTexture = () => {
      const texture = gl.createTexture();
      if(!texture) throw new Error('Unable to allocate Android stamp texture');
      textures.push(texture);
      gl.bindTexture(gl.TEXTURE_2D, texture);
      configureBoundTexture(gl);
      return texture;
    };
    const stamps = {} as Record<keyof StampImages, WebGLTexture>;
    for(const key of ['radial', 'elliptical', 'neon'] as const) {
      stamps[key] = makeTexture();
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, images[key]);
      if(gl.getError() !== gl.NO_ERROR) throw new Error('Unable to upload Android stamp');
    }
    const mask = makeTexture();
    const viewportLimit = gl.getParameter(gl.MAX_VIEWPORT_DIMS) as Int32Array;
    const textureLimit = gl.getParameter(gl.MAX_TEXTURE_SIZE) as number;
    let descriptor: AndroidStampDescriptor | (Omit<AndroidStampDescriptor, 'tool'> & {tool: 'eraser'});
    let width = 0, height = 0;
    let dirty: AndroidStampBounds;
    const vertices = new Float32Array(16);
    const alive = () => {
      if(disposed || gl.isContextLost()) throw new Error('Android stamp renderer is unavailable');
    };
    const setup = (program: typeof stampProgram) => {
      gl.useProgram(program.program);
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      gl.vertexAttribPointer(program.position, 2, gl.FLOAT, false, 16, 0);
      gl.vertexAttribPointer(program.uv, 2, gl.FLOAT, false, 16, 8);
      gl.enableVertexAttribArray(program.position);
      gl.enableVertexAttribArray(program.uv);
      gl.uniform2f(program.size, width, height);
      gl.uniform1i(program.neon, descriptor.tool === 'neon' ? 1 : 0);
      gl.viewport(0, 0, width, height);
      gl.disable(gl.DITHER);
      gl.disable(gl.DEPTH_TEST);
      gl.disable(gl.STENCIL_TEST);
      gl.disable(gl.CULL_FACE);
      gl.colorMask(true, true, true, true);
    };
    return {
      begin(value: AndroidStampDescriptor | (Omit<AndroidStampDescriptor, 'tool'> & {tool: 'eraser'})) {
        alive();
        if(value.version !== 1 || !['pen', 'arrow', 'marker', 'neon', 'eraser'].includes(value.tool)) throw new Error('Explicit Android stamp descriptor required');
        const [w, h] = value.paintingSize;
        if(!Number.isInteger(w) || !Number.isInteger(h) || w < 1 || h < 1 || w * h > maxPixels ||
          w > Math.min(textureLimit, viewportLimit[0]) || h > Math.min(textureLimit, viewportLimit[1])) throw new RangeError('Android mask exceeds render budget');
        if(!Number.isFinite(value.normalizedWeight) || !Number.isFinite(value.viewportScaleAtCapture) || value.viewportScaleAtCapture <= 0 ||
          value.color.length !== 4 || value.color.some(c => !Number.isInteger(c) || c < 0 || c > 255)) throw new RangeError('Invalid Android stroke descriptor');
        descriptor = undefined;
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, mask);
        if(width !== w || height !== h) {
          gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
          if(gl.getError() !== gl.NO_ERROR) throw new Error('Unable to allocate Android mask storage');
        }
        gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, mask, 0);
        if(gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) throw new Error('Incomplete Android mask framebuffer');
        width = w;
        height = h;
        descriptor = {...value, paintingSize: [w, h], color: [...value.color]};
        dirty = undefined;
        gl.disable(gl.SCISSOR_TEST);
        gl.colorMask(true, true, true, true);
        gl.clearColor(0, 0, 0, 0);
        gl.clear(gl.COLOR_BUFFER_BIT);
      },
      append(batch: readonly AndroidStamp[]) {
        alive();
        if(!descriptor) throw new Error('Begin an Android stroke first');
        // Validate the complete batch before mutating the mask.
        for(const stamp of batch) {
          if(![stamp.x, stamp.y, stamp.radius, stamp.angle, stamp.intensity].every(Number.isFinite) || stamp.radius < 0 ||
            stamp.radius > Math.max(width, height) * 2 || stamp.intensity < 0 || stamp.intensity > 1) throw new RangeError('Invalid Android stamp');
        }
        setup(stampProgram);
        gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, stamps[androidBrushParameters[descriptor.tool].texture]);
        gl.uniform1i(stampUniform, 0);
        gl.enable(gl.BLEND);
        gl.blendEquation(gl.FUNC_ADD);
        gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
        gl.enable(gl.SCISSOR_TEST);
        for(const stamp of batch) {
          const c = Math.cos(stamp.angle), s = Math.sin(stamp.angle), r = stamp.radius;
          const extent = r * (Math.abs(c) + Math.abs(s));
          const x = Math.max(0, Math.floor(stamp.x - extent));
          const y = Math.max(0, Math.floor(stamp.y - extent));
          const right = Math.min(width, Math.ceil(stamp.x + extent));
          const top = Math.min(height, Math.ceil(stamp.y + extent));
          if(right <= x || top <= y) continue;
          const x0 = dirty ? Math.min(x, dirty.x) : x;
          const y0 = dirty ? Math.min(y, dirty.y) : y;
          dirty = {x: x0, y: y0, width: Math.max(right, dirty ? dirty.x + dirty.width : right) - x0, height: Math.max(top, dirty ? dirty.y + dirty.height : top) - y0};
          for(let i = 0; i < 4; ++i) {
            const u = i % 2, v = Math.floor(i / 2);
            const dx = (u * 2 - 1) * r, dy = (v * 2 - 1) * r;
            vertices.set([stamp.x + c * dx - s * dy, stamp.y + s * dx + c * dy, u, v], i * 4);
          }
          gl.scissor(x, y, right - x, top - y);
          gl.bufferSubData(gl.ARRAY_BUFFER, 0, vertices);
          gl.uniform1f(intensityUniform, stamp.intensity);
          gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
        }
        return dirty && {...dirty};
      },
      composite(source: WebGLTexture, output: WebGLFramebuffer) {
        alive();
        if(!descriptor) throw new Error('Begin an Android stroke first');
        if(descriptor.tool === 'eraser') throw new Error('Eraser requires paint-only mask composition');
        if(source === mask || output === framebuffer) throw new Error('Android mask feedback is forbidden');
        if(!dirty) return undefined;
        setup(compositeProgram);
        gl.bindFramebuffer(gl.FRAMEBUFFER, output);
        gl.disable(gl.BLEND);
        gl.enable(gl.SCISSOR_TEST);
        gl.scissor(dirty.x, dirty.y, dirty.width, dirty.height);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, source);
        gl.uniform1i(sourceUniform, 0);
        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, mask);
        gl.uniform1i(maskUniform, 1);
        const [r, g, b, a] = descriptor.color;
        gl.uniform4f(colorUniform, r / 255, g / 255, b / 255, androidCompositeAlpha(descriptor.tool, a));
        vertices.set([0, 0, 0, 0, width, 0, 1, 0, 0, height, 0, 1, width, height, 1, 1]);
        gl.bufferSubData(gl.ARRAY_BUFFER, 0, vertices);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
        return {...dirty};
      },
      /** Borrowed radial mask; invalidated by begin/dispose. Never a paint layer. */
      eraseMask(): AndroidPaintEraseMask {
        alive();
        if(descriptor?.tool !== 'eraser') throw new Error('Begin an Eraser stroke first');
        return {kind: 'alpha-mask-rgba8', orientation: 'native-painting-rows', texture: mask, width, height};
      },
      dispose
    };
  } catch(error) {
    dispose();
    throw error;
  }
}
