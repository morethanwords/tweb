import {previewRasterMatrix, type PreviewAffine} from '@components/mediaEditor/canvas/previewAffine';

export default function setPreviewAffineUniforms(
  gl: Pick<WebGLRenderingContext, 'uniform1f' | 'uniformMatrix3fv'>,
  uniforms: {uPreviewAffineEnabled: WebGLUniformLocation; uPreviewAffine: WebGLUniformLocation},
  matrix?: PreviewAffine,
  ratio = 1
) {
  // A program may be reused for an export/default draw after a preview draw.
  gl.uniform1f(uniforms.uPreviewAffineEnabled, matrix ? 1 : 0);
  if(matrix) gl.uniformMatrix3fv(uniforms.uPreviewAffine, false, previewRasterMatrix(matrix, ratio));
}
