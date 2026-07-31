const mocks = vi.hoisted(() => ({
  invoke: vi.fn(),
  invokeVoid: vi.fn()
}));

vi.mock('@lib/apiManagerProxy', () => ({
  default: {
    addSharedObjectURLUpdateListener: vi.fn(),
    invoke: mocks.invoke,
    invokeVoid: mocks.invokeVoid
  }
}));

import {ObjectURLScope, pinObjectURL} from '@helpers/objectUrl';

let nextURL = 0;
const createObjectURL = vi.fn(() => `blob:test/local-${++nextURL}`);
const revokeObjectURL = vi.fn();
const originalCreateObjectURL = URL.createObjectURL;
const originalRevokeObjectURL = URL.revokeObjectURL;

function setURLMethod(
  name: 'createObjectURL' | 'revokeObjectURL',
  value: typeof URL.createObjectURL | typeof URL.revokeObjectURL
) {
  Object.defineProperty(URL, name, {configurable: true, value});
}

function getPinUpdates() {
  return mocks.invokeVoid.mock.calls.flatMap(([method, updates]) => {
    return method === 'updateObjectURLPins' ? updates : [];
  });
}

beforeAll(() => {
  setURLMethod('createObjectURL', createObjectURL);
  setURLMethod('revokeObjectURL', revokeObjectURL);
});

beforeEach(() => {
  nextURL = 0;
  vi.clearAllMocks();
});

afterAll(() => {
  setURLMethod('createObjectURL', originalCreateObjectURL);
  setURLMethod('revokeObjectURL', originalRevokeObjectURL);
});

describe('ObjectURLScope', () => {
  it('creates, adds, releases and disposes local URLs once', () => {
    const scope = new ObjectURLScope();
    const created = scope.create(new Blob(['created']));
    scope.add('blob:test/added');
    scope.add('blob:test/added');
    scope.add('https://example.com/image.jpg');

    scope.release(created);
    scope.release(created);
    scope.dispose();

    expect(createObjectURL).toHaveBeenCalledOnce();
    expect(revokeObjectURL.mock.calls).toEqual([
      [created],
      ['blob:test/added']
    ]);
  });
});

describe('object URL pins', () => {
  it('batches same-microtask pins and unpins into a single ordered update', async() => {
    const unpinFirst = pinObjectURL('blob:test/first');
    pinObjectURL('blob:test/second');
    unpinFirst();
    await Promise.resolve();

    expect(mocks.invokeVoid).toHaveBeenCalledOnce();
    expect(getPinUpdates()).toEqual([
      {url: 'blob:test/first', active: true},
      {url: 'blob:test/second', active: true},
      {url: 'blob:test/first', active: false}
    ]);
  });

  it('unpins only once for repeated releases, in a later flush', async() => {
    const unpin = pinObjectURL('blob:test/idempotent');
    await Promise.resolve();
    unpin();
    unpin();
    await Promise.resolve();
    unpin();
    await Promise.resolve();

    expect(mocks.invokeVoid).toHaveBeenCalledTimes(2);
    expect(getPinUpdates()).toEqual([
      {url: 'blob:test/idempotent', active: true},
      {url: 'blob:test/idempotent', active: false}
    ]);
  });

  it('ignores non-object URLs', async() => {
    const unpin = pinObjectURL('https://example.com/image.jpg');
    unpin();
    await Promise.resolve();

    expect(mocks.invokeVoid).not.toHaveBeenCalled();
  });
});
