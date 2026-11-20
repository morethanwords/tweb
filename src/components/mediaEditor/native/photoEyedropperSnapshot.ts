import {ColorRgba, rgbaToHexa} from '@helpers/color';
import clamp from '@helpers/number/clamp';

/** Native PipettePickerView rounds the position and clamps to the bitmap's last pixel. */
export function photoSamplePoint(x: number, y: number, width: number, height: number) {
  return [clamp(Math.round(x * width), 0, width - 1), clamp(Math.round(y * height), 0, height - 1)] as const;
}

export type PhotoSnapshot = {canvas: HTMLCanvasElement; dispose: () => void};

/** Owns the PNG decode too: cancelling while decoding must close the late bitmap. */
export function createPhotoSnapshotSession(
  snapshot: () => Promise<Blob>,
  doc: Document,
  isValid: () => boolean,
  decode: (blob: Blob) => Promise<ImageBitmap> = blob => doc.defaultView.createImageBitmap(blob)
) {
  let disposed = false;
  let result: PhotoSnapshot;
  const valid = () => !disposed && isValid();
  const dispose = () => {
    disposed = true;
    result?.dispose();
    result = undefined;
  };
  const load = async() => {
    const blob = await snapshot();
    if(!valid()) return;
    if(!blob) throw new Error('Photo snapshot is empty');
    const bitmap = await decode(blob);
    try {
      if(!valid()) return;
      const canvas = doc.createElement('canvas');
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      try {
        const ctx = canvas.getContext('2d', {willReadFrequently: true});
        // Native composites onto black. A transparent source must not pick transparent black.
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(bitmap, 0, 0);
        // Fail closed on a tainted canvas, before displaying an unusable picking surface.
        ctx.getImageData(0, 0, 1, 1);
      } catch(error) {
        canvas.width = canvas.height = 0;
        throw error;
      }
      result = {canvas, dispose: () => { canvas.width = canvas.height = 0; }};
      return result;
    } finally {
      bitmap.close();
    }
  };
  return {load, dispose, valid};
}

export function samplePhoto(canvas: HTMLCanvasElement, x: number, y: number) {
  const [px, py] = photoSamplePoint(x, y, canvas.width, canvas.height);
  const data = canvas.getContext('2d').getImageData(px, py, 1, 1).data;
  return rgbaToHexa(Array.from(data) as ColorRgba);
}
