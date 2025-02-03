import {useContext} from 'solid-js';

import MediaEditorContext, {StandaloneContext} from '../context';
import {AdjustmentsConfig} from '../adjustments';
import {draw} from '../webgl/draw';
import {initWebGL} from '../webgl/initWebGL';
import BrushPainter from '../canvas/brushPainter';
import {useCropOffset} from '../canvas/useCropOffset';

import getResultSize from './getResultSize';
import getResultTransform from './getResultTransform';
import getScaledLayersAndLines from './getScaledLayersAndLines';
import renderToVideo from './renderToVideo';
import renderToImage from './renderToImage';
import spawnAnimatedPreview from './spawnAnimatedPreview';

export type MediaEditorFinalResult = {
  preview: Blob;
  getResult: () => Blob | Promise<Blob>;
  isGif: boolean;
  width: number;
  height: number;
  originalSrc: string;
  standaloneContext: StandaloneContext;
  animatedPreview?: HTMLImageElement;
};

export async function createFinalResult(standaloneContext: StandaloneContext): Promise<MediaEditorFinalResult> {
  const context = useContext(MediaEditorContext);
  const [resizableLayers] = context.resizableLayers;

  const cropOffset = useCropOffset();

  const hasAnimatedStickers = !!resizableLayers().find((layerSignal) =>
    [2, 3].includes(layerSignal[0]().sticker?.sticker)
  );

  const [scaledWidth, scaledHeight] = getResultSize(hasAnimatedStickers);

  const imageCanvas = document.createElement('canvas');
  imageCanvas.width = scaledWidth;
  imageCanvas.height = scaledHeight;

  const gl = imageCanvas.getContext('webgl', {
    preserveDrawingBuffer: true
  });

  const payload = await initWebGL(gl, context);

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
      context.adjustments.map(({key, signal, to100}) => {
        const value = signal[0]();
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
    standaloneContext
  };
}
