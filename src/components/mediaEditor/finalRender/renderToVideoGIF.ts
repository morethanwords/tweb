import {createSignal, getOwner, runWithOwner} from 'solid-js';

import deferredPromise from '@helpers/cancellablePromise';
import noop from '@helpers/noop';

import {useMediaEditorContext} from '@components/mediaEditor/context';
import {delay} from '@components/mediaEditor/utils';

import {FRAMES_PER_SECOND, STICKER_SIZE} from '@components/mediaEditor/finalRender/constants';
import {MediaEditorFinalResultPayload} from '@components/mediaEditor/finalRender/createFinalResult';
import drawStickerLayer from '@components/mediaEditor/finalRender/drawStickerLayer';
import drawTextLayer from '@components/mediaEditor/finalRender/drawTextLayer';
import {generateVideoPreview} from '@components/mediaEditor/finalRender/generateVideoPreview';
import {ScaledLayersAndLines} from '@components/mediaEditor/finalRender/getScaledLayersAndLines';
import ImageStickerFrameByFrameRenderer from '@components/mediaEditor/finalRender/imageStickerFrameByFrameRenderer';
import LottieStickerFrameByFrameRenderer from '@components/mediaEditor/finalRender/lottieStickerFrameByFrameRenderer';
import {StickerFrameByFrameRenderer} from '@components/mediaEditor/finalRender/types';
import VideoStickerFrameByFrameRenderer from '@components/mediaEditor/finalRender/videoStickerFrameByFrameRenderer';
import createMp4VideoEncoder from '@components/mediaEditor/finalRender/createMp4VideoEncoder';
import StickerType from '@config/stickerType';

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

  const {editorState: {pixelRatio}, dontCreatePreview} = context;

  const creationProgress = createSignal(0);
  const [, setProgress] = creationProgress;

  const renderers = new Map<number, StickerFrameByFrameRenderer>();

  let canceled = false;

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
      renderer.renderFrame(frameNo % (renderer.getTotalFrames() + 1))
    );
    await Promise.all(promises);

    ctx.clearRect(0, 0, scaledWidth, scaledHeight);
    ctx.drawImage(imageCanvas, 0, 0);
    ctx.drawImage(brushCanvas, 0, 0);

    scaledLayers.forEach((layer) => {
      if(layer.type === 'text') drawTextLayer(context, ctx, layer);
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

  function cleanup(encoder: VideoEncoder) {
    encoder.close();
    Array.from(renderers.values()).forEach((renderer) => renderer.destroy());
  }

  const resultPromise = new Promise<MediaEditorFinalResultPayload>(async(resolve, reject) => {
    let encoder: VideoEncoder | undefined;

    const finishCanceled = () => {
      if(encoder) {
        try { cleanup(encoder); } catch{}
      } else {
        Array.from(renderers.values()).forEach((renderer) => {
          try { renderer.destroy(); } catch{}
        });
      }
      reject(CANCELED);
    };

    try {
      let maxFrames = 0;

      const [mp4Encoder] = await raceCancel(Promise.all([
        createMp4VideoEncoder({width: scaledWidth, height: scaledHeight, frameRate: FRAMES_PER_SECOND}),
        ...scaledLayers.map(async(layer) => {
          if(!layer.sticker) return;

          const stickerType = layer.sticker?.sticker;
          let renderer: StickerFrameByFrameRenderer;

          if(stickerType === StickerType.Static) renderer = new ImageStickerFrameByFrameRenderer();
          if(stickerType === StickerType.Lottie) renderer = new LottieStickerFrameByFrameRenderer();
          if(stickerType === StickerType.WebM) renderer = new VideoStickerFrameByFrameRenderer();
          if(!renderer) return;

          renderers.set(layer.id, renderer);
          await renderer.init(layer.sticker!, STICKER_SIZE * layer.scale * pixelRatio);
          maxFrames = Math.max(maxFrames, renderer.getTotalFrames());
        }),
        delay(200)
      ]));
      throwIfCanceled();

      encoder = mp4Encoder.encoder;

      for(let frameNo = 0; frameNo <= maxFrames; frameNo++) {
        throwIfCanceled();

        await raceCancel(renderFrame(encoder, frameNo));
        setProgress(frameNo / maxFrames);
      }

      await raceCancel(encoder.flush());
      throwIfCanceled();
      const blob = mp4Encoder.finalize();

      cleanup(encoder);

      resolve({
        blob,
        hasSound: false
      });
    } catch(e) {
      if(e === CANCELED || canceled) {
        finishCanceled();
        return;
      }
      reject(e);
    }
  });

  let result: MediaEditorFinalResultPayload;

  resultPromise.then((value) => (result = value)).catch(noop);

  return {
    preview: dontCreatePreview ? undefined : await runWithOwner(owner, () => generateVideoPreview({scaledWidth, scaledHeight})),
    isVideo: true,
    getResult: () => {
      return result ?? resultPromise;
    },
    cancel: () => {
      if(canceled) return;
      canceled = true;
      canceledDeferred.reject(CANCELED);
    },
    creationProgress
  };
}
