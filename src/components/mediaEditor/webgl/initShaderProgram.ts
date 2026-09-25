import {log} from '@components/mediaEditor/utils';

export function initShaderProgram(gl: WebGLRenderingContext, vsSource: string, fsSource: string) {
  const vertexShader = loadShader(gl, gl.VERTEX_SHADER, vsSource);
  const fragmentShader = loadShader(gl, gl.FRAGMENT_SHADER, fsSource);
  if(!vertexShader || !fragmentShader) {
    if(vertexShader) gl.deleteShader(vertexShader);
    if(fragmentShader) gl.deleteShader(fragmentShader);
    return null;
  }

  const shaderProgram = gl.createProgram();
  if(!shaderProgram) {
    gl.deleteShader(vertexShader);
    gl.deleteShader(fragmentShader);
    return null;
  }
  gl.attachShader(shaderProgram, vertexShader);
  gl.attachShader(shaderProgram, fragmentShader);
  gl.linkProgram(shaderProgram);
  gl.deleteShader(vertexShader);
  gl.deleteShader(fragmentShader);

  if(!gl.getProgramParameter(shaderProgram, gl.LINK_STATUS)) {
    log.error(`Unable to initialize the shader program: ${gl.getProgramInfoLog(shaderProgram)}`);
    gl.deleteProgram(shaderProgram);
    return null;
  }

  return shaderProgram;
}

function loadShader(gl: WebGLRenderingContext, type: GLenum, source: string) {
  const shader = gl.createShader(type);
  if(!shader) return null;

  gl.shaderSource(shader, source);
  gl.compileShader(shader);

  if(!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    log.error(`An error occurred compiling the shaders: ${gl.getShaderInfoLog(shader)}`);
    gl.deleteShader(shader);
    return null;
  }

  return shader;
}
