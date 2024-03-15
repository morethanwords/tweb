export default function createCanvasStream({width = 0, height = 0, image}: Partial<{width: number, height: number, image: CanvasImageSource}> = {}) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const stream = canvas.captureStream();
  stream.getVideoTracks()[0].enabled = true;
  const context = canvas.getContext('2d');
  if(image) {
    context.drawImage(image, 0, 0, width, height);
    context.globalAlpha = 0.5;
    context.fillStyle = '#000';
    context.fillRect(0, 0, width, height);
  } else {
    context.fillRect(0, 0, width, height);
  }
  return stream;
}
