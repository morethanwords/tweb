export default function canvasToBlob(canvas: HTMLCanvasElement, type?: string, quality?: number) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if(blob) {
        resolve(blob);
      } else {
        reject(new Error('Failed to encode canvas'));
      }
    }, type, quality);
  });
}
