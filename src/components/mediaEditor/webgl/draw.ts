import {AdjustmentsConfig} from '../adjustments';
import {RenderingPayload} from './initWebGL';

type DrawingParameters = {
  rotation: number;
  scale: number;
  translation: [number, number];
  imageSize: [number, number];
  flip: [number, number];
} & Record<AdjustmentsConfig[number]['key'], number>;

export function draw(gl: WebGLRenderingContext, payload: RenderingPayload, parameters: DrawingParameters) {
  gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);

  gl.clearColor(0.0, 0.0, 0.0, 1.0);
  gl.clear(gl.COLOR_BUFFER_BIT);

  gl.bindBuffer(gl.ARRAY_BUFFER, payload.buffers.position);
  gl.vertexAttribPointer(payload.attribs.vertexPosition, 2, gl.FLOAT, false, 0, 0);
  gl.enableVertexAttribArray(payload.attribs.vertexPosition);

  gl.bindBuffer(gl.ARRAY_BUFFER, payload.buffers.texture);
  gl.vertexAttribPointer(payload.attribs.textureCoord, 2, gl.FLOAT, false, 0, 0);
  gl.enableVertexAttribArray(payload.attribs.textureCoord);

  gl.useProgram(payload.program);

  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, payload.texture);
  gl.uniform1i(payload.uniforms.uSampler, 0);

  gl.uniform1f(payload.uniforms.uAngle, -parameters.rotation);
  gl.uniform2f(payload.uniforms.uResolution, gl.canvas.width, gl.canvas.height);
  gl.uniform1f(payload.uniforms.uScale, parameters.scale);
  gl.uniform2fv(payload.uniforms.uTranslation, parameters.translation);
  gl.uniform2fv(payload.uniforms.uImageSize, parameters.imageSize);
  gl.uniform2fv(payload.uniforms.uFlip, parameters.flip);

  gl.uniform1f(payload.uniforms.uSaturation, parameters.saturation);
  gl.uniform1f(payload.uniforms.uBrightness, parameters.brightness);
  gl.uniform1f(payload.uniforms.uContrast, parameters.contrast);
  gl.uniform1f(payload.uniforms.uWarmth, parameters.warmth);
  gl.uniform1f(payload.uniforms.uFade, parameters.fade);
  gl.uniform1f(payload.uniforms.uShadows, parameters.shadows);
  gl.uniform1f(payload.uniforms.uHighlights, parameters.highlights);
  gl.uniform1f(payload.uniforms.uVignette, parameters.vignette);
  gl.uniform1f(payload.uniforms.uGrain, parameters.grain);
  gl.uniform1f(payload.uniforms.uSharpen, parameters.sharpen);
  gl.uniform1f(payload.uniforms.uEnhance, parameters.enhance);

  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
}
