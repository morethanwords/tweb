// ---------------------------------------------------------------------------
// Promise.all with MaybePromise arrays (ESLint await-thenable fix)
// ---------------------------------------------------------------------------

describe('Promise.all with mixed types (await-thenable fixes)', () => {
  test('Promise.all cast to Promise<any>[] handles resolved values', async() => {
    type MaybePromise<T> = T | Promise<T>;
    const arr: MaybePromise<number>[] = [Promise.resolve(1), 2, Promise.resolve(3)];
    const results = await Promise.all(arr as Promise<number>[]);
    expect(results).toEqual([1, 2, 3]);
  });

  test('Promise.all cast handles undefined elements', async() => {
    const arr: (Promise<number> | undefined)[] = [
      Promise.resolve(1),
      undefined,
      Promise.resolve(3)
    ];
    const results = await Promise.all(arr as Promise<number | undefined>[]);
    expect(results).toEqual([1, undefined, 3]);
  });

  test('Promise.all cast handles false elements (short-circuit pattern)', async() => {
    const condition = false;
    const arr: (Promise<string> | false)[] = [
      Promise.resolve('hello'),
      condition && Promise.resolve('never'),
      Promise.resolve('world')
    ];
    const results = await Promise.all(arr as Promise<string | false>[]);
    expect(results).toEqual(['hello', false, 'world']);
  });

  test('Promise.all cast handles void elements', async() => {
    const voidFn = (): void => {/* no-op */};
    const arr: (Promise<void> | void)[] = [
      Promise.resolve(),
      voidFn(),
      Promise.resolve()
    ];
    const results = await Promise.all(arr as Promise<void>[]);
    expect(results.length).toBe(3);
  });

  test('Promise.all filter(Boolean) pattern works after cast', async() => {
    type K = {element: string};
    const results: (Promise<K> | K | undefined)[] = [
      Promise.resolve({element: 'a'}),
      {element: 'b'},
      undefined
    ];
    const awaited = (await Promise.all(results as Promise<K | undefined>[])).filter(Boolean);
    expect(awaited).toEqual([{element: 'a'}, {element: 'b'}]);
  });
});
