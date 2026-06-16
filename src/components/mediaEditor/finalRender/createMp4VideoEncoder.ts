import noop from '@helpers/noop';
import calcCodecAndBitrate, {BITRATE_TARGET_FPS} from '@components/mediaEditor/finalRender/calcCodecAndBitrate';

export default async function createMp4VideoEncoder({width, height, frameRate, onError}: {
  width: number,
  height: number,
  // mediabunny snaps timestamps to this frame rate, so pass it only when frames sit exactly on its grid
  frameRate?: number,
  onError?: (error: DOMException) => void
}) {
  const {BufferTarget, EncodedPacket, EncodedVideoPacketSource, Mp4OutputFormat, Output} = await import('mediabunny');

  const output = new Output({
    format: new Mp4OutputFormat({fastStart: 'in-memory'}),
    target: new BufferTarget()
  });

  const videoSource = new EncodedVideoPacketSource('avc');
  output.addVideoTrack(videoSource, {frameRate});

  await output.start();

  // packets must be added sequentially (decode order + backpressure), but the encoder callback is sync
  let addChain: Promise<unknown> = Promise.resolve();

  const encoder = new VideoEncoder({
    output: (chunk, meta) => {
      addChain = addChain.then(() => videoSource.add(EncodedPacket.fromEncodedChunk(chunk), meta));
      addChain.catch(noop); // the rejection still surfaces when finalize awaits the chain
    },
    error: onError || ((e) => console.error(e))
  });

  encoder.configure({
    width,
    height,
    ...calcCodecAndBitrate(width, height, BITRATE_TARGET_FPS)
  });

  return {
    encoder,
    finalize: async() => {
      await addChain;
      await output.finalize();
      return new Blob([output.target.buffer], {type: 'video/mp4'});
    }
  };
}
