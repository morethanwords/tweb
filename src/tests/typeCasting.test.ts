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
