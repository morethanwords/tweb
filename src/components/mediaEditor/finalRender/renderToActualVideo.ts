import {ArrayBufferTarget, Muxer} from 'mp4-muxer';
import {createRoot, createSignal, getOwner, runWithOwner} from 'solid-js';

import {animate} from '../../../helpers/animation';
import deferredPromise, {CancellablePromise} from '../../../helpers/cancellablePromise';
import ListenerSetter from '../../../helpers/listenerSetter';
import {MediaSize} from '../../../helpers/mediaSize';
import clamp from '../../../helpers/number/clamp';

import {MediaEditorContextValue} from '../context';
import {delay, snapToViewport} from '../utils';
import {RenderingPayload} from '../webgl/initWebGL';

import calcBitrate, {BITRATE_TARGET_FPS} from './calcBitrate';
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


export type RenderToActualVideoArgs = {
  context: MediaEditorContextValue;
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

const THUMBNAIL_MAX_SIZE = 400;

export default async function renderToActualVideo({
  context,
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
}: RenderToActualVideoArgs) {
  const {editorState: {pixelRatio}, mediaState: {videoCropStart, videoCropLength, videoMuted, videoThumbnailPosition}, mediaBlob} = context;
  const {media: {video}} = renderingPayload;

  const owner = getOwner();

  video.muted = true;
  const startTime = video.duration * videoCropStart;
  const endTime = video.duration * (videoCropStart + videoCropLength);

  const gifCreationProgress = createRoot(dispose => {
    const signal = createSignal(0);
    return {signal, dispose};
  });

  const [, setProgress] = gifCreationProgress.signal;

  const renderers = new Map<number, StickerFrameByFrameRenderer>();

  const thumbnailCanvas = document.createElement('canvas');
  [thumbnailCanvas.width, thumbnailCanvas.height] = snapToViewport(scaledWidth / scaledHeight, THUMBNAIL_MAX_SIZE, THUMBNAIL_MAX_SIZE);
  const thumbnailCtx = thumbnailCanvas.getContext('2d');

  const thumbnailTime = videoThumbnailPosition * video.duration;
  let drewThumbnail = false;

  const listenerSetter = new ListenerSetter;

  let currentVideoFrameDeferred: CancellablePromise<number>;

  let audioBuffer: AudioBuffer;

  if(!videoMuted) try {
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
    codec: 'avc1.42001f',
    width: scaledWidth,
    height: scaledHeight,
    bitrate: calcBitrate(scaledWidth, scaledHeight, BITRATE_TARGET_FPS, 1)
  });

  let lastTime = 0, frameCallbackId: number;

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

  async function renderFrame(frameNo: number, appendToMuxer = true) {
    currentVideoFrameDeferred = deferredPromise();

    const callback = (mediaTime: number) => {
      drawToTexture();
      video.pause();

      currentVideoFrameDeferred.resolve(mediaTime);
    };

    if(frameNo === 0) callback(0);
    else {
      frameCallbackId = video.requestVideoFrameCallback((_, {mediaTime}) => void callback(mediaTime));
      if(video.paused && appendToMuxer) video.play();
    }

    const mediaTime = await currentVideoFrameDeferred;

    const currentTime = frameNo === 0 ? 0 : mediaTime - startTime;

    // Fill static frame with stickers frames
    if(hasAnimatedStickers) {
      const untilFrame = Math.round(currentTime * EXPECTED_FPS);
      for(let frame = Math.round(lastTime * EXPECTED_FPS) + 1; frame < untilFrame; frame++) {
        await renderFrame2(frame / EXPECTED_FPS * FRAMES_PER_SECOND | 0, frame / EXPECTED_FPS * 1e6 | 0, true);
      }
    }

    lastTime = currentTime;

    await renderFrame2(currentTime * FRAMES_PER_SECOND | 0, currentTime * 1e6 | 0, appendToMuxer);

    // Save the thumbnail if it's more or less in the same frame as the current time
    if(!drewThumbnail && thumbnailTime - 0.5 / EXPECTED_FPS <= currentTime && currentTime <= thumbnailTime + 0.5 / EXPECTED_FPS) {
      drewThumbnail = true;
      thumbnailCtx.drawImage(resultCanvas, 0, 0, thumbnailCanvas.width, thumbnailCanvas.height);
    }
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

  const preview = await runWithOwner(owner, () => generateVideoPreview({scaledWidth, scaledHeight}));

  const resultPromise = new Promise<MediaEditorFinalResultPayload>(async(resolve) => {
    const firstFrameSeekDeferred = deferredPromise<void>();
    video.currentTime = video.duration * videoCropStart;
    video.addEventListener('seeked', () => void firstFrameSeekDeferred.resolve(), {once: true});

    await Promise.all([delay(200), firstFrameSeekDeferred, initStickerRenderers()]);

    let frameNo = 0;

    let done = false;

    animate(() => {
      if(video.currentTime >= endTime - VIDEO_COMPARISON_ERROR) {
        done = true;
        currentVideoFrameDeferred.resolve(endTime);
      }
      return !done;
    });

    while(video.currentTime < endTime - VIDEO_COMPARISON_ERROR) {
      await renderFrame(frameNo);
      setProgress(clamp((video.currentTime - startTime) / (endTime - startTime), 0, 1));
      frameNo++;
    }
    done = true;
    video.cancelVideoFrameCallback(frameCallbackId);
    video.pause();

    if(!drewThumbnail) {
      const deferred = deferredPromise<void>();

      video.addEventListener('seeked', () => {
        deferred.resolve();
      }, {once: true});
      video.currentTime = thumbnailTime;

      await Promise.race([deferred, delay(2_000)]); // just in case you know

      drawToTexture();
      await renderFrame2(0, 0, false);
      thumbnailCtx.drawImage(resultCanvas, 0, 0, thumbnailCanvas.width, thumbnailCanvas.height);
    }


    console.log('[my-debug] before flushing');

    if(audioBuffer) await encodeAndMuxAudio(audioBuffer, (chunk) => muxer.addAudioChunk(chunk));

    await encoder.flush();

    console.log('[my-debug] flushed');
    muxer.finalize();
    console.log('[my-debug] finalized');

    Array.from(renderers.values()).forEach((renderer) => renderer.destroy());

    listenerSetter.removeAll();

    const {buffer} = muxer.target;

    setProgress(1);

    const thumbBlob = await new Promise<Blob>(resolve => thumbnailCanvas.toBlob(resolve));

    console.log('[my-debug] before resolve');
    resolve({
      blob: new Blob([buffer], {type: 'video/mp4'}),
      thumb: {
        blob: thumbBlob,
        size: new MediaSize(thumbnailCanvas.width, thumbnailCanvas.height)
      }
    });
    console.log('[my-debug] resolved');
  });

  let result: MediaEditorFinalResultPayload;

  resultPromise.then((value) => (result = value));

  return {
    preview,
    isVideo: true,
    hasSound: !!audioBuffer,
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

async function extractAudioFragment(blob: Blob, startTime: number, endTime: number) {
  const audioContext: AudioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
  const arrayBuffer = await blob.arrayBuffer();
  const fullAudioBuffer = await audioContext.decodeAudioData(arrayBuffer);

  const sampleRate = fullAudioBuffer.sampleRate;
  const startSample = Math.floor(startTime * sampleRate);
  const endSample = Math.floor(endTime * sampleRate);
  const frameCount = endSample - startSample;

  const numChannels = fullAudioBuffer.numberOfChannels;

  console.log('[my-debug] fullAudioBuffer.numberOfChannels :>> ', fullAudioBuffer.numberOfChannels);

  const fragmentBuffer = audioContext.createBuffer(numChannels, frameCount, sampleRate);

  for(let ch = 0; ch < numChannels; ch++) {
    const fullData = fullAudioBuffer.getChannelData(ch);
    fragmentBuffer.copyToChannel(fullData.subarray(startSample, endSample), ch);
  }

  return fragmentBuffer;
}

// TODO: Delete this thing, used for test
async function extractAudioFragmentNoise(blob: Blob, startTime: number, endTime: number) {
  const audioContext: AudioContext = new (window.AudioContext || (window as any).webkitAudioContext)();

  const sampleRate = audioContext.sampleRate;
  // const startSample = Math.floor(startTime * sampleRate);
  // const endSample = Math.floor(endTime * sampleRate);
  // const frameCount = endSample - startSample;

  const myArrayBuffer = audioContext.createBuffer(
    2,
    audioContext.sampleRate * (endTime - startTime),
    audioContext.sampleRate,
  );

  // Fill the buffer with white noise;
  // just random values between -1.0 and 1.0
  for(let channel = 0; channel < myArrayBuffer.numberOfChannels; channel++) {
    // This gives us the actual ArrayBuffer that contains the data
    const nowBuffering = myArrayBuffer.getChannelData(channel);
    for(let i = 0; i < myArrayBuffer.length; i++) {
      // Math.random() is in [0; 1.0]
      // audio needs to be in [-1.0; 1.0]
      nowBuffering[i] = Math.random() * 2 - 1;
    }
  }

  return myArrayBuffer;
}

async function encodeAndMuxAudio(audioBuffer: AudioBuffer, onChunk: (ch: EncodedAudioChunk) => void) {
  const sampleRate = audioBuffer.sampleRate;
  const numChannels = audioBuffer.numberOfChannels;
  const totalFrames = audioBuffer.length;


  console.log('[my-debug] audioBuffer.numberOfChannels :>> ', audioBuffer.numberOfChannels);

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
    // (chunk) => {
    //   encodedChunks.push(chunk);
    // },
    error: (e) => console.error('AudioEncoder error:', e)
  });

  console.log('[my-debug] configure channel :>> ', {
    sampleRate,
    numberOfChannels: numChannels,
    numberOfFrames: totalFrames,
    expectedLength: totalFrames * numChannels,
    actualLength: interleaved.length,
    byteLength: interleaved.byteLength
  });

  // TODO: Need to check support for this thing and fallback to other codecs
  const supported = await AudioEncoder.isConfigSupported({
    codec: 'opus',
    sampleRate,
    numberOfChannels: audioBuffer.numberOfChannels,
    bitrate: 128000
  });

  console.log('audio encoder supported config', supported)

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

  console.log('[my-debug] audioData.numberOfChannels', audioData.numberOfChannels);


  encoder.encode(audioData);
  await encoder.flush();
}
