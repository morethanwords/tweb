import {defaultCodec, highResCodec} from '@components/mediaEditor/finalRender/calcCodecAndBitrate';

let
  supportsVideo: Promise<boolean>,
  supportsAudio: Promise<boolean>
;

export const MAX_EDITABLE_VIDEO_SIZE = 100 * 1024 * 1024; // 100 MB

export const supportsVideoEncoding = () => supportsVideo ??= (async() => {
  const configs: VideoEncoderConfig[] = [highResCodec, defaultCodec];

  for(const config of configs) {
    try {
      const support = await VideoEncoder.isConfigSupported(config);
      if(!support.supported) return false;
    } catch{
      return false;
    }
  }

  return true;
})();

export const supportsAudioEncoding = () => supportsAudio ??= (async() => {
  const config: AudioEncoderConfig = {
    codec: 'opus',
    sampleRate: 48000,
    numberOfChannels: 2,
    bitrate: 128_000
  };

  try {
    const support = await AudioEncoder.isConfigSupported(config);
    return !!support.supported;
  } catch{
    return false;
  }
})();
