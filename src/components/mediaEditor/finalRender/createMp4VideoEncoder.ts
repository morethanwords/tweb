import calcCodecAndBitrate, {BITRATE_TARGET_FPS} from '@components/mediaEditor/finalRender/calcCodecAndBitrate';

export default async function createMp4VideoEncoder({width, height, frameRate = BITRATE_TARGET_FPS, onError}: {
  width: number,
  height: number,
  frameRate?: number,
  onError?: (error: DOMException) => void
}) {
  const {ArrayBufferTarget, Muxer} = await import('mp4-muxer');

  const muxer = new Muxer({
    target: new ArrayBufferTarget(),
    video: {
      codec: 'avc',
      width,
      height,
      frameRate
    },
    fastStart: 'in-memory'
  });

  const encoder = new VideoEncoder({
    output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
    error: onError || ((e) => console.error(e))
  });

  encoder.configure({
    width,
    height,
    ...calcCodecAndBitrate(width, height, BITRATE_TARGET_FPS)
  });

  return {
    encoder,
    finalize: () => {
      muxer.finalize();
      return new Blob([muxer.target.buffer], {type: 'video/mp4'});
    }
  };
}
