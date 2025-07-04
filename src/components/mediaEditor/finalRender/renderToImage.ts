import {MediaEditorContextValue} from '../context';
import {MediaEditorFinalResultPayload} from './createFinalResult';

import drawStickerLayer from './drawStickerLayer';
import drawTextLayer from './drawTextLayer';
import {ScaledLayersAndLines} from './getScaledLayersAndLines';

export type RenderToImageArgs = {
  context: MediaEditorContextValue;
  scaledLayers: ScaledLayersAndLines['scaledLayers'];
  ctx: CanvasRenderingContext2D;
  imageCanvas: HTMLCanvasElement;
  brushCanvas: HTMLCanvasElement;
  resultCanvas: HTMLCanvasElement;
};

export default async function renderToImage({
  context,
  scaledLayers,
  ctx,
  imageCanvas,
  brushCanvas,
  resultCanvas
}: RenderToImageArgs) {
  const {editorState: {stickersLayersInfo}} = context;

  ctx.drawImage(imageCanvas, 0, 0);
  ctx.drawImage(brushCanvas, 0, 0);

  scaledLayers.forEach((layer) => {
    if(layer.type === 'text') drawTextLayer(context, ctx, layer);
    if(layer.type === 'sticker' && layer.sticker?.sticker === 1) {
      const {container} = stickersLayersInfo[layer.id];
      const stickerChild = container?.lastElementChild;
      if(!(stickerChild instanceof HTMLImageElement)) return;
      const ratio = stickerChild.naturalWidth / stickerChild.naturalHeight;
      drawStickerLayer(context, ctx, layer, stickerChild, ratio);
    }
  });

  const result = await new Promise<MediaEditorFinalResultPayload>((resolve) =>
    resultCanvas.toBlob(blob => resolve({
      blob,
      hasSound: false
    }))
  );

  return {
    preview: result.blob,
    isVideo: false,
    getResult: () => result
  };
}
