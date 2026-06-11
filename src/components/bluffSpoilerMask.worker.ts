const ctx = self as any as DedicatedWorkerGlobalScope;

let canvas: OffscreenCanvas;
let context: ImageBitmapRenderingContext;

ctx.addEventListener('message', async(event: MessageEvent<ImageBitmap>) => {
  const bitmap = event.data;
  if(!canvas || canvas.width !== bitmap.width || canvas.height !== bitmap.height) {
    canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    context = canvas.getContext('bitmaprenderer');
  }

  context.transferFromImageBitmap(bitmap);
  const blob = await canvas.convertToBlob();
  ctx.postMessage(blob); // the object URL is minted by the main thread, it owns the revocation
});
