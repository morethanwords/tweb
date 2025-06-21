import {ArrayBufferTarget, Muxer} from 'mp4-muxer';
import {createRoot, createSignal} from 'solid-js';

import deferredPromise, {CancellablePromise} from '../../../helpers/cancellablePromise';
import ListenerSetter from '../../../helpers/listenerSetter';

import {MediaEditorContextValue} from '../context';
import {delay} from '../utils';

import {FRAMES_PER_SECOND, STICKER_SIZE} from './constants';
import drawStickerLayer from './drawStickerLayer';
import drawTextLayer from './drawTextLayer';
import {ScaledLayersAndLines} from './getScaledLayersAndLines';
import ImageStickerFrameByFrameRenderer from './imageStickerFrameByFrameRenderer';
import LottieStickerFrameByFrameRenderer from './lottieStickerFrameByFrameRenderer';
import {StickerFrameByFrameRenderer} from './types';
import VideoStickerFrameByFrameRenderer from './videoStickerFrameByFrameRenderer';
import {animate} from '../../../helpers/animation';


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
  const {editorState: {pixelRatio, renderingPayload}} = context;
  const {media: {video}} = renderingPayload;

  const gifCreationProgress = createRoot(dispose => {
    const signal = createSignal(0);
    return {signal, dispose};
  });

  const [, setProgress] = gifCreationProgress.signal;

  const renderers = new Map<number, StickerFrameByFrameRenderer>();

  let maxFrames = 0;

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
      maxFrames = Math.max(maxFrames, renderer.getTotalFrames());
    })
  );

  if(video?.duration) maxFrames = video.duration * FRAMES_PER_SECOND / 2;
  // maxFrames = Math.min(640, maxFrames);

  const listenerSetter = new ListenerSetter;

  let currentVideoFrameDeferred: CancellablePromise<void>;
  // video.addEventListener('seeked', () => {
  //   currentVideoFrameDeferred?.resolve();
  // });

  if(video) {
    video.pause();
    // video.playbackRate = 0.25;
    if(video.currentTime !== 0) {
      const deferred = deferredPromise<void>();
      video.addEventListener('seeked', () => {
        deferred?.resolve();
      }, {once: true});

      video.currentTime = 0;
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
    bitrate: 8e6
  });
  // 1. remove frame rate
  // 2. dynamic timestamp / duration
  // 3. play/pause

  // const tmpCanvas = document.createElement('canvas');
  // [tmpCanvas.width, tmpCanvas.height] = [scaledWidth, scaledHeight];
  // const tmpCtx = tmpCanvas.getContext('2d');

  let lastTime = 0;

  async function renderFrame(frameNo: number, appendToMuxer = true) {
    console.time('videoFrame' + frameNo);
    if(video) {
      currentVideoFrameDeferred = deferredPromise();
      // video.currentTime = frameNo / FRAMES_PER_SECOND;
      const clb = () => {
        // tmpCtx.clearRect(0, 0, scaledWidth, scaledHeight);
        // tmpCtx.drawImage(video, 0, 0, scaledWidth, scaledHeight);

        video.pause();
        gl.bindTexture(gl.TEXTURE_2D, renderingPayload.texture);
        // gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, video);
        gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, gl.RGBA, gl.UNSIGNED_BYTE, video);
        // video.pause();

        currentVideoFrameDeferred.resolve();
        // requestAnimationFrame(async() => {
        //   console.timeLog('renderFrame' + frameNo, 'seeked video');
        //   console.timeLog('renderFrame' + frameNo, 'loaded texture');
        // });
      };

      if(frameNo === 0) clb();
      else {
        video.requestVideoFrameCallback(clb);
        if(video.paused && appendToMuxer) video.play();
        // requestAnimationFrame(clb);
      }

      // video.play();
      // video.currentTime = frameNo / FRAMES_PER_SECOND * 2;

      await currentVideoFrameDeferred;
      console.timeEnd('videoFrame' + frameNo);
      // gl.bindTexture(gl.TEXTURE_2D, renderingPayload.texture);
      // // gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, video);
      // gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, gl.RGBA, gl.UNSIGNED_BYTE, video);
    }

    const currentTime = frameNo === 0 ? 0 : video.currentTime;

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

    const videoFrame = new VideoFrame(resultCanvas, {
      timestamp
      // duration: 1e6 / FRAMES_PER_SECOND
    });
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
    let skip = 0;

    animate(() => {
      skip = (skip + 1) % 5;
      if(skip) return true;

      if(video.currentTime >= video.duration - 0.0001) {
        done = true;
        currentVideoFrameDeferred.resolve();
      }
      return !done;
    });

    while(video.currentTime < video.duration - 0.0001) {
    // for(let frameNo = 1; frameNo <= maxFrames; frameNo++) {
      // console.log('rendering frameNo', frameNo)
      try {
        await renderFrame(frameNo);
      } catch{
        setProgress(1);
        break;
      }
      setProgress(video.currentTime / video.duration);
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
