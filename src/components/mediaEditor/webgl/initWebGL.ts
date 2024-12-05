import {AdjustmentsConfig} from '../adjustments';
import {MediaEditorContextValue} from '../context';
import {initPositionBuffer, initTextureBuffer} from './initBuffers';

import {initShaderProgram} from './initShaderProgram';
import {loadTexture} from './loadTexture';

export type RenderingPayload = Awaited<ReturnType<typeof initWebGL>>;

export async function initWebGL(gl: WebGLRenderingContext, context: MediaEditorContextValue) {
  const [{vertexShaderSource, fragmentShaderSource}, {texture, image}] = await Promise.all([
    import('./shaderSources'),
    loadTexture(gl, context.imageSrc)
  ]);

  const shaderProgram = initShaderProgram(gl, vertexShaderSource, fragmentShaderSource);

  const buffers = {
    position: initPositionBuffer(gl, image.width, image.height),
    texture: initTextureBuffer(gl)
  };

  return {
    program: shaderProgram,
    buffers,
    image,
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
        context.adjustments.map(({uniform}) => [uniform, gl.getUniformLocation(shaderProgram, uniform)])
      ) as Record<AdjustmentsConfig[number]['uniform'], WebGLUniformLocation>)
    }
  };
}
