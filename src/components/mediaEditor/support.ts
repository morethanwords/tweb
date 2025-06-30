import {defaultCodec, highResCodec} from './finalRender/calcCodecAndBitrate';

let
  supportsVideo: boolean,
  supportsAudio: boolean
;

export const MAX_EDITABLE_VIDEO_SIZE = 100 * 1024 * 1024;

export const supportsVideoEncoding = () => supportsVideo ?? (async() => {
  const configs: VideoEncoderConfig[] = [highResCodec, defaultCodec];

  let result = true;

  for(const config of configs) {
    const support = await VideoEncoder.isConfigSupported(config);
    if(!support.supported) result = false;
  }

  return supportsVideo = result;
})();

export const supportsAudioEncoding = () => supportsAudio ?? (async() => {
  const config: AudioEncoderConfig = {
    codec: 'opus',
    sampleRate: 48000,
    numberOfChannels: 2,
    bitrate: 128_000
  };

  const support = await AudioEncoder.isConfigSupported(config);

  return supportsAudio = !!support.supported;
})();
