const ctx = self as any as DedicatedWorkerGlobalScope;

let canvas: OffscreenCanvas;
let context: ImageBitmapRenderingContext;
let reader: FileReaderSync;

ctx.addEventListener('message', async(event: MessageEvent<ImageBitmap>) => {
  const bitmap = event.data;
  if(!canvas || canvas.width !== bitmap.width || canvas.height !== bitmap.height) {
    canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    context = canvas.getContext('bitmaprenderer');
  }

  context.transferFromImageBitmap(bitmap);
  // webp is pixel-identical here at less than half the png size; unsupporting
  // browsers (Safari) silently encode png instead
  const blob = await canvas.convertToBlob({type: 'image/webp', quality: 1});

  // data: URLs resolve synchronously when referenced from CSS; blob: URLs load
  // asynchronously on every swap (even when predecoded) and flicker the mask
  reader ??= new FileReaderSync();
  ctx.postMessage(reader.readAsDataURL(blob));
});
