import {GROUP_CALL_AMPLITUDE_ANALYSE_INTERVAL_MS} from '@lib/calls/constants';
import StreamManager from '@lib/calls/streamManager';
import getAudioConstraints from '@lib/calls/helpers/getAudioConstraints';
import getStream from '@lib/calls/helpers/getStream';
import getVideoConstraints from '@lib/calls/helpers/getVideoConstraints';
import {logger} from '@lib/logger';

const log = logger('GROUP-CALL');

export type MainStreamManager = StreamManager & {
  // `inputError` remains as the compatibility alias for microphone failures.
  // Callers that expose media-specific UI should use the two explicit fields.
  inputError?: unknown,
  audioInputError?: unknown,
  videoInputError?: unknown
};

export default async function createMainStreamManager(muted?: boolean, joinVideo?: boolean) {
  const constraints: MediaStreamConstraints = {
    audio: getAudioConstraints(),
    video: joinVideo && getVideoConstraints()
  };

  const streamManager = new StreamManager(GROUP_CALL_AMPLITUDE_ANALYSE_INTERVAL_MS) as MainStreamManager;

  try {
    const stream = await getStream(constraints, muted);
    streamManager.addStream(stream, 'input');
    return streamManager;
  } catch(err) {
    log.error('joinGroupCall combined getStream error', err, constraints);
    if(!joinVideo) {
      streamManager.inputError = streamManager.audioInputError = err;
      streamManager.inputStream = new MediaStream();
      return streamManager;
    }
  }

  // getUserMedia is all-or-nothing: a camera-only denial rejects the combined
  // request without exposing the already-usable microphone. Probe each kind
  // independently after that failure so migration can continue audio-only (or
  // video-only) and surface the error for the device that actually failed.
  const [audioResult, videoResult] = await Promise.allSettled([
    getStream({audio: constraints.audio}, muted),
    getStream({video: constraints.video})
  ]);

  if(audioResult.status === 'fulfilled') {
    streamManager.addStream(audioResult.value, 'input');
  } else {
    streamManager.inputError = streamManager.audioInputError = audioResult.reason;
    log.error('joinGroupCall audio-only fallback failed', audioResult.reason, constraints.audio);
  }

  if(videoResult.status === 'fulfilled') {
    streamManager.addStream(videoResult.value, 'input');
  } else {
    streamManager.videoInputError = videoResult.reason;
    log.error('joinGroupCall video-only fallback failed', videoResult.reason, constraints.video);
  }

  return streamManager;
}
