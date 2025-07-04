import {unwrap} from 'solid-js/store';
import {useCropOffset} from '../canvas/useCropOffset';
import useProcessPoint from '../canvas/useProcessPoint';
import {useMediaEditorContext} from '../context';
import {snapToViewport} from '../utils';
import drawStickerLayer from './drawStickerLayer';
import drawTextLayer from './drawTextLayer';


type Args = {
  scaledWidth: number;
  scaledHeight: number;
};

export async function generateVideoPreview({scaledWidth, scaledHeight}: Args) {
  const context = useMediaEditorContext();

  const {
    editorState: {
      canvasSize: [cw, ch], imageCanvas, brushCanvas, currentTab, stickersLayersInfo, finalTransform: {scale}
    },
    mediaState: {
      resizableLayers, rotation
    }
  } = context;

  const processPoint = useProcessPoint(false);
  const cropOffset = useCropOffset();

  const isCropping = currentTab === 'crop';

  const ratio = scaledWidth / scaledHeight;

  const [previewWidth, previewHeight] = snapToViewport(ratio, isCropping ? cropOffset().width : cw, isCropping ? cropOffset().height : ch);

  const mirrorCanvas = document.createElement('canvas');
  [mirrorCanvas.width, mirrorCanvas.height] = [cw, ch];

  const previewCanvas = document.createElement('canvas');
  [previewCanvas.width, previewCanvas.height] = [previewWidth, previewHeight];


  const previewCtx = previewCanvas.getContext('2d');
  const mirrorCtx = mirrorCanvas.getContext('2d');

  mirrorCtx.drawImage(imageCanvas, 0, 0, cw, ch);
  mirrorCtx.drawImage(brushCanvas, 0, 0, cw, ch);

  const processedLayers = unwrap(resizableLayers).map(layer => ({
    ...layer,
    position: processPoint(layer.position),
    rotation: layer.rotation + rotation,
    scale: layer.scale * scale,
    textInfo: layer.textInfo ? {
      ...layer.textInfo,
      size: layer.textInfo.size * layer.scale * scale
    } : undefined
  }));

  processedLayers.forEach((layer) => {
    if(layer.type === 'text') drawTextLayer(context, mirrorCtx, layer, false);

    if(layer.type === 'sticker') {
      const {container} = stickersLayersInfo[layer.id];
      const stickerChild = container?.lastElementChild;

      let ratio: number;

      if(stickerChild instanceof HTMLImageElement)
        ratio = stickerChild.naturalWidth / stickerChild.naturalHeight;
      else if(stickerChild instanceof HTMLCanvasElement)
        ratio = 1;
      else if(stickerChild instanceof HTMLVideoElement)
        ratio = stickerChild.videoWidth / stickerChild.videoHeight;
      else return;

      drawStickerLayer(context, mirrorCtx, layer, stickerChild, ratio, false);
    }
  });

  if(isCropping) {
    previewCtx.drawImage(
      mirrorCanvas,
      cropOffset().left + (cropOffset().width - previewWidth) / 2, cropOffset().top + (cropOffset().height - previewHeight) / 2, previewWidth, previewHeight,
      0, 0, previewWidth, previewHeight
    );
  } else {
    previewCtx.drawImage(
      mirrorCanvas,
      (cw - previewWidth) / 2, (ch - previewHeight) / 2, previewWidth, previewHeight,
      0, 0, previewWidth, previewHeight
    );
  }

  const previewBlob = await new Promise<Blob>((resolve) => previewCanvas.toBlob(resolve));

  return previewBlob;
}
