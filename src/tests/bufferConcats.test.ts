import '../lib/polyfill'; // load Uint8Array.prototype.concat polyfill
import bufferConcats from '@helpers/bytes/bufferConcats';

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
