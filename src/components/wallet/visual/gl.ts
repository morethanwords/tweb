// Shared WebGL2 helpers.

export type UniformMap = Record<string, WebGLUniformLocation>;

export function createProgram(gl: WebGL2RenderingContext, vertexSource: string, fragmentSource: string): WebGLProgram {
  const compile = (type: number, source: string) => {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if(!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      const log = gl.getShaderInfoLog(shader);
      const lines = source.split('\n').map((l, i) => `${i + 1}: ${l}`).join('\n');
      console.error(log, '\n', lines);
      throw new Error(log);
    }
    return shader;
  };
  const program = gl.createProgram();
  gl.attachShader(program, compile(gl.VERTEX_SHADER, vertexSource));
  gl.attachShader(program, compile(gl.FRAGMENT_SHADER, fragmentSource));
  gl.linkProgram(program);
  if(!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program));
  return program;
}

/** Every active uniform of the program by name (arrays also as `name`, besides `name[0]`). */
export function uniformLocations(gl: WebGL2RenderingContext, program: WebGLProgram): UniformMap {
  const out: UniformMap = {};
  const count: number = gl.getProgramParameter(program, gl.ACTIVE_UNIFORMS);
  for(let i = 0; i < count; i++) {
    const info = gl.getActiveUniform(program, i);
    out[info.name] = gl.getUniformLocation(program, info.name);
    if(info.name.endsWith('[0]')) out[info.name.slice(0, -3)] = out[info.name];
  }
  return out;
}

/** A WebGL2 context, or a clear error the caller can catch to fall back to a flat look. */
export function getWebGL2Context(canvas: HTMLCanvasElement, attributes: WebGLContextAttributes): WebGL2RenderingContext {
  const gl = canvas.getContext('webgl2', attributes);
  if(!gl) throw new Error('WebGL2 is unavailable');
  return gl;
}

/** Releases the GPU side of a context at once instead of waiting for GC. */
export function loseContext(gl: WebGL2RenderingContext) {
  gl.getExtension('WEBGL_lose_context')?.loseContext();
}
