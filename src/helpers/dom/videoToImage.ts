import canvasToBlob from '@helpers/canvas/canvasToBlob';

export async function videoToImage(video: HTMLVideoElement): Promise<Blob> {
  const canvas = document.createElement('canvas');
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

  return canvasToBlob(canvas);
}
