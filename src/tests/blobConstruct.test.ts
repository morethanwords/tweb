import blobConstruct from '@helpers/blob/blobConstruct';

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
