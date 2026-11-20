import {createSignal, getOwner, runWithOwner} from 'solid-js';
import {prepareImageLayerDrawing} from '@components/mediaEditor/imageLayer/render';

import deferredPromise from '@helpers/cancellablePromise';
import noop from '@helpers/noop';

import {useMediaEditorContext} from '@components/mediaEditor/context';
import {delay} from '@components/mediaEditor/utils';

import {FRAMES_PER_SECOND, STICKER_SIZE} from '@components/mediaEditor/finalRender/constants';
import {MediaEditorFinalResultPayload} from '@components/mediaEditor/finalRender/createFinalResult';
import drawStickerLayer from '@components/mediaEditor/finalRender/drawStickerLayer';
import drawTextLayer from '@components/mediaEditor/finalRender/drawTextLayer';
import drawShapeLayer from '@components/mediaEditor/finalRender/drawShapeLayer';
import {generateVideoPreview} from '@components/mediaEditor/finalRender/generateVideoPreview';
import {ScaledLayersAndLines} from '@components/mediaEditor/finalRender/getScaledLayersAndLines';
import {StickerFrameByFrameRenderer} from '@components/mediaEditor/finalRender/types';
import {createEditorDocumentRenderer, prepareEditorGif} from '@components/mediaEditor/animatedDocument';
import {captureDocumentRendererSource} from '@components/mediaEditor/finalRender/documentRendererSource';
import createMp4VideoEncoder from '@components/mediaEditor/finalRender/createMp4VideoEncoder';

type Args = {
  scaledLayers: ScaledLayersAndLines['scaledLayers'];
  scaledWidth: number;
  scaledHeight: number;
  ctx: CanvasRenderingContext2D;
  imageCanvas: HTMLCanvasElement;
  brushCanvas: HTMLCanvasElement;
  resultCanvas: HTMLCanvasElement;
};

export default async function renderToVideoGIF({
  scaledWidth,
  scaledHeight,
  scaledLayers,
  ctx,
  imageCanvas,
  brushCanvas,
  resultCanvas
}: Args) {
  const owner = getOwner();
  const context = useMediaEditorContext();
  const documentSource = captureDocumentRendererSource(context.managers);
  const images = await prepareImageLayerDrawing(context, scaledLayers);

  const {editorState: {pixelRatio}, dontCreatePreview} = context;

  const creationProgress = createSignal(0);
  const [, setProgress] = creationProgress;

  const renderers = new Map<number, StickerFrameByFrameRenderer>();

  let canceled = false;
  let stopped = false;
  let encoder: VideoEncoder | undefined;

  const CANCELED = Symbol('canceled');
  const canceledDeferred = deferredPromise<never>();
  canceledDeferred.catch(noop);

  function throwIfCanceled() {
    if(canceled) throw CANCELED;
  }

  function raceCancel<T>(p: Promise<T>): Promise<T> {
    return Promise.race([p, canceledDeferred]) as Promise<T>;
  }

  async function renderFrame(encoder: VideoEncoder, frameNo: number) {
    const promises = Array.from(renderers.values()).map((renderer) =>
      renderer.renderFrame(frameNo % renderer.getTotalFrames())
    );
    await Promise.all(promises);
    throwIfCanceled();

    ctx.clearRect(0, 0, scaledWidth, scaledHeight);
    ctx.drawImage(imageCanvas, 0, 0);
    ctx.drawImage(brushCanvas, 0, 0);

    scaledLayers.forEach((layer) => {
      images.draw(ctx, layer);
      if(layer.type === 'text') drawTextLayer(context, ctx, layer);
      if(layer.type === 'shape') drawShapeLayer(ctx, layer);
      if(layer.type === 'sticker' && renderers.has(layer.id)) {
        const renderer = renderers.get(layer.id);
        drawStickerLayer(context, ctx, layer, renderer.getRenderedFrame(), renderer.getRatio());
      }
    });

    const videoFrame = new VideoFrame(resultCanvas, {
      timestamp: (frameNo * 1e6) / FRAMES_PER_SECOND,
      duration: 1e6 / FRAMES_PER_SECOND
    });
    encoder.encode(videoFrame);
    videoFrame.close();
  }

  function cleanup() {
    stopped = true;
    try { encoder?.close(); } catch{}
    encoder = undefined;
    Array.from(renderers.values()).forEach((renderer) => {
      try { renderer.destroy(); } catch{}
    });
    renderers.clear();
  }

  function cancel() {
    if(canceled) return;
    canceled = true;
    canceledDeferred.reject(CANCELED);
    cleanup();
  }

  const resultPromise = new Promise<MediaEditorFinalResultPayload>(async(resolve, reject) => {
    try {
      let maxFrames = 0;

      const [mp4Encoder] = await raceCancel(Promise.all([
        createMp4VideoEncoder({width: scaledWidth, height: scaledHeight, frameRate: FRAMES_PER_SECOND}).then(result => {
          if(stopped) { try { result.encoder.close(); } catch{} throw CANCELED; }
          encoder = result.encoder;
          return result;
        }),
        ...scaledLayers.map(async(layer) => {
          if(!layer.sticker) return;

          const blob = layer.sticker.type === 'gif' && !layer.sticker.sticker ?
            await prepareEditorGif(context, layer.sticker, () => !canceled && !stopped) : undefined;
          const renderer = await createEditorDocumentRenderer(layer.sticker, blob, documentSource);
          if(canceled || stopped) { try { renderer.destroy(); } catch{} throw CANCELED; }

          renderers.set(layer.id, renderer);
          await renderer.init(layer.sticker!, STICKER_SIZE * layer.scale * pixelRatio);
          throwIfCanceled();
          maxFrames = Math.max(maxFrames, renderer.getTotalFrames());
        }),
        delay(200)
      ]));
      throwIfCanceled();

      encoder = mp4Encoder.encoder;

      for(let frameNo = 0; frameNo < maxFrames; frameNo++) {
        throwIfCanceled();

        await raceCancel(renderFrame(encoder, frameNo));
        setProgress((frameNo + 1) / maxFrames);
      }

      await raceCancel(encoder.flush());
      throwIfCanceled();
      const blob = await raceCancel(mp4Encoder.finalize());
      throwIfCanceled();

      cleanup();

      resolve({
        blob,
        hasSound: false
      });
    } catch(e) {
      cleanup();
      if(e === CANCELED || canceled) {
        reject(CANCELED);
        return;
      }
      reject(e);
    }
  });

  let result: MediaEditorFinalResultPayload;

  resultPromise.then((value) => (result = value)).finally(images.release).catch(noop);

  let preview: Blob;
  try {
    preview = dontCreatePreview ? undefined : await runWithOwner(owner, () => generateVideoPreview({scaledWidth, scaledHeight}));
  } catch(error) {
    cancel();
    await resultPromise.catch(noop);
    throw error;
  }

  return {
    preview,
    isVideo: true,
    getResult: () => {
      return result ?? resultPromise;
    },
    cancel,
    creationProgress
  };
}
