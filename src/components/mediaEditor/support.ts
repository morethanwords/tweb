import {defaultCodec, highResCodec} from '@components/mediaEditor/finalRender/calcCodecAndBitrate';
import type {NativeVideoEncodeRequest} from '@components/mediaEditor/native/videoExportPlan';

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

/** Per-editor cache of exact native tuples, never the legacy generic support bit. */
export function createNativeVideoEncoderSupport() {
  const cache = new Map<string, Promise<VideoEncoderConfig | undefined>>();
  return (request: NativeVideoEncodeRequest) => {
    const config: VideoEncoderConfig = {
      codec: highResCodec.codec,
      width: request.size[0], height: request.size[1],
      bitrate: request.bitrate, framerate: request.fps,
      avc: {format: 'avc'}
    };
    const key = JSON.stringify(config);
    let result = cache.get(key);
    if(!result) {
      result = (async() => {
        try {
          const supported = await VideoEncoder.isConfigSupported(config);
          const actual = supported.config;
          if(!supported.supported || !actual ||
            actual.codec !== config.codec || actual.width !== config.width || actual.height !== config.height ||
            actual.bitrate !== config.bitrate || actual.framerate !== config.framerate || actual.avc?.format !== 'avc') return;
          return config;
        } catch{
          return undefined;
        }
      })();
      cache.set(key, result);
    }
    return result;
  };
}
