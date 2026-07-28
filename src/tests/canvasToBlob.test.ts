import canvasToBlob from '@helpers/canvas/canvasToBlob';

describe('canvasToBlob', () => {
  it('resolves the encoded blob', async() => {
    const blob = new Blob(['image'], {type: 'image/png'});
    const canvas = {
      toBlob: (callback: BlobCallback) => callback(blob)
    } as HTMLCanvasElement;

    await expect(canvasToBlob(canvas, 'image/png')).resolves.toBe(blob);
  });

  it('rejects when canvas encoding fails', async() => {
    const canvas = {
      toBlob: (callback: BlobCallback) => callback(null)
    } as HTMLCanvasElement;

    await expect(canvasToBlob(canvas, 'image/png')).rejects.toThrow('Failed to encode canvas');
  });
});
