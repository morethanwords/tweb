import {areNativeCurvesEnabled, defaultCurveLevels, NativeAdjustments, nativeCurveChannels} from '@components/mediaEditor/adjustments';
import configureBoundTexture from '@components/mediaEditor/webgl/configureBoundTexture';
import {createNativeCurveSegment} from '@components/mediaEditor/native/curveInterpolation';

export const NATIVE_CURVES_SAMPLE_COUNT = 200;

// Telegram Android 21f7d109 PhotoFilterView.java:188–244,293–304.
// Java rounds EVERY float operation, including level division and byte scaling.
export function createNativeCurvesLut(native?: NativeAdjustments): Uint8Array {
  const result = new Uint8Array(NATIVE_CURVES_SAMPLE_COUNT * 4);
  const f = Math.fround;
  nativeCurveChannels.forEach((channel, component) => {
    const levels = (native?.curves?.[channel] || defaultCurveLevels).map(value => f(f(value) / 100));
    for(let segment = 0; segment < 4; ++segment) {
      const a = levels[Math.max(0, segment - 1)];
      const b = levels[segment];
      const c = levels[segment + 1];
      const d = levels[Math.min(4, segment + 2)];
      const sample = createNativeCurveSegment(a, b, c, d);
      for(let i = 1; i < 100; i += 2) {
        const value = Math.max(0, Math.min(1, sample(i)));
        result[(segment * 50 + (i - 1) / 2) * 4 + component] = Math.trunc(f(value * 255));
      }
    }
  });
  return result;
}

export type NativeCurvesTexture = {
  texture?: WebGLTexture;
  levels?: number[];
};

// Owned by one rendering payload/context. Existing cleanupWebGl loses the context,
// releasing this texture with the source image; no registry or global GPU cache.
export function bindNativeCurvesTexture(gl: WebGLRenderingContext, cache: NativeCurvesTexture, native?: NativeAdjustments) {
  if(!areNativeCurvesEnabled(native)) return false;
  const changed = !cache.levels || nativeCurveChannels.some((channel, component) =>
    (native?.curves?.[channel] || defaultCurveLevels).some((value, index) =>
      Math.fround(value) !== cache.levels[component * 5 + index]
    )
  );
  gl.activeTexture(gl.TEXTURE1);
  if(!cache.texture) {
    cache.texture = gl.createTexture();
    if(!cache.texture) throw new Error('Unable to create curves texture');
    gl.bindTexture(gl.TEXTURE_2D, cache.texture);
    configureBoundTexture(gl);
  } else gl.bindTexture(gl.TEXTURE_2D, cache.texture);
  if(changed) {
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, NATIVE_CURVES_SAMPLE_COUNT, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, createNativeCurvesLut(native));
    cache.levels = nativeCurveChannels.flatMap(channel => (native?.curves?.[channel] || defaultCurveLevels).map(Math.fround));
  }
  // Video updates and brush sampling expect the source image on active unit zero.
  gl.activeTexture(gl.TEXTURE0);
  return true;
}
