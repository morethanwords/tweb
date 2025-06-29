import {createRoot, createSignal, getOwner, runWithOwner} from 'solid-js';

import noop from '../../../helpers/noop';

import {useMediaEditorContext} from '../context';
import {delay} from '../utils';

import {FRAMES_PER_SECOND, STICKER_SIZE} from './constants';
import {MediaEditorFinalResultPayload} from './createFinalResult';
import drawStickerLayer from './drawStickerLayer';
import drawTextLayer from './drawTextLayer';
import {generateVideoPreview} from './generateVideoPreview';
import {ScaledLayersAndLines} from './getScaledLayersAndLines';
import ImageStickerFrameByFrameRenderer from './imageStickerFrameByFrameRenderer';
import LottieStickerFrameByFrameRenderer from './lottieStickerFrameByFrameRenderer';
import {StickerFrameByFrameRenderer} from './types';
import VideoStickerFrameByFrameRenderer from './videoStickerFrameByFrameRenderer';
import calcCodecAndBitrate, {BITRATE_TARGET_FPS} from './calcCodecAndBitrate';

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

  const {editorState: {pixelRatio}} = context;

  const creationProgress = createRoot(dispose => {
    const signal = createSignal(0);
    return {signal, dispose};
  });

  const [, setProgress] = creationProgress.signal;

  const renderers = new Map<number, StickerFrameByFrameRenderer>();

  let canceled = false;

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
    let maxFrames = 0;

    const [{ArrayBufferTarget, Muxer}] = await Promise.all([
      import('mp4-muxer'),
      ...scaledLayers.map(async(layer) => {
        if(!layer.sticker) return;

        const stickerType = layer.sticker?.sticker;
        let renderer: StickerFrameByFrameRenderer;

        if(stickerType === 1) renderer = new ImageStickerFrameByFrameRenderer();
        if(stickerType === 2) renderer = new LottieStickerFrameByFrameRenderer();
        if(stickerType === 3) renderer = new VideoStickerFrameByFrameRenderer();
        if(!renderer) return;

        renderers.set(layer.id, renderer);
        await renderer.init(layer.sticker!, STICKER_SIZE * layer.scale * pixelRatio);
        maxFrames = Math.max(maxFrames, renderer.getTotalFrames());
      }),
      delay(200)
    ]);

    const muxer = new Muxer({
      target: new ArrayBufferTarget(),
      video: {
        codec: 'avc',
        width: scaledWidth,
        height: scaledHeight,
        frameRate: FRAMES_PER_SECOND
      },
      fastStart: 'in-memory'
    });

    const encoder = new VideoEncoder({
      output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
      error: (e) => console.error(e)
    });

    encoder.configure({
      width: scaledWidth,
      height: scaledHeight,
      ...calcCodecAndBitrate(scaledWidth, scaledHeight, BITRATE_TARGET_FPS)
    });

    for(let frameNo = 0; frameNo <= maxFrames; frameNo++) {
      if(canceled) {
        reject();
        cleanup(encoder);
      }

      await renderFrame(encoder, frameNo);
      setProgress(frameNo / maxFrames);
    }

    await encoder.flush();
    muxer.finalize();

    cleanup(encoder);

    const {buffer} = muxer.target;
    resolve({
      blob: new Blob([buffer], {type: 'video/mp4'}),
      hasSound: false
    });
  });

  let result: MediaEditorFinalResultPayload;

  resultPromise.then((value) => (result = value)).catch(noop);

  return {
    preview: await runWithOwner(owner, () => generateVideoPreview({scaledWidth, scaledHeight})),
    isVideo: true,
    getResult: () => {
      return result ?? resultPromise;
    },
    cancel: () => {
      canceled = true;
    },
    creationProgress
  };

  // const div = document.createElement('div')
  // div.style.position = 'fixed';
  // div.style.zIndex = '1000';
  // div.style.top = '50%';
  // div.style.left = '50%';
  // div.style.transform = 'translate(-50%, -50%)';
  // const img = document.createElement('video')
  // img.src = URL.createObjectURL(blob)
  // img.controls = true
  // img.autoplay = true
  // img.loop = true
  // img.style.maxWidth = '450px'
  // div.append(img)
  // document.body.append(div)
}
