import StickerType from '@config/stickerType';
import {prepareImageLayerDrawing} from '@components/mediaEditor/imageLayer/render';
import {MediaEditorContextValue} from '@components/mediaEditor/context';
import {MediaEditorFinalResultPayload} from '@components/mediaEditor/finalRender/createFinalResult';

import drawStickerLayer from '@components/mediaEditor/finalRender/drawStickerLayer';
import drawTextLayer from '@components/mediaEditor/finalRender/drawTextLayer';
import drawShapeLayer from '@components/mediaEditor/finalRender/drawShapeLayer';
import {ScaledLayersAndLines} from '@components/mediaEditor/finalRender/getScaledLayersAndLines';
import {getDesktopCropOutputView} from '@components/mediaEditor/native/desktopCropExport';
import {drawDesktopCropBackground, sampleDesktopCropBackground} from '@components/mediaEditor/native/desktopCropBackground';

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
  const {editorState: {stickersLayersInfo}, canImageResultInGIF, dontCreatePreview, imageType = 'image/jpeg', imageQuality} = context;

  ctx.drawImage(imageCanvas, 0, 0);
  ctx.drawImage(brushCanvas, 0, 0);

  const images = await prepareImageLayerDrawing(context, scaledLayers);
  try {
  scaledLayers.forEach((layer) => {
    images.draw(ctx, layer);
    if(layer.type === 'text') drawTextLayer(context, ctx, layer);
    if(layer.type === 'shape') drawShapeLayer(ctx, layer);
    if(layer.type === 'sticker' && (!canImageResultInGIF || layer.sticker?.sticker === StickerType.Static)) {
      const {container} = stickersLayersInfo[layer.id];
      const stickerChild = container?.lastElementChild;

      let ratio: number;
      if(stickerChild instanceof HTMLImageElement) {
        ratio = stickerChild.naturalWidth / stickerChild.naturalHeight;
      } else if(stickerChild instanceof HTMLVideoElement) {
        ratio = stickerChild.videoWidth / stickerChild.videoHeight;
      } else if(stickerChild instanceof HTMLCanvasElement) {
        ratio = stickerChild.width / stickerChild.height;
      } else {
        return;
      }

      drawStickerLayer(context, ctx, layer, stickerChild, ratio);
    }
  });
  } finally {
    images.release();
  }

  const desktop = getDesktopCropOutputView(context, resultCanvas.width, resultCanvas.height);
  if(desktop) {
    const original = context.editorState.renderingPayload?.media.image;
    if(!original) throw new Error('Expanded crop original source unavailable');
    drawDesktopCropBackground(ctx, {x: 0, y: 0, width: resultCanvas.width, height: resultCanvas.height},
      desktop.image, sampleDesktopCropBackground(original));
  }

  // Encode with the caller-supplied format/quality (defaults to JPEG at the
  // browser's default quality). NB canvas.toBlob() defaults to PNG, and a
  // large/detailed image as PNG is ~10MB → the server rejects it as a photo with
  // PHOTO_SAVE_FILE_INVALID; JPEG keeps it small. The caller (e.g. newMedia) decides
  // whether to compress further (heavy photo → lower quality) or stay near-lossless.
  const result = await new Promise<MediaEditorFinalResultPayload>((resolve) =>
    resultCanvas.toBlob(blob => resolve({
      blob,
      hasSound: false
    }), imageType, imageQuality)
  );

  return {
    preview: dontCreatePreview ? undefined : result.blob,
    isVideo: false,
    getResult: () => result
  };
}
