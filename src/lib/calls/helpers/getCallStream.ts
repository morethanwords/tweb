import constraintSupported from '@environment/constraintSupport';
import pause from '@helpers/schedulers/pause';
import getStream from '@lib/calls/helpers/getStream';
import stopTrack from '@lib/calls/helpers/stopTrack';
import denoiseMicrophone, {RnnoiseLoadingError, shouldUseRnnoise} from '@lib/calls/noiseSuppression/noiseSuppression';
import {logger} from '@lib/logger';

const log = logger('getCallStream');
// A group call takes its microphone only once it has joined.
const ADOPTION_POLL_MS = 1000;
const ADOPTION_TIMEOUT_MS = 30000;

/**
 * The browser's suppression stood in for RNNoise while its model was still
 * loading: once the model is in, the call sending that microphone captures it
 * again, the way it changes devices, and gets RNNoise.
 */
async function upgradeWhenLoaded(track: MediaStreamTrack, loaded: Promise<unknown>) {
  try {
    await loaded;
    const {recaptureCallMicrophone} = await import('@lib/calls/applyDeviceToActiveCall');
    for(let waited = 0; waited <= ADOPTION_TIMEOUT_MS; waited += ADOPTION_POLL_MS) {
      // Hung up, switched to another device, or the switch turned off.
      if(track.readyState !== 'live' || !shouldUseRnnoise()) return;
      if(await recaptureCallMicrophone(track)) return;
      await pause(ADOPTION_POLL_MS);
    }
  } catch(err) {
    log.warn('moving the microphone onto RNNoise failed', err);
  }
}

/**
 * getStream for what a call sends: with the "Noise suppression" switch on,
 * the microphone comes back denoised by RNNoise (noiseSuppression.ts), and
 * was captured without the browser's own suppression for it. Previews, level
 * meters and voice messages stay on plain getStream.
 */
export default async function getCallStream(constraints: MediaStreamConstraints, muted?: boolean) {
  const stream = await getStream(constraints, muted);
  if(!constraints.audio || !shouldUseRnnoise() || !stream.getAudioTracks().length) {
    return stream;
  }

  let loading: Promise<unknown>;
  try {
    return await denoiseMicrophone(stream);
  } catch(err) {
    log.warn('RNNoise did not start', err);
    if(err instanceof RnnoiseLoadingError) loading = err.loaded;
  }

  // Browsers do not switch their suppression on for a live track, so the
  // microphone is captured again with it rather than going out unprocessed.
  if(!constraintSupported('noiseSuppression')) {
    return stream;
  }

  const audio = typeof(constraints.audio) === 'object' ? constraints.audio : {};
  let replacement: MediaStream;
  try {
    replacement = await getStream({audio: {...audio, noiseSuppression: true}}, muted);
  } catch(err) {
    log.warn('recapturing the microphone failed', err);
    return stream;
  }

  stream.getAudioTracks().forEach((track) => stopTrack(track));
  const [microphone] = replacement.getAudioTracks();
  if(loading && microphone) {
    void upgradeWhenLoaded(microphone, loading);
  }

  return new MediaStream([...replacement.getAudioTracks(), ...stream.getVideoTracks()]);
}
