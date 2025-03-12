import {unwrap} from 'solid-js/store';

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
  const {mediaState, imageSrc} = context;
  const {resizableLayers} = mediaState;
  const {adjustments} = mediaState;

  const cropOffset = useCropOffset();

  const hasAnimatedStickers = !!resizableLayers.find((layer) =>
    [2, 3].includes(layer.sticker?.sticker)
  );

  const [scaledWidth, scaledHeight] = getResultSize(hasAnimatedStickers);

  const imageCanvas = document.createElement('canvas');
  imageCanvas.width = scaledWidth;
  imageCanvas.height = scaledHeight;

  const gl = imageCanvas.getContext('webgl', {
    preserveDrawingBuffer: true
  });

  const payload = await initWebGL(gl, imageSrc);

  const finalTransform = getResultTransform({
    context,
    scaledWidth,
    scaledHeight,
    imageWidth: payload.image.width,
    imageHeight: payload.image.height,
    cropOffset
  });

  draw(gl, payload, {
    ...finalTransform,
    imageSize: [payload.image.width, payload.image.height],
    ...(Object.fromEntries(
      adjustmentsConfig.map(({key, to100}) => {
        const value = adjustments[key];
        return [key, value / (to100 ? 100 : 50)];
      })
    ) as Record<AdjustmentsConfig[number]['key'], number>)
  });

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

  const renderPromise = hasAnimatedStickers ?
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
    originalSrc: context.imageSrc,
    editingMediaState: unwrap(mediaState)
  };
}
