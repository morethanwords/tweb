import {createSignal, type Signal} from 'solid-js';
import type {NativeVideoDecision} from '@components/mediaEditor/native/nativeVideoSession';
import type {MediaEditorFinalResultPayload} from '@components/mediaEditor/finalRender/createFinalResult';
import {MediaSize} from '@helpers/mediaSize';
import noop from '@helpers/noop';
import deferredPromise from '@helpers/cancellablePromise';
import scaleMediaElement from '@helpers/canvas/scaleMediaElement';
import {nativeVideoSamples} from '@components/mediaEditor/finalRender/nativeVideoSamples';

export {nativeVideoFrameSchedule} from '@components/mediaEditor/finalRender/nativeVideoSamples';

export type ReadyNativeVideoDecision = Extract<NativeVideoDecision, {status: 'ready'}>;

/** Supported native subset: ordinary, full-frame, unrotated, absent/omitted
 * audio. Decode on the explicit plan clock, not requestVideoFrameCallback's
 * playback clock (which can skip frames under load). Legacy export is untouched.
 */
export default async function renderNativeVideo(blob: Blob, decision: ReadyNativeVideoDecision, dontCreatePreview: boolean, videoThumbnailPosition = 0) {
  const {Input, BlobSource, MP4, QTFF, MATROSKA, WEBM, VideoSampleSink, Output, Mp4OutputFormat, BufferTarget, EncodedVideoPacketSource, EncodedPacket} = await import('mediabunny');
  const {plan, config, source} = decision;
  if(source.color?.status !== 'sdr') throw new Error('Native video requires known SDR colours');
  if(plan.candidate.audio.action !== 'omit' || plan.candidate.outputRotation !== 0) throw new Error('Unsupported native video contract');
  const [width, height] = plan.candidate.encoderSize;
  const fps = plan.candidate.fps.value;
  const duration = source.duration;
  const input = new Input({source: new BlobSource(blob), formats: [MP4, QTFF, MATROSKA, WEBM]});
  const output = new Output({format: new Mp4OutputFormat({fastStart: 'in-memory'}), target: new BufferTarget()});
  const packets = new EncodedVideoPacketSource('avc');
  output.addVideoTrack(packets, {frameRate: fps});
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const paint = canvas.getContext('2d');
  const [progress, setProgress] = createSignal(0);
  const preview = deferredPromise<Blob>();
  preview.catch(noop);
  let canceled = false;
  let encoder: VideoEncoder;
  const check = () => { if(canceled) throw new DOMException('Native video export cancelled', 'AbortError'); };
  const resultPromise = (async(): Promise<MediaEditorFinalResultPayload> => {
    let failure: Error;
    let writes: Promise<unknown> = Promise.resolve();
    try {
      check();
      const track = await input.getPrimaryVideoTrack();
      if(!track || !await track.canDecode()) throw new Error('Source video decoder unavailable');
      check();
      const sink = new VideoSampleSink(track);
      // Cover is a source-time selection, not the first scheduled output frame.
      // Decode it once, draw at the plan's output geometry and reuse the same
      // scaled blob for both preview and final thumbnail.
      const coverTime = Math.min(Math.max(0, videoThumbnailPosition), 1) * duration;
      const cover = await sink.getSample(Math.min(coverTime, Math.max(0, duration - 1e-6)));
      if(!cover) throw new Error('Video cover unavailable');
      try {
        check();
        cover.draw(paint, 0, 0, width, height);
      } finally {
        cover.close();
      }
      const thumb = await scaleMediaElement({
        media: canvas, mediaSize: new MediaSize(width, height),
        boxSize: new MediaSize(Math.min(width, 720), Math.min(height, 720)), quality: .9
      });
      check();
      preview.resolve(thumb.blob);
      await output.start();
      encoder = new VideoEncoder({
        output(chunk, meta) {
          writes = writes.then(() => packets.add(EncodedPacket.fromEncodedChunk(chunk), meta));
          writes.catch(noop);
        },
        error(error) { failure = error; }
      });
      encoder.configure(config);
      let index = 0;
      for await (const {sample, timestamp, duration: frameDuration} of nativeVideoSamples(sink, duration, fps, check)) {
        check();
        if(failure) throw failure;
        sample.draw(paint, 0, 0, width, height);
        const frame = new VideoFrame(canvas, {timestamp, duration: frameDuration});
        try {
          encoder.encode(frame, {keyFrame: index === 0});
        } finally {
          frame.close();
        }
        index++;
        if(encoder.encodeQueueSize >= 4) {
          await encoder.flush();
        }
        // A fast encoder can keep encodeQueueSize low while mux writes lag.
        // Drain the packets already delivered as well as bounding encode work.
        await writes;
        setProgress(Math.min(.99, (timestamp + frameDuration) / (duration * 1e6)));
      }
      check();
      if(!index) throw new Error('Incomplete source video');
      await encoder.flush();
      if(failure) throw failure;
      await writes;
      check();
      await output.finalize();
      check();
      setProgress(1);
      return {
        blob: new Blob([output.target.buffer], {type: 'video/mp4'}), hasSound: false,
        thumb
      };
    } finally {
      if(encoder && encoder.state !== 'closed') encoder.close();
      input.dispose();
      if(output.state !== 'finalized') await output.cancel();
    }
  })();
  resultPromise.catch(error => preview.reject(error));
  return {
    preview: dontCreatePreview ? undefined : await preview,
    isVideo: true,
    videoDuration: duration,
    creationProgress: [progress, setProgress] as Signal<number>,
    getResult: () => resultPromise,
    cancel() { canceled = true; input.dispose(); }
  };
}
