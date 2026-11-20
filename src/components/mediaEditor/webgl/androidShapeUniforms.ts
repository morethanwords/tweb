import type {AndroidShapeGeometry} from '@components/mediaEditor/native/androidShapeGeometry';

export type AndroidShapeRGBA = readonly [number, number, number, number];
const shapeTypes = {circle: 0, rectangle: 1, star: 2, bubble: 3, arrow: 4} as const;
const names = ['type', 'resolution', 'center', 'radius', 'middle', 'thickness', 'rounding', 'rotation', 'arrowTriangleLength', 'fill', 'color'] as const;
type ShapeUniforms = Record<typeof names[number], WebGLUniformLocation>;
const finitePair = (value: readonly number[]) => Array.isArray(value) && value.length === 2 && Number.isFinite(value[0]) && Number.isFinite(value[1]);

/** Shared native PAINT_SHAPE_FSH contract. Pass-specific clear/composite,
 * samplers, framebuffer limits and source-size agreement remain with the caller.
 * Interaction-only controlPoints and CSS density do not enter the shader.
 */
export function validateAndroidShapeUniforms(shape: AndroidShapeGeometry, rgba: AndroidShapeRGBA) {
  if(shape.geometryVersion !== 'android-shape-v1' || !Object.prototype.hasOwnProperty.call(shapeTypes, shape.shape) ||
    !finitePair(shape.paintingSize) || shape.paintingSize.some(value => !Number.isInteger(value) || value <= 0) ||
    !finitePair(shape.center) || !finitePair(shape.radius) || !finitePair(shape.middle) ||
    ![shape.thickness, shape.rounding, shape.rotation, shape.arrowTriangleLength].every(Number.isFinite) || shape.thickness < 0 || typeof shape.filled !== 'boolean' ||
    !Array.isArray(rgba) || rgba.length !== 4 || ![rgba[0], rgba[1], rgba[2], rgba[3]].every(value => Number.isFinite(value) && value >= 0 && value <= 1)) {
    throw new RangeError('Invalid resolved Android shape uniforms');
  }
}

export function getAndroidShapeUniforms(gl: WebGLRenderingContext, program: WebGLProgram): ShapeUniforms {
  return Object.fromEntries(names.map(name => [name, gl.getUniformLocation(program, name)])) as ShapeUniforms;
}

/** Both clear-mask and destination-composite passes bind exactly these fields. */
export function bindAndroidShapeUniforms(gl: WebGLRenderingContext, uniforms: ShapeUniforms, shape: AndroidShapeGeometry, rgba: AndroidShapeRGBA) {
  gl.uniform1i(uniforms.type, shapeTypes[shape.shape]);
  gl.uniform2f(uniforms.resolution, ...shape.paintingSize);
  gl.uniform2f(uniforms.center, ...shape.center);
  gl.uniform2f(uniforms.radius, ...shape.radius);
  gl.uniform2f(uniforms.middle, ...shape.middle);
  gl.uniform1f(uniforms.thickness, shape.thickness);
  gl.uniform1f(uniforms.rounding, shape.rounding);
  gl.uniform1f(uniforms.rotation, shape.rotation);
  gl.uniform1f(uniforms.arrowTriangleLength, shape.arrowTriangleLength);
  gl.uniform1i(uniforms.fill, +shape.filled);
  gl.uniform4f(uniforms.color, ...rgba);
}
