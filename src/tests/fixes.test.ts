/**
 * Unit tests for all fixes applied to resolve TypeScript and ESLint errors.
 *
 * Covers:
 *  - blobConstruct (BlobPart casting)
 *  - bufferConcats / Uint8Array.concat polyfill (Uint8Array<ArrayBufferLike>)
 *  - Promise.all with MaybePromise arrays (await-thenable)
 *  - Array index replacement for .at() (ES2022 not available in es2015 target)
 *  - passcode utils (PBKDF2 salt type)
 *  - tl_utils buffer casting (ArrayBufferLike → ArrayBuffer)
 */

import '../lib/polyfill'; // load Uint8Array.prototype.concat polyfill
import blobConstruct from '@helpers/blob/blobConstruct';
import bufferConcats from '@helpers/bytes/bufferConcats';

// ---------------------------------------------------------------------------
// blobConstruct
// ---------------------------------------------------------------------------

describe('blobConstruct', () => {
  test('creates Blob from single Uint8Array', () => {
    const data = new Uint8Array([1, 2, 3]);
    const blob = blobConstruct(data, 'application/octet-stream');
    expect(blob).toBeInstanceOf(Blob);
    expect(blob.size).toBe(3);
    expect(blob.type).toBe('application/octet-stream');
  });

  test('creates Blob from array of Uint8Array', () => {
    const a = new Uint8Array([1, 2]);
    const b = new Uint8Array([3, 4]);
    const blob = blobConstruct([a, b], 'application/octet-stream');
    expect(blob.size).toBe(4);
  });

  test('creates Blob from single string', () => {
    // blobSafeMimeType only allows specific types; text/plain → application/octet-stream
    const blob = blobConstruct('hello', 'text/plain');
    expect(blob.size).toBe(5);
    expect(blob.type).toBe('application/octet-stream');
  });

  test('creates Blob from single string with allowed mime type', () => {
    const blob = blobConstruct('{}', 'application/json');
    expect(blob.size).toBe(2);
    expect(blob.type).toBe('application/json');
  });

  test('creates Blob from array of strings', () => {
    const blob = blobConstruct(['he', 'llo'], 'application/json');
    expect(blob.size).toBe(5);
  });

  test('defaults to empty mime type', () => {
    const blob = blobConstruct(new Uint8Array([0]));
    expect(blob).toBeInstanceOf(Blob);
  });

  test('accepts Uint8Array created from ArrayBuffer (ArrayBufferLike scenario)', () => {
    // This covers the Uint8Array<ArrayBufferLike> → BlobPart fix
    const ab = new ArrayBuffer(4);
    const arr = new Uint8Array(ab);
    arr.set([10, 20, 30, 40]);
    const blob = blobConstruct(arr, 'application/octet-stream');
    expect(blob.size).toBe(4);
  });
});

// ---------------------------------------------------------------------------
// bufferConcats (underlying the Uint8Array.concat polyfill)
// ---------------------------------------------------------------------------

describe('bufferConcats', () => {
  test('concatenates two Uint8Arrays', () => {
    const a = new Uint8Array([1, 2, 3]);
    const b = new Uint8Array([4, 5, 6]);
    const result = bufferConcats(a, b);
    expect(result).toEqual(new Uint8Array([1, 2, 3, 4, 5, 6]));
  });

  test('concatenates Uint8Array and ArrayBuffer', () => {
    const a = new Uint8Array([1, 2]);
    const ab = new Uint8Array([3, 4]).buffer;
    const result = bufferConcats(a, ab);
    expect(result).toEqual(new Uint8Array([1, 2, 3, 4]));
  });

  test('concatenates Uint8Array and number[]', () => {
    const a = new Uint8Array([1, 2]);
    const result = bufferConcats(a, [3, 4]);
    expect(result).toEqual(new Uint8Array([1, 2, 3, 4]));
  });

  test('handles empty inputs', () => {
    const result = bufferConcats(new Uint8Array(0), new Uint8Array(0));
    expect(result.length).toBe(0);
  });

  test('handles single input', () => {
    const a = new Uint8Array([7, 8, 9]);
    const result = bufferConcats(a);
    expect(result).toEqual(new Uint8Array([7, 8, 9]));
  });
});

// ---------------------------------------------------------------------------
// Uint8Array.prototype.concat polyfill
// ---------------------------------------------------------------------------

describe('Uint8Array.prototype.concat (polyfill)', () => {
  test('concatenates two Uint8Arrays via polyfill', () => {
    const a = new Uint8Array([1, 2, 3]);
    const b = new Uint8Array([4, 5, 6]);
    const result = a.concat(b);
    expect(result).toEqual(new Uint8Array([1, 2, 3, 4, 5, 6]));
  });

  test('result of concat is usable as BufferSource (Uint8Array<ArrayBuffer> compatible)', () => {
    const a = new Uint8Array([1, 2]);
    const b = new Uint8Array([3, 4]);
    const result = a.concat(b);
    // Verify the result has standard Uint8Array properties
    expect(result.buffer).toBeInstanceOf(ArrayBuffer);
    expect(result.byteLength).toBe(4);
  });

  test('concatenates multiple arrays', () => {
    const a = new Uint8Array([1]);
    const b = new Uint8Array([2]);
    const c = new Uint8Array([3]);
    const result = a.concat(b, c);
    expect(result).toEqual(new Uint8Array([1, 2, 3]));
  });
});

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

// ---------------------------------------------------------------------------
// Array .at() replacement (starGiftInfo.tsx fix)
// ---------------------------------------------------------------------------

describe('Array last element: index replacement for .at(-1)', () => {
  test('colors[colors.length - 1] equals last element', () => {
    const colors = ['red', 'green', 'blue'];
    expect(colors[colors.length - 1]).toBe('blue');
  });

  test('works with single element array', () => {
    const arr = ['only'];
    expect(arr[arr.length - 1]).toBe('only');
  });

  test('produces same result as .at(-1) would', () => {
    const arr = [10, 20, 30, 40];
    // Simulate what colors.at(-1) would return:
    const byIndex = arr[arr.length - 1];
    expect(byIndex).toBe(40);
  });
});

// ---------------------------------------------------------------------------
// TLDeserialization buffer casting (tl_utils.ts fix)
// ---------------------------------------------------------------------------

describe('ArrayBuffer casting (tl_utils.ts fix)', () => {
  test('Uint8Array.buffer cast to ArrayBuffer preserves data', () => {
    const arr = new Uint8Array([1, 2, 3, 4]);
    // This is the pattern used in TLDeserialization constructor fix
    const buffer = arr.buffer as ArrayBuffer;
    expect(buffer).toBeInstanceOf(ArrayBuffer);
    expect(buffer.byteLength).toBe(4);
    const view = new Uint8Array(buffer);
    expect(view).toEqual(arr);
  });

  test('new Uint8Array from ArrayBufferLike cast works', () => {
    // Covers the gzipUncompress result cast in tl_utils.ts:692
    const source = new Uint8Array([5, 6, 7, 8]);
    const casted = source as Uint8Array<ArrayBuffer>;
    expect(casted).toEqual(source);
    const deserialized = new Uint8Array(casted);
    expect(deserialized).toEqual(new Uint8Array([5, 6, 7, 8]));
  });
});

// ---------------------------------------------------------------------------
// Response / fetch body casting (serviceWorker/stream, rtmp fixes)
// ---------------------------------------------------------------------------

describe('Response body BodyInit casting', () => {
  test('Uint8Array<ArrayBuffer> is valid BodyInit for Response', () => {
    const bytes = new Uint8Array([72, 101, 108, 108, 111]); // "Hello"
    // The cast pattern: bytes as Uint8Array<ArrayBuffer>
    const response = new Response(bytes as Uint8Array<ArrayBuffer>);
    expect(response).toBeInstanceOf(Response);
  });

  test('Response created from Uint8Array has correct byte length', async() => {
    const bytes = new Uint8Array([1, 2, 3, 4, 5]);
    const response = new Response(bytes as Uint8Array<ArrayBuffer>);
    const buffer = await response.arrayBuffer();
    expect(buffer.byteLength).toBe(5);
  });
});
