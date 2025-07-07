import {createRoot, createSignal, getOwner, runWithOwner} from 'solid-js';
import {animate} from '../../../helpers/animation';
import deferredPromise, {CancellablePromise} from '../../../helpers/cancellablePromise';
import ListenerSetter from '../../../helpers/listenerSetter';
import {MediaSize} from '../../../helpers/mediaSize';
import noop from '../../../helpers/noop';
import clamp from '../../../helpers/number/clamp';
import {logger} from '../../../lib/logger';
import {useMediaEditorContext} from '../context';
import {supportsAudioEncoding} from '../support';
import {delay, snapToViewport} from '../utils';
import {RenderingPayload} from '../webgl/initWebGL';
import calcCodecAndBitrate, {BITRATE_TARGET_FPS} from './calcCodecAndBitrate';
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


type Args = {
  renderingPayload: RenderingPayload;
  hasAnimatedStickers: boolean;
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

const EXPECTED_FPS = 30;
const VIDEO_COMPARISON_ERROR = 0.0001;

const THUMBNAIL_MAX_SIZE = 720;

const log = logger('MediaEditor.createFinalResult.renderToActualVideo');

export default async function renderToActualVideo({
  renderingPayload,
  hasAnimatedStickers,
  scaledWidth,
  scaledHeight,
  scaledLayers,
  ctx,
  imageCanvasGL: gl,
  imageCanvas,
  drawToImageCanvas,
  brushCanvas,
  resultCanvas
}: Args) {
  const context = useMediaEditorContext();

  const {
    editorState: {pixelRatio},
    mediaState: {videoCropStart, videoCropLength, videoMuted, videoThumbnailPosition},
    mediaBlob
  } = context;

  const {media: {video}} = renderingPayload;

  const owner = getOwner();

  video.muted = true;
  const startTime = video.duration * videoCropStart;
  const endTime = video.duration * (videoCropStart + videoCropLength);

  const creationProgress = createRoot(dispose => {
    const signal = createSignal(0);
    return {signal, dispose};
  });

  const [progress, setProgress] = creationProgress.signal;

  const renderers = new Map<number, StickerFrameByFrameRenderer>();

  const thumbnailCanvas = document.createElement('canvas');
  [thumbnailCanvas.width, thumbnailCanvas.height] = snapToViewport(scaledWidth / scaledHeight, Math.min(scaledWidth, THUMBNAIL_MAX_SIZE), Math.min(scaledHeight, THUMBNAIL_MAX_SIZE));
  const thumbnailCtx = thumbnailCanvas.getContext('2d');

  const thumbnailTime = videoThumbnailPosition * video.duration;

  let
    currentVideoFrameDeferred: CancellablePromise<number>,
    encodingPausedDeferred: CancellablePromise<void>,
    lastTime = 0,
    frameCallbackId: number,
    drewThumbnail = false,
    canceled = false,
    progressRAF = 0
  ;

  const listenerSetter = new ListenerSetter;

  listenerSetter.add(window)('focus', () => {
    log('window focus changed', 'focused');
    encodingPausedDeferred?.resolve?.();
    encodingPausedDeferred = undefined;
  });

  listenerSetter.add(window)('blur', () => {
    log('window focus changed', 'blurred');
    encodingPausedDeferred = deferredPromise();
    currentVideoFrameDeferred?.reject(ThrowReason.EncodingPaused);
  });

  async function initMuxerAndEncoder() {
    const {Muxer, ArrayBufferTarget} = await import('mp4-muxer');

    let audioBuffer: AudioBuffer;

    if(!videoMuted && await supportsAudioEncoding()) try {
      audioBuffer = await extractAudioFragment(mediaBlob, startTime, endTime);
    } catch{}

    const muxer = new Muxer({
      target: new ArrayBufferTarget(),
      video: {
        codec: 'avc',
        width: scaledWidth,
        height: scaledHeight
      },
      audio: audioBuffer ? {
        codec: 'opus',
        sampleRate: audioBuffer.sampleRate,
        numberOfChannels: audioBuffer.numberOfChannels
      } : undefined,
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

    return {muxer, encoder, audioBuffer};
  }

  function drawToTexture() {
    gl.bindTexture(gl.TEXTURE_2D, renderingPayload.texture);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, gl.RGBA, gl.UNSIGNED_BYTE, video);
  }

  async function initStickerRenderers() {
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
  }

  enum ThrowReason {
    EncodingPaused,
    TimeLoopback
  };

  async function prepareAndRenderFrame(encoder: VideoEncoder, frameNo: number) {
    currentVideoFrameDeferred = deferredPromise();

    const callback = (mediaTime: number) => {
      drawToTexture();
      video.pause();

      currentVideoFrameDeferred.resolve(mediaTime);
    };

    if(frameNo === 0) callback(0);
    else {
      frameCallbackId = video.requestVideoFrameCallback((_, {mediaTime}) => void callback(mediaTime));
      if(video.paused) await video.play();
    }

    let mediaTime: number;
    try {
      mediaTime = await currentVideoFrameDeferred;
    } catch(e: unknown) {
      video.pause();
      if(e === ThrowReason.EncodingPaused && encodingPausedDeferred) {
        await encodingPausedDeferred;
        log('paused case was playing', lastTime + startTime);
        const deferred = deferredPromise<void>();

        listenerSetter.add(video)('seeked', () => {
          deferred.resolve();
        }, {once: true});

        video.currentTime = lastTime + startTime;

        await deferred;
      }
      throw e;
    }

    const currentTime = frameNo === 0 ? 0 : mediaTime - startTime;
    if(currentTime < lastTime) throw ThrowReason.TimeLoopback;

    // Fill static frame with stickers frames
    if(hasAnimatedStickers) {
      const untilFrame = Math.round(currentTime * EXPECTED_FPS);
      for(let frame = Math.round(lastTime * EXPECTED_FPS) + 1; frame < untilFrame; frame++) {
        await renderFrame({
          frameNo: frame / EXPECTED_FPS * FRAMES_PER_SECOND | 0,
          timestamp: frame / EXPECTED_FPS * 1e6 | 0,
          appendToMuxer: true,
          encoder
        });
      }
    }

    lastTime = currentTime;

    await renderFrame({
      frameNo: currentTime * FRAMES_PER_SECOND | 0,
      timestamp: currentTime * 1e6 | 0,
      appendToMuxer: true,
      encoder
    });

    // Save the thumbnail if it's more or less in the same frame as the current time
    if(!drewThumbnail && thumbnailTime - 0.5 / EXPECTED_FPS <= currentTime && currentTime <= thumbnailTime + 0.5 / EXPECTED_FPS) {
      drewThumbnail = true;
      thumbnailCtx.drawImage(resultCanvas, 0, 0, thumbnailCanvas.width, thumbnailCanvas.height);
    }
  }

  type RenderFrameArgs = {
    frameNo: number;
    timestamp: number;
    appendToMuxer: boolean;
    encoder: VideoEncoder;
  };

  async function renderFrame({frameNo, timestamp, appendToMuxer, encoder}: RenderFrameArgs) {
    const promises = Array.from(renderers.values()).map((renderer) =>
      renderer.renderFrame(frameNo % (renderer.getTotalFrames()))
    );

    await Promise.all(promises);

    drawToImageCanvas();

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

    if(!appendToMuxer) return;

    const videoFrame = new VideoFrame(resultCanvas, {timestamp});

    encoder.encode(videoFrame);
    videoFrame.close();
  }

  function updateProgress(targetProgress: number) {
    const speed = 0.05;
    const currentProgress = progress();

    const delta = targetProgress - currentProgress;

    if(delta < 0.0025) { // fourth of a percent
      setProgress(targetProgress);
      return;
    }

    setProgress(currentProgress + delta * speed);

    progressRAF = requestAnimationFrame(() => updateProgress(targetProgress));
  }

  function cleanup(encoder: VideoEncoder) {
    encoder.close();
    Array.from(renderers.values()).forEach((renderer) => renderer.destroy());
    listenerSetter.removeAll();
    cancelAnimationFrame(progressRAF);
    video.src = '';
    video.load();
  }

  setProgress(0);

  const preview = await runWithOwner(owner, () => generateVideoPreview({scaledWidth, scaledHeight}));

  const resultPromise = new Promise<MediaEditorFinalResultPayload>(async(resolve, reject) => {
    const firstFrameSeekDeferred = deferredPromise<void>();
    video.currentTime = video.duration * videoCropStart;
    video.addEventListener('seeked', () => void firstFrameSeekDeferred.resolve(), {once: true});

    const [{muxer, encoder, audioBuffer}] = await Promise.all([
      initMuxerAndEncoder(),
      delay(200),
      firstFrameSeekDeferred,
      initStickerRenderers()
    ]);

    let frameNo = 0;

    let done = false;

    animate(() => {
      if(encodingPausedDeferred) return true;

      if(video.currentTime >= endTime - VIDEO_COMPARISON_ERROR) {
        done = true;
        currentVideoFrameDeferred.resolve(endTime);
      }
      return !done;
    });

    // let avg = 0, cnt = 0;

    // const startrendering = performance.now();

    while(video.currentTime < endTime - VIDEO_COMPARISON_ERROR) {
      if(canceled) {
        reject();

        done = true;
        video.pause();

        cleanup(encoder);
        return;
      }

      try {
        // const start = performance.now();
        log('prepareAndRenderFrame', frameNo);
        if(encodingPausedDeferred) {
          log('paused case was paused', lastTime + startTime);
          await encodingPausedDeferred;
        }
        await prepareAndRenderFrame(encoder, frameNo);
        // const end = performance.now();
        // const time = end - start;
        // cnt++;
        // avg += (time - avg) / cnt;
      } catch(e: unknown) {
        if(typeof e !== 'number') break;

        if(e === ThrowReason.EncodingPaused) await encodingPausedDeferred;
        else if(e === ThrowReason.TimeLoopback) break;
      }

      updateProgress(clamp((video.currentTime - startTime) / (endTime - startTime), 0, 1));
      frameNo++;
    }

    done = true;
    video.cancelVideoFrameCallback(frameCallbackId);
    video.pause();

    // const endrendering = performance.now();

    if(!drewThumbnail) {
      const deferred = deferredPromise<void>();

      video.addEventListener('seeked', () => {
        deferred.resolve();
      }, {once: true});
      video.currentTime = thumbnailTime;

      await Promise.race([deferred, delay(2_000)]); // just in case you know

      drawToTexture();
      await renderFrame({frameNo: 0, timestamp: 0, appendToMuxer: false, encoder});

      thumbnailCtx.drawImage(resultCanvas, 0, 0, thumbnailCanvas.width, thumbnailCanvas.height);
    }

    if(audioBuffer) await encodeAndMuxAudio(audioBuffer, (chunk) => muxer.addAudioChunk(chunk));

    await encoder.flush();

    muxer.finalize();

    cleanup(encoder);

    const {buffer} = muxer.target;

    setProgress(1);

    const thumbBlob = await new Promise<Blob>(resolve => thumbnailCanvas.toBlob(resolve));

    resolve({
      blob: new Blob([buffer], {type: 'video/mp4'}),
      hasSound: !!audioBuffer,
      thumb: {
        blob: thumbBlob,
        size: new MediaSize(thumbnailCanvas.width, thumbnailCanvas.height)
      }
    });

    // alert(JSON.stringify({
    //   avg,
    //   total: endrendering - startrendering,
    //   frameNo,
    //   duration: video.duration
    // }, null, 2));
  });

  let result: MediaEditorFinalResultPayload;

  resultPromise.then((value) => (result = value)).catch(noop);

  return {
    preview,
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

async function extractAudioFragment(blob: Blob, startTime: number, endTime: number) {
  const audioContext: AudioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
  const arrayBuffer = await blob.arrayBuffer();
  const fullAudioBuffer = await audioContext.decodeAudioData(arrayBuffer);

  const sampleRate = fullAudioBuffer.sampleRate;
  const startSample = Math.floor(startTime * sampleRate);
  const endSample = Math.floor(endTime * sampleRate);
  const frameCount = endSample - startSample;

  const numChannels = fullAudioBuffer.numberOfChannels;

  const fragmentBuffer = audioContext.createBuffer(numChannels, frameCount, sampleRate);

  for(let ch = 0; ch < numChannels; ch++) {
    const fullData = fullAudioBuffer.getChannelData(ch);
    fragmentBuffer.copyToChannel(fullData.subarray(startSample, endSample), ch);
  }

  return fragmentBuffer;
}

async function encodeAndMuxAudio(audioBuffer: AudioBuffer, onChunk: (ch: EncodedAudioChunk) => void) {
  const sampleRate = audioBuffer.sampleRate;
  const numChannels = audioBuffer.numberOfChannels;
  const totalFrames = audioBuffer.length;


  // Interleave audio for WebCodecs
  const interleaved = new Float32Array(totalFrames * numChannels);
  for(let ch = 0; ch < numChannels; ch++) {
    const channelData = audioBuffer.getChannelData(ch);
    for(let i = 0; i < totalFrames; i++) {
      interleaved[i * numChannels + ch] = channelData[i];
    }
  }

  const encoder = new AudioEncoder({
    output: onChunk,
    error: (e) => console.error('AudioEncoder error:', e)
  });

  encoder.configure({
    codec: 'opus',
    sampleRate,
    numberOfChannels: audioBuffer.numberOfChannels,
    bitrate: 128000
  });

  const audioData = new AudioData({
    format: 'f32',
    sampleRate,
    numberOfFrames: audioBuffer.duration * audioBuffer.sampleRate,
    numberOfChannels: audioBuffer.numberOfChannels,
    timestamp: 0,
    data: interleaved
  });

  encoder.encode(audioData);
  audioData.close();

  await encoder.flush();
  encoder.close();
}
