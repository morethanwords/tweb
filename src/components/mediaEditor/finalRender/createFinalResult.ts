import {unwrap} from 'solid-js/store';

import {IS_FIREFOX} from '../../../environment/userAgent';

import {useCropOffset} from '../canvas/useCropOffset';
import BrushPainter from '../canvas/brushPainter';
import {adjustmentsConfig, AdjustmentsConfig} from '../adjustments';
import {EditingMediaState, useMediaEditorContext} from '../context';
import {initWebGL} from '../webgl/initWebGL';
import {StandaloneSignal} from '../types';
import {draw} from '../webgl/draw';

import getScaledLayersAndLines from './getScaledLayersAndLines';
import spawnAnimatedPreview from './spawnAnimatedPreview';
import getResultTransform from './getResultTransform';
import getResultSize from './getResultSize';
import renderToVideo from './renderToVideo';
import renderToImage from './renderToImage';
import renderToActualVideo from './renderToActualVideo';


export type MediaEditorFinalResult = {
  preview: Blob;
  getResult: () => Blob | Promise<Blob>;
  isGif: boolean;
  width: number;
  height: number;
  originalSrc: string;
  editingMediaState: EditingMediaState;
  animatedPreview?: HTMLImageElement;
  gifCreationProgress?: StandaloneSignal<number>;
};

export async function createFinalResult(): Promise<MediaEditorFinalResult> {
  const context = useMediaEditorContext();
  const {mediaState, mediaSrc, mediaType} = context;
  const {resizableLayers, adjustments} = mediaState;

  const cropOffset = useCropOffset();

  const hasAnimatedStickers = !!resizableLayers.find((layer) => {
    const stickerType = layer.sticker?.sticker;
    return stickerType === 2 || (!IS_FIREFOX && stickerType === 3);
  });

  const willResultInVideo = hasAnimatedStickers || mediaType === 'video';

  const [scaledWidth, scaledHeight] = getResultSize(willResultInVideo);

  const imageCanvas = document.createElement('canvas');
  imageCanvas.width = scaledWidth;
  imageCanvas.height = scaledHeight;

  const gl = imageCanvas.getContext('webgl', {
    preserveDrawingBuffer: true
  });

  const payload = await initWebGL({gl, mediaSrc, mediaType, videoTime: mediaState.videoCropStart});

  const finalTransform = getResultTransform({
    context,
    scaledWidth,
    scaledHeight,
    imageWidth: payload.media.width,
    imageHeight: payload.media.height,
    cropOffset
  });

  const drawToImageCanvas = () => {
    draw(gl, payload, {
      ...finalTransform,
      imageSize: [payload.media.width, payload.media.height],
      ...(Object.fromEntries(
        adjustmentsConfig.map(({key, to100}) => {
          const value = adjustments[key];
          return [key, value / (to100 ? 100 : 50)];
        })
      ) as Record<AdjustmentsConfig[number]['key'], number>)
    });
  };

  if(mediaType === 'image') drawToImageCanvas();

  const {scaledLayers, scaledLines} = getScaledLayersAndLines(context, finalTransform, scaledWidth, scaledHeight);

  const brushCanvas = document.createElement('canvas');
  brushCanvas.width = scaledWidth;
  brushCanvas.height = scaledHeight;

  const brushPainter = new BrushPainter({targetCanvas: brushCanvas, imageCanvas});
  brushPainter.saveLastLine();
  scaledLines.forEach((line) => brushPainter.drawLine(line));

  const resultCanvas = document.createElement('canvas');
  resultCanvas.width = scaledWidth;
  resultCanvas.height = scaledHeight;
  const ctx = resultCanvas.getContext('2d', {willReadFrequently: true});

  const renderPromise = mediaType === 'video' ?
    renderToActualVideo({
      context,
      renderingPayload: payload,
      hasAnimatedStickers,
      scaledWidth,
      scaledHeight,
      scaledLayers,
      imageCanvasGL: gl,
      imageCanvas,
      drawToImageCanvas,
      resultCanvas,
      brushCanvas,
      ctx
    }) : hasAnimatedStickers ?
    renderToVideo({
      context,
      scaledWidth,
      scaledHeight,
      scaledLayers,
      imageCanvas,
      resultCanvas,
      brushCanvas,
      ctx
    }) :
    renderToImage({
      context,
      scaledLayers,
      imageCanvas,
      resultCanvas,
      brushCanvas,
      ctx
    });

  const renderResult = await renderPromise;

  const animatedPreview = await spawnAnimatedPreview({
    context,
    cropOffset,
    scaledWidth,
    scaledHeight,
    previewBlob: renderResult.preview
  })

  return {
    ...renderResult,
    animatedPreview,
    width: scaledWidth,
    height: scaledHeight,
    originalSrc: context.mediaSrc,
    editingMediaState: structuredClone(unwrap(mediaState))
  };
}
