import {getOwner, runWithOwner} from 'solid-js';
import {unwrap} from 'solid-js/store';
import {MediaSize} from '@helpers/mediaSize';
import noop from '@helpers/noop';
import {logger} from '@lib/logger';
import {adjustmentsConfig, AdjustmentsConfig} from '@components/mediaEditor/adjustments';
import BrushPainter from '@components/mediaEditor/canvas/brushPainter';
import {useCropOffset} from '@components/mediaEditor/canvas/useCropOffset';
import {EditingMediaState, useMediaEditorContext} from '@components/mediaEditor/context';
import {NumberPair, StandaloneSignal} from '@components/mediaEditor/types';
import {checkIfHasAnimatedStickers, cleanupWebGl, snapToAvailableQuality} from '@components/mediaEditor/utils';
import {draw} from '@components/mediaEditor/webgl/draw';
import {initWebGL} from '@components/mediaEditor/webgl/initWebGL';
import getResultSize from '@components/mediaEditor/finalRender/getResultSize';
import getResultTransform from '@components/mediaEditor/finalRender/getResultTransform';
import getScaledLayersAndLines from '@components/mediaEditor/finalRender/getScaledLayersAndLines';
import renderToActualVideo from '@components/mediaEditor/finalRender/renderToActualVideo';
import renderToImage from '@components/mediaEditor/finalRender/renderToImage';
import renderToVideoGIF from '@components/mediaEditor/finalRender/renderToVideoGIF';
import spawnAnimatedPreview from '@components/mediaEditor/finalRender/spawnAnimatedPreview';


export type MediaEditorFinalResultPayload = {
  blob: Blob;
  hasSound: boolean;
  thumb?: {
    blob: Blob;
    size: MediaSize;
  }
};

export type MediaEditorFinalResult = {
  preview: Blob;
  getResult: () => MediaEditorFinalResultPayload | Promise<MediaEditorFinalResultPayload>;
  cancel?: () => void;
  isVideo: boolean;
  width: number;
  height: number;
  originalSrc: string;
  originalSize?: NumberPair;
  editingMediaState: EditingMediaState;
  animatedPreview?: HTMLImageElement;
  creationProgress?: StandaloneSignal<number>;
};

const log = logger('MediaEditor.createFinalResult');

export async function createFinalResult(): Promise<MediaEditorFinalResult> {
  const context = useMediaEditorContext();
  const {editorState, mediaState, mediaSrc, mediaType, imageRatio} = context;
  const {resizableLayers, adjustments} = mediaState;

  const owner = getOwner();

  const cropOffset = useCropOffset();

  const hasAnimatedStickers = checkIfHasAnimatedStickers(resizableLayers);

  const willResultInVideo = hasAnimatedStickers || mediaType === 'video';

  const videoType = mediaType === 'video' ? 'video' : hasAnimatedStickers ? 'gif' : undefined;

  const [, maxHeight] = getResultSize({
    imageWidth: editorState.renderingPayload?.media.width,
    newRatio: mediaState.currentImageRatio,
    scale: mediaState.scale,
    videoType,
    imageRatio: imageRatio,
    cropOffset: cropOffset()
  });

  const maxQuality = snapToAvailableQuality(maxHeight);

  const [scaledWidth, scaledHeight] = getResultSize({
    imageWidth: editorState.renderingPayload?.media.width,
    newRatio: mediaState.currentImageRatio,
    scale: mediaState.scale,
    videoType,
    imageRatio,
    cropOffset: cropOffset(),
    quality: willResultInVideo ? Math.min(maxQuality, mediaState.videoQuality) : undefined
  });

  const imageCanvas = document.createElement('canvas');
  imageCanvas.width = scaledWidth;
  imageCanvas.height = scaledHeight;

  const gl = imageCanvas.getContext('webgl', {
    preserveDrawingBuffer: true
  });

  const payload = await initWebGL({gl, mediaSrc, mediaType, videoTime: mediaState.videoCropStart, waitToSeek: false});

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

  const renderPromise = (() => {
    if(mediaType === 'video')
      return runWithOwner(owner, () => renderToActualVideo({
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
      }));

    if(hasAnimatedStickers)
      return runWithOwner(owner, () => renderToVideoGIF({
        scaledWidth,
        scaledHeight,
        scaledLayers,
        imageCanvas,
        resultCanvas,
        brushCanvas,
        ctx
      }));

    return renderToImage({
      context,
      scaledLayers,
      imageCanvas,
      resultCanvas,
      brushCanvas,
      ctx
    });
  })();

  const renderResult = await renderPromise;

  const animatedPreview = await spawnAnimatedPreview({
    context,
    cropOffset,
    scaledWidth,
    scaledHeight,
    previewBlob: renderResult.preview
  });

  Promise.resolve(renderResult.getResult())?.catch(noop)?.finally(() => {
    cleanupWebGl(gl);
    log('cleaning up webgl')
  });

  return {
    ...renderResult,
    animatedPreview,
    width: scaledWidth,
    height: scaledHeight,
    originalSrc: context.mediaSrc,
    originalSize: [payload.media.width, payload.media.height],
    editingMediaState: structuredClone(unwrap(mediaState))
  };
}
