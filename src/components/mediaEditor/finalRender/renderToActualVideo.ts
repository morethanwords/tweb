import {ArrayBufferTarget, Muxer} from 'mp4-muxer';
import {createRoot, createSignal} from 'solid-js';

import {animate} from '../../../helpers/animation';
import deferredPromise, {CancellablePromise} from '../../../helpers/cancellablePromise';
import ListenerSetter from '../../../helpers/listenerSetter';

import {MediaEditorContextValue} from '../context';
import {delay} from '../utils';

import calcBitrate, {BITRATE_TARGET_FPS} from './calcBitrate';
import {FRAMES_PER_SECOND, STICKER_SIZE} from './constants';
import drawStickerLayer from './drawStickerLayer';
import drawTextLayer from './drawTextLayer';
import {ScaledLayersAndLines} from './getScaledLayersAndLines';
import ImageStickerFrameByFrameRenderer from './imageStickerFrameByFrameRenderer';
import LottieStickerFrameByFrameRenderer from './lottieStickerFrameByFrameRenderer';
import {StickerFrameByFrameRenderer} from './types';
import VideoStickerFrameByFrameRenderer from './videoStickerFrameByFrameRenderer';


export type RenderToActualVideoArgs = {
  context: MediaEditorContextValue;
  scaledLayers: ScaledLayersAndLines['scaledLayers'];
  scaledWidth: number;
  scaledHeight: number;
  ctx: CanvasRenderingContext2D;
  imageCanvasGL: WebGLRenderingContext;
  imageCanvas: HTMLCanvasElement;
  drawToImageCanvas: () => void;
  brushCanvas: HTMLCanvasElement;
  resultCanvas: HTMLCanvasElement;
};

const VIDEO_END_MESUREMENT_ERROR = 1 / 120 - 0.0001;
const STICKER_FPS = 30;

const hasAnimatedStickers = true; // TODO: handle this based on browser too

export default async function renderToActualVideo({
  context,
  scaledWidth,
  scaledHeight,
  scaledLayers,
  ctx,
  imageCanvasGL: gl,
  imageCanvas,
  drawToImageCanvas,
  brushCanvas,
  resultCanvas
}: RenderToActualVideoArgs) {
  const {editorState: {pixelRatio, renderingPayload}, mediaState: {videoCropStart, videoCropLength}} = context;
  const {media: {video}} = renderingPayload;

  const startTime = video.duration * videoCropStart;
  const endTime = video.duration * (videoCropStart + videoCropLength);

  const gifCreationProgress = createRoot(dispose => {
    const signal = createSignal(0);
    return {signal, dispose};
  });

  const [, setProgress] = gifCreationProgress.signal;

  const renderers = new Map<number, StickerFrameByFrameRenderer>();

  await Promise.all(
    scaledLayers.map(async(layer) => {
      if(!layer.sticker) return;

      const stickerType = layer.sticker?.sticker;
      let renderer: StickerFrameByFrameRenderer;

      if(stickerType === 1) renderer = new ImageStickerFrameByFrameRenderer();
      if(stickerType === 2) renderer = new LottieStickerFrameByFrameRenderer();
      if(stickerType === 3) renderer = new VideoStickerFrameByFrameRenderer();
      if(!renderer) return;

      renderers.set(layer.id, renderer);
      await renderer.init(layer.sticker!, STICKER_SIZE * layer.scale * pixelRatio);
    })
  );

  const listenerSetter = new ListenerSetter;

  let currentVideoFrameDeferred: CancellablePromise<number>;

  if(video) {
    video.pause();
    // video.playbackRate = 0.25;
    if(video.currentTime !== startTime) {
      const deferred = deferredPromise<void>();
      video.addEventListener('seeked', () => {
        deferred?.resolve();
      }, {once: true});

      video.currentTime = startTime;
      await deferred;
    }
  }

  const muxer = new Muxer({
    target: new ArrayBufferTarget(),
    video: {
      codec: 'avc',
      width: scaledWidth,
      height: scaledHeight
    },
    fastStart: 'in-memory'
  });

  const encoder = new VideoEncoder({
    output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
    error: (e) => console.error(e)
  });

  encoder.configure({
    codec: 'avc1.42001f',
    width: scaledWidth,
    height: scaledHeight,
    bitrate: calcBitrate(scaledWidth, scaledHeight, BITRATE_TARGET_FPS, 1)
  });

  let lastTime = 0;

  async function renderFrame(frameNo: number, appendToMuxer = true) {
    console.time('videoFrame' + frameNo);
    currentVideoFrameDeferred = deferredPromise();

    const callback = (mediaTime: number) => {
      video.pause();
      gl.bindTexture(gl.TEXTURE_2D, renderingPayload.texture);
      gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, gl.RGBA, gl.UNSIGNED_BYTE, video);

      currentVideoFrameDeferred.resolve(mediaTime);
    };

    if(frameNo === 0) callback(0);
    else {
      video.requestVideoFrameCallback((_, {mediaTime}) => void callback(mediaTime));
      if(video.paused && appendToMuxer) video.play();
    }

    const mediaTime = await currentVideoFrameDeferred;
    console.timeEnd('videoFrame' + frameNo);

    const currentTime = frameNo === 0 ? 0 : mediaTime - startTime;

    console.log('[my-debug] additional frame currentTime, lastTime ', currentTime, lastTime);

    // Fill static frame with stickers frames
    if(hasAnimatedStickers) {
      const untilFrame = Math.round(currentTime * STICKER_FPS);
      for(let frame = Math.round(lastTime * STICKER_FPS) + 1; frame < untilFrame; frame++) {
        await renderFrame2(frame / STICKER_FPS * FRAMES_PER_SECOND | 0, frame / STICKER_FPS * 1e6 | 0, true);
      }
    }

    lastTime = currentTime;

    await renderFrame2(currentTime * FRAMES_PER_SECOND | 0, currentTime * 1e6 | 0, appendToMuxer);
  }


  async function renderFrame2(frameNo: number, timestamp: number, appendToMuxer: boolean) {
    console.log('[my-debug] additional frame frameNo, timestamp ', frameNo, timestamp);
    console.time('renderFrame2' + frameNo);

    const promises = Array.from(renderers.values()).map((renderer) =>
      renderer.renderFrame(frameNo % (renderer.getTotalFrames()))
    );
    await Promise.all(promises);

    drawToImageCanvas();
    console.timeLog('renderFrame2' + frameNo, 'drew image to canvas');

    ctx.clearRect(0, 0, scaledWidth, scaledHeight);
    ctx.drawImage(imageCanvas, 0, 0);
    ctx.drawImage(brushCanvas, 0, 0);

    console.timeLog('renderFrame2' + frameNo, 'drew everything to canvas');

    scaledLayers.forEach((layer) => {
      if(layer.type === 'text') drawTextLayer(context, ctx, layer);
      if(layer.type === 'sticker' && renderers.has(layer.id)) {
        const renderer = renderers.get(layer.id);
        drawStickerLayer(context, ctx, layer, renderer.getRenderedFrame(), renderer.getRatio());
      }
    });

    console.timeLog('renderFrame2' + frameNo, 'drew layers');

    if(!appendToMuxer) return;

    const videoFrame = new VideoFrame(resultCanvas, {timestamp});

    encoder.encode(videoFrame);
    videoFrame.close();
    console.timeLog('renderFrame2' + frameNo, 'encoded frame');
    console.timeEnd('renderFrame2' + frameNo);
  }

  setProgress(0);

  await renderFrame(0, false);

  const preview = await new Promise<Blob>((resolve) => resultCanvas.toBlob(resolve));

  const resultPromise = new Promise<Blob>(async(resolve) => {
    await delay(200);
    video.play();

    let frameNo = 0;

    let done = false;

    animate(() => {
      if(video.currentTime >= endTime - 0.0001) {
        done = true;
        currentVideoFrameDeferred.resolve(endTime);
      }
      return !done;
    });

    while(video.currentTime < endTime - 0.0001) {
      await renderFrame(frameNo);
      setProgress((video.currentTime - startTime) / (endTime - startTime));
      frameNo++;
    }
    done = true;

    console.log('[my-debug] before flushing');

    await encoder.flush();
    console.log('[my-debug] flushed');
    muxer.finalize();
    console.log('[my-debug] finalized');

    Array.from(renderers.values()).forEach((renderer) => renderer.destroy());

    listenerSetter.removeAll();

    const {buffer} = muxer.target;

    setProgress(1);

    console.log('[my-debug] before resolve');
    resolve(new Blob([buffer], {type: 'video/mp4'}));
    console.log('[my-debug] resolved');
  });

  let result: Blob;

  resultPromise.then((blob) => (result = blob));

  return {
    preview,
    isGif: true,
    getResult: () => {
      return result ?? resultPromise;
    },
    gifCreationProgress
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
