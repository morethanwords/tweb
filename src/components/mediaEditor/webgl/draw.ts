import {AdjustmentKey, defaultCurveLevels, defaultSelectiveBlur, getLegacyCurveUniforms, NativeAdjustments, PhotoProcessingPolicy} from '@components/mediaEditor/adjustments';
import {NumberPair} from '@components/mediaEditor/types';

import {RenderingPayload} from '@components/mediaEditor/webgl/initWebGL';
import {bindNativeCurvesTexture} from '@components/mediaEditor/webgl/nativeCurves';
import {renderNativeSharpen} from '@components/mediaEditor/webgl/nativeSharpen';
import type {PreviewAffine} from '@components/mediaEditor/canvas/previewAffine';
import setPreviewAffineUniforms from '@components/mediaEditor/webgl/previewAffineUniforms';


type DrawingParameters = {
  rotation: number;
  scale: number;
  translation: NumberPair;
  imageSize: NumberPair;
  flip: NumberPair;
  native?: NativeAdjustments;
  original?: boolean;
  /** Preview-only transparency so a separate blurred DOM layer can show through. */
  transparentOutside?: boolean;
  /** Preview only. Source-centred, unflipped -> surface CSS px. Never exported. */
  previewAffine?: PreviewAffine;
  previewPixelRatio?: number;
} & PhotoProcessingPolicy & Record<AdjustmentKey, number>;

export function draw(gl: WebGLRenderingContext, payload: RenderingPayload, parameters: DrawingParameters) {
  const nativeProcessing = parameters.processingVersion === 'android-photo-v1';
  if(nativeProcessing && gl.isContextLost()) return;
  const texture = nativeProcessing && !parameters.original && !payload.media.video ?
    renderNativeSharpen(gl, payload.sharpen, payload.texture, payload.buffers.texture,
      payload.media.width, payload.media.height, parameters.sharpen) : payload.texture;
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);

  gl.clearColor(0.0, 0.0, 0.0, parameters.transparentOutside ? 0.0 : 1.0);
  gl.clear(gl.COLOR_BUFFER_BIT);

  gl.bindBuffer(gl.ARRAY_BUFFER, payload.buffers.position);
  gl.vertexAttribPointer(payload.attribs.vertexPosition, 2, gl.FLOAT, false, 0, 0);
  gl.enableVertexAttribArray(payload.attribs.vertexPosition);

  gl.bindBuffer(gl.ARRAY_BUFFER, payload.buffers.texture);
  gl.vertexAttribPointer(payload.attribs.textureCoord, 2, gl.FLOAT, false, 0, 0);
  gl.enableVertexAttribArray(payload.attribs.textureCoord);

  gl.useProgram(payload.program);

  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.uniform1i(payload.uniforms.uSampler, 0);
  gl.uniform1f(payload.uniforms.uNativeProcessing, nativeProcessing ? 1 : 0);
  gl.uniform1f(payload.uniforms.uOriginal, parameters.original ? 1 : 0);

  gl.uniform1f(payload.uniforms.uAngle, -parameters.rotation);
  gl.uniform2f(payload.uniforms.uResolution, gl.canvas.width, gl.canvas.height);
  gl.uniform1f(payload.uniforms.uScale, parameters.scale);
  gl.uniform2fv(payload.uniforms.uTranslation, parameters.translation);
  gl.uniform2fv(payload.uniforms.uImageSize, parameters.imageSize);
  gl.uniform2fv(payload.uniforms.uFlip, parameters.flip);
  setPreviewAffineUniforms(gl, payload.uniforms, parameters.previewAffine, parameters.previewPixelRatio);

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

  const native = parameters.native;
  const tint = (color: number) => [(color >> 16 & 255) / 255, (color >> 8 & 255) / 255, (color & 255) / 255, color ? 1 : 0];
  gl.uniform4fv(payload.uniforms.uTintShadows, tint(native?.tintShadows || 0));
  gl.uniform4fv(payload.uniforms.uTintHighlights, tint(native?.tintHighlights || 0));
  const blur = native?.blur || defaultSelectiveBlur;
  gl.uniform4f(payload.uniforms.uBlur, blur.mode === 'radial' ? 1 : blur.mode === 'linear' ? 2 : 0, blur.size, blur.falloff, blur.angle);
  gl.uniform2fv(payload.uniforms.uBlurCenter, blur.center);
  let curvesEnabled: boolean;
  if(nativeProcessing) {
    curvesEnabled = bindNativeCurvesTexture(gl, payload.curves, native);
  } else {
    const curves = getLegacyCurveUniforms(native);
    gl.uniform4fv(payload.uniforms.uCurve0, curves[0]);
    gl.uniform4fv(payload.uniforms.uCurve1, curves[1]);
    gl.uniform4fv(payload.uniforms.uCurve2, curves[2]);
    gl.uniform4fv(payload.uniforms.uCurve3, curves[3]);
    gl.uniform4fv(payload.uniforms.uCurve4, curves[4]);
    // Preserve exact legacy comparisons (not the native float32 epsilon).
    const channels = curves[0].map((_, channel) =>
      curves.some((point, index) => point[channel] !== defaultCurveLevels[index] / 100) ? 1 : 0
    );
    gl.uniform4fv(payload.uniforms.uCurveChannelsEnabled, channels);
    curvesEnabled = channels.some(Boolean);
  }
  // A disabled, never-created LUT must still have a complete sampler: use source.
  gl.uniform1i(payload.uniforms.uCurvesTexture, nativeProcessing && curvesEnabled ? 1 : 0);
  gl.uniform1f(payload.uniforms.uCurvesEnabled, curvesEnabled ? 1 : 0);

  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
}
