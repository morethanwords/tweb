import {Middleware} from '../../../helpers/middleware';
import {adjustmentsConfig, AdjustmentsConfig} from '../adjustments';
import {MediaType} from '../types';

import {initPositionBuffer, initTextureBuffer} from './initBuffers';
import {initShaderProgram} from './initShaderProgram';
import {loadTexture} from './loadTexture';

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
  const [{vertexShaderSource, fragmentShaderSource}, {texture, media}] = await Promise.all([
    import('./shaderSources'),
    loadTexture({gl, mediaSrc, mediaType, videoTime, waitToSeek, middleware})
  ]);

  const shaderProgram = initShaderProgram(gl, vertexShaderSource, fragmentShaderSource);

  const buffers = {
    position: initPositionBuffer(gl, media.width, media.height),
    texture: initTextureBuffer(gl)
  };

  return {
    program: shaderProgram,
    buffers,
    media,
    texture,
    attribs: {
      vertexPosition: gl.getAttribLocation(shaderProgram, 'aVertexPosition'),
      textureCoord: gl.getAttribLocation(shaderProgram, 'aTextureCoord')
    },
    uniforms: {
      uSampler: gl.getUniformLocation(shaderProgram, 'uSampler'),
      uFlip: gl.getUniformLocation(shaderProgram, 'uFlip'),
      uAngle: gl.getUniformLocation(shaderProgram, 'uAngle'),
      uResolution: gl.getUniformLocation(shaderProgram, 'uResolution'),
      uTranslation: gl.getUniformLocation(shaderProgram, 'uTranslation'),
      uScale: gl.getUniformLocation(shaderProgram, 'uScale'),
      uImageSize: gl.getUniformLocation(shaderProgram, 'uImageSize'),
      ...(Object.fromEntries(
        adjustmentsConfig.map(({uniform}) => [uniform, gl.getUniformLocation(shaderProgram, uniform)])
      ) as Record<AdjustmentsConfig[number]['uniform'], WebGLUniformLocation>)
    }
  };
}
