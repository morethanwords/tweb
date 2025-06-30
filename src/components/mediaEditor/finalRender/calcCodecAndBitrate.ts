export const BITRATE_TARGET_FPS = 30;

export const highResCodec = {
  codec: 'avc1.4d4028',
  width: 1920,
  height: 1080,
  bitrate: 20e6
};

export const defaultCodec = {
  codec: 'avc1.42001f',
  width: 1280,
  height: 720,
  bitrate: 14e6
};

export default function calcCodecAndBitrate(w: number, h: number, fps: typeof BITRATE_TARGET_FPS) {
  const {codec, width, height, bitrate} = h > defaultCodec.height || w > defaultCodec.width ? highResCodec : defaultCodec;

  return {
    codec,
    bitrate: w * h * fps / (width * height * BITRATE_TARGET_FPS) * bitrate
  };
}
