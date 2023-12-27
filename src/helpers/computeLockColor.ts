let outCanvas: HTMLCanvasElement,
  outContext: CanvasRenderingContext2D;

// https://github.com/telegramdesktop/tdesktop/blob/543bfab24a76402992421063f1e6444f347d31fe/Telegram/SourceFiles/boxes/sticker_set_box.cpp#L75
export default function computeLockColor(canvas: HTMLCanvasElement) {
  if(!outCanvas) {
    outCanvas = document.createElement('canvas');
    outContext = outCanvas.getContext('2d');
  }

  const context = canvas.getContext('2d');
  const size = 20 * (canvas.dpr ?? 1);
  const width = size;
  const height = size;
  const skipx = (canvas.width - width) / 2;
  const margin = 0/*  * (canvas.dpr ?? 1) */;
  const skipy = canvas.height - height - margin;
  const imageData = context.getImageData(skipx, skipy, width, height).data;
  let sr = 0, sg = 0, sb = 0, sa = 0;
  for(let i = 0; i < imageData.length; i += 4) {
    sr += imageData[i];
    sg += imageData[i + 1];
    sb += imageData[i + 2];
    sa += imageData[i + 3];
  }

  outCanvas.width = outCanvas.height = size;
  const color = new Uint8ClampedArray([sr * 255 / sa, sg * 255 / sa, sb * 255 / sa, 255]);
  const rgba = `rgba(${color[0]}, ${color[1]}, ${color[2]}, ${color[3]})`;
  outContext.fillStyle = rgba;
  outContext.fillRect(0, 0, size, size);
  outContext.fillStyle = `rgba(112, 117, 121, 0.3)`;
  outContext.fillRect(0, 0, size, size);
  // document.querySelector('.popup-title').append(c);
  return outCanvas.toDataURL('image/jpeg');
}
