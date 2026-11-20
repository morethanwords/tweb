import type {AndroidShapeGeometry} from '@components/mediaEditor/native/androidShapeGeometry';
import {initShaderProgram} from '@components/mediaEditor/webgl/initShaderProgram';
import {initPositionBuffer, initTextureBuffer} from '@components/mediaEditor/webgl/initBuffers';
import configureBoundTexture from '@components/mediaEditor/webgl/configureBoundTexture';
import {androidShapesFragment, androidShapesVertex} from '@components/mediaEditor/webgl/androidShapesShader';
import {bindAndroidShapeUniforms, getAndroidShapeUniforms, validateAndroidShapeUniforms} from '@components/mediaEditor/webgl/androidShapeUniforms';
import type {AndroidShapeRGBA} from '@components/mediaEditor/webgl/androidShapeUniforms';

export type {AndroidShapeRGBA} from '@components/mediaEditor/webgl/androidShapeUniforms';

/** TEST-ONLY clear mask pass, Painting.java render's clear=true helperShape,
 * composite=false contract. No editor activation or destination compositing.
 * Caller owns a dedicated context and current framebuffer of paintingSize.
 * GL state is deliberately clobbered; no DOM, framebuffer allocation, readback,
 * or hidden CSS/DPR scaling. Coordinates are native bottom-left painting pixels,
 * independent of document direction. Caller handles presentation orientation.
 * Painting.java draws a full quad; Shape.getBounds is undo/invalidation, not a
 * safe general scissor contract (rotated arrows can escape those bounds).
 */
export function createAndroidShapesRenderer(gl: WebGLRenderingContext) {
  const program = initShaderProgram(gl, androidShapesVertex, androidShapesFragment);
  if(!program) throw new Error('Android shape shader compilation failed');
  let position: WebGLBuffer, uv: WebGLBuffer, empty: WebGLTexture;
  let disposed = false;
  const dispose = () => {
    if(disposed) return;
    disposed = true;
    if(position) gl.deleteBuffer(position);
    if(uv) gl.deleteBuffer(uv);
    if(empty) gl.deleteTexture(empty);
    gl.deleteProgram(program);
  };
  try {
    position = initPositionBuffer(gl, 2, 2);
    if(!position) throw new Error('Android shape position allocation failed');
    uv = initTextureBuffer(gl);
    if(!uv) throw new Error('Android shape UV allocation failed');
    empty = gl.createTexture();
    if(!empty) throw new Error('Android shape sampler allocation failed');
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, empty);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(4));
    configureBoundTexture(gl);
    const names = ['clear', 'composite', 'texture'] as const;
    const uniforms = {...getAndroidShapeUniforms(gl, program), ...Object.fromEntries(names.map(name => [name, gl.getUniformLocation(program, name)])) as Record<typeof names[number], WebGLUniformLocation>};
    const attributes = [gl.getAttribLocation(program, 'inPosition'), gl.getAttribLocation(program, 'inTexcoord')];
    return {
      render(shape: AndroidShapeGeometry, rgba: AndroidShapeRGBA) {
        if(disposed) throw new Error('Android shape renderer disposed');
        validateAndroidShapeUniforms(shape, rgba);
        gl.viewport(0, 0, ...shape.paintingSize);
        gl.disable(gl.BLEND);
        gl.disable(gl.DEPTH_TEST);
        gl.disable(gl.STENCIL_TEST);
        gl.disable(gl.CULL_FACE);
        gl.disable(gl.SCISSOR_TEST);
        gl.disable(gl.DITHER);
        gl.colorMask(true, true, true, true);
        gl.useProgram(program);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, empty);
        gl.uniform1i(uniforms.texture, 0);
        bindAndroidShapeUniforms(gl, uniforms, shape, rgba);
        gl.uniform1i(uniforms.clear, 1);
        gl.uniform1i(uniforms.composite, 0);
        [position, uv].forEach((buffer, i) => {
          gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
          gl.vertexAttribPointer(attributes[i], 2, gl.FLOAT, false, 0, 0);
          gl.enableVertexAttribArray(attributes[i]);
        });
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      },
      dispose
    };
  } catch(error) {
    dispose();
    throw error;
  }
}
