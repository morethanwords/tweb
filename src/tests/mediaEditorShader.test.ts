import {initShaderProgram} from '@components/mediaEditor/webgl/initShaderProgram';

vi.mock('@components/mediaEditor/utils', () => ({log: {error: vi.fn()}}));

test.each(['none', 'context-lost', 'compile', 'link'] as const)('shader initialization handles %s failure without invalid handles or leaked shaders', (failure) => {
  const vertex = {};
  const fragment = {};
  const program = {};
  const gl = {
    VERTEX_SHADER: 1, FRAGMENT_SHADER: 2, COMPILE_STATUS: 3, LINK_STATUS: 4,
    createShader: vi.fn(type => failure === 'context-lost' ? null : type === 1 ? vertex : fragment),
    shaderSource: vi.fn(), compileShader: vi.fn(),
    getShaderParameter: vi.fn(shader => failure !== 'compile' || shader !== vertex),
    getShaderInfoLog: vi.fn(() => 'Compilation failed'),
    createProgram: vi.fn(() => program),
    attachShader: vi.fn(), linkProgram: vi.fn(),
    getProgramParameter: vi.fn(() => failure !== 'link'),
    getProgramInfoLog: vi.fn(() => 'Link failed'),
    deleteShader: vi.fn(), deleteProgram: vi.fn()
  };
  const result = initShaderProgram(gl as unknown as WebGLRenderingContext, 'vertex', 'fragment');
  expect(result).toBe(failure === 'none' ? program : null);
  expect(gl.attachShader).toHaveBeenCalledTimes(failure === 'none' || failure === 'link' ? 2 : 0);
  expect(gl.deleteShader).toHaveBeenCalledTimes(failure === 'context-lost' ? 0 : 2);
  expect(gl.deleteProgram).toHaveBeenCalledTimes(failure === 'link' ? 1 : 0);
});
