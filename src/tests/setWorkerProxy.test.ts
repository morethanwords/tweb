import setWorkerProxy from '@helpers/setWorkerProxy';

describe('setWorkerProxy', () => {
  test('does not require the Worker API to exist', () => {
    const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'Worker');
    expect(Reflect.deleteProperty(globalThis, 'Worker')).toBe(true);

    try {
      expect(() => setWorkerProxy()).not.toThrow();
    } finally {
      if(descriptor) Object.defineProperty(globalThis, 'Worker', descriptor);
    }
  });
});
