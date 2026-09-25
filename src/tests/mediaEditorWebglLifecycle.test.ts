import {initWebGL} from '@components/mediaEditor/webgl/initWebGL';
import deferredPromise from '@helpers/cancellablePromise';
import {getMiddleware} from '@helpers/middleware';

const mocks = vi.hoisted(() => ({load: vi.fn(), shader: vi.fn()}));
vi.mock('@components/mediaEditor/webgl/loadTexture', () => ({loadTexture: mocks.load}));
vi.mock('@components/mediaEditor/webgl/initShaderProgram', () => ({initShaderProgram: mocks.shader}));
vi.mock('@components/mediaEditor/webgl/initBuffers', () => ({initPositionBuffer: vi.fn(), initTextureBuffer: vi.fn()}));

test.each(['none', 'closed', 'context-lost'] as const)('WebGL initialization respects %s while media loads', async(interruption) => {
  const middleware = getMiddleware();
  const pending = deferredPromise<any>();
  mocks.load.mockReset().mockReturnValue(pending);
  mocks.shader.mockReset().mockReturnValue({});
  let contextLost = false;
  const gl = {
    isContextLost: vi.fn(() => contextLost),
    getAttribLocation: vi.fn(), getUniformLocation: vi.fn()
  } as unknown as WebGLRenderingContext;
  const task = initWebGL({gl, mediaSrc: 'blob:test', mediaType: 'image', videoTime: 0, middleware: middleware.get()});
  if(interruption === 'closed') middleware.destroy();
  if(interruption === 'context-lost') contextLost = true;
  pending.resolve({texture: {}, media: {width: 100, height: 100}});
  const result = await task;
  expect(mocks.shader).toHaveBeenCalledTimes(interruption === 'none' ? 1 : 0);
  if(interruption === 'none') expect(result.media).toMatchObject({width: 100, height: 100});
  else expect(result).toBeUndefined();
  middleware.destroy();
});

test('a media-load rejection after close does not become an unhandled initialization error', async() => {
  const middleware = getMiddleware();
  const pending = deferredPromise<any>();
  mocks.load.mockReturnValue(pending);
  const gl = {isContextLost: () => false} as WebGLRenderingContext;
  const task = initWebGL({gl, mediaSrc: 'blob:test', mediaType: 'image', videoTime: 0, middleware: middleware.get()});
  middleware.destroy();
  pending.reject(new Error('REVOKED_PREVIEW'));
  await expect(task).resolves.toBeUndefined();
});
