export function initPositionBuffer(gl: WebGLRenderingContext, width: number, height: number) {
  const positionBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);

  const positions = [0, 0, width, 0, 0, height, width, height];
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(positions), gl.STATIC_DRAW);

  return positionBuffer;
}

export function initTextureBuffer(gl: WebGLRenderingContext) {
  const textureCoordBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, textureCoordBuffer);

  const textureCoordinates = [0.0, 0.0, 1.0, 0.0, 0.0, 1.0, 1.0, 1.0];
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(textureCoordinates), gl.STATIC_DRAW);

  return textureCoordBuffer;
}
