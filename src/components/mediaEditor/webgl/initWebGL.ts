import {Middleware} from '@helpers/middleware';
import {adjustmentsConfig, AdjustmentsConfig} from '@components/mediaEditor/adjustments';
import {MediaType} from '@components/mediaEditor/types';

import {initPositionBuffer, initTextureBuffer} from '@components/mediaEditor/webgl/initBuffers';
import {initShaderProgram} from '@components/mediaEditor/webgl/initShaderProgram';
import {loadTexture} from '@components/mediaEditor/webgl/loadTexture';
import {NativeCurvesTexture} from '@components/mediaEditor/webgl/nativeCurves';
import {NativeSharpenState} from '@components/mediaEditor/webgl/nativeSharpen';

export type RenderingPayload = Awaited<ReturnType<typeof initWebGL>>;

type InitWebGLArgs = {
  gl: WebGLRenderingContext;
  mediaSrc: string;
  mediaType: MediaType;
  videoTime: number;
  waitToSeek?: boolean;

  middleware?: Middleware;
};

export async function initWebGL({gl, mediaSrc, mediaType, videoTime, waitToSeek, middleware}: InitWebGLArgs) {
  const isActive = () => (!middleware || middleware()) && gl && !gl.isContextLost();
  if(!isActive()) return;
  const loaded = await Promise.all([
    import('@components/mediaEditor/webgl/shaderSources'),
    loadTexture({gl, mediaSrc, mediaType, videoTime, waitToSeek, middleware})
  ]).catch(error => {
    if(isActive()) throw error;
  });
  if(!isActive() || !loaded || !loaded[1]) return;
  const [{vertexShaderSource, fragmentShaderSource}, {texture, media}] = loaded;

  const shaderProgram = initShaderProgram(gl, vertexShaderSource, fragmentShaderSource);
  if(!shaderProgram) return;

  const buffers = {
    position: initPositionBuffer(gl, media.width, media.height),
    texture: initTextureBuffer(gl)
  };

  return {
    program: shaderProgram,
    buffers,
    media,
    texture,
    curves: {} as NativeCurvesTexture,
    sharpen: {} as NativeSharpenState,
    attribs: {
      vertexPosition: gl.getAttribLocation(shaderProgram, 'aVertexPosition'),
      textureCoord: gl.getAttribLocation(shaderProgram, 'aTextureCoord')
    },
    uniforms: {
      uSampler: gl.getUniformLocation(shaderProgram, 'uSampler'),
      uNativeProcessing: gl.getUniformLocation(shaderProgram, 'uNativeProcessing'),
      uOriginal: gl.getUniformLocation(shaderProgram, 'uOriginal'),
      uFlip: gl.getUniformLocation(shaderProgram, 'uFlip'),
      uAngle: gl.getUniformLocation(shaderProgram, 'uAngle'),
      uPreviewAffine: gl.getUniformLocation(shaderProgram, 'uPreviewAffine'),
      uPreviewAffineEnabled: gl.getUniformLocation(shaderProgram, 'uPreviewAffineEnabled'),
      uResolution: gl.getUniformLocation(shaderProgram, 'uResolution'),
      uTranslation: gl.getUniformLocation(shaderProgram, 'uTranslation'),
      uScale: gl.getUniformLocation(shaderProgram, 'uScale'),
      uImageSize: gl.getUniformLocation(shaderProgram, 'uImageSize'),
      uTintShadows: gl.getUniformLocation(shaderProgram, 'uTintShadows'),
      uTintHighlights: gl.getUniformLocation(shaderProgram, 'uTintHighlights'),
      uBlur: gl.getUniformLocation(shaderProgram, 'uBlur'),
      uBlurCenter: gl.getUniformLocation(shaderProgram, 'uBlurCenter'),
      uCurvesTexture: gl.getUniformLocation(shaderProgram, 'uCurvesTexture'),
      uCurvesEnabled: gl.getUniformLocation(shaderProgram, 'uCurvesEnabled'),
      uCurve0: gl.getUniformLocation(shaderProgram, 'uCurve0'),
      uCurve1: gl.getUniformLocation(shaderProgram, 'uCurve1'),
      uCurve2: gl.getUniformLocation(shaderProgram, 'uCurve2'),
      uCurve3: gl.getUniformLocation(shaderProgram, 'uCurve3'),
      uCurve4: gl.getUniformLocation(shaderProgram, 'uCurve4'),
      uCurveChannelsEnabled: gl.getUniformLocation(shaderProgram, 'uCurveChannelsEnabled'),
      ...(Object.fromEntries(
        adjustmentsConfig.map(({uniform}) => [uniform, gl.getUniformLocation(shaderProgram, uniform)])
      ) as Record<AdjustmentsConfig[number]['uniform'], WebGLUniformLocation>)
    }
  };
}
