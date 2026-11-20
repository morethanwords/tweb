import type {MediaEditorContextValue} from '@components/mediaEditor/context';
import type {ResizableLayer} from '@components/mediaEditor/types';
import {imageLayerSession} from '@components/mediaEditor/imageLayer/session';
import {imageLayerFlipped} from '@components/mediaEditor/imageLayer/reflection';

/** Resolve once before a render loop, never hash/decode on each video frame. */
export async function prepareImageLayerDrawing(context: MediaEditorContextValue, layers: readonly ResizableLayer[]) {
  const session = imageLayerSession(context);
  const release = session.retain();
  try {
    const images = new Map<number, ImageBitmap>();
    await Promise.all(layers.map(async layer => {
      if(layer.type === 'image') images.set(layer.id, (await session.resources.resolve(layer.image)).bitmap);
    }));
    return {
      release,
      draw(ctx: CanvasRenderingContext2D, layer: ResizableLayer, density = 1) {
        if(layer.type !== 'image') return;
        const bitmap = images.get(layer.id);
        if(!bitmap) throw new Error('Image layer was not prepared');
        const width = layer.displayWidth * layer.scale / density;
        const height = layer.displayHeight * layer.scale / density;
        ctx.save();
        ctx.translate(...layer.position);
        ctx.rotate(layer.rotation);
        if(imageLayerFlipped(context, layer)) ctx.scale(-1, 1);
        ctx.drawImage(bitmap, -width / 2, -height / 2, width, height);
        ctx.restore();
      }
    };
  } catch(error) {
    release();
    throw error;
  }
}
