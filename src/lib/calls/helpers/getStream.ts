import {appSettings, setAppSettings} from '@stores/appSettings';
import {logger} from '@lib/logger';

const log = logger('getStream');

// The single chokepoint for call-related `getUserMedia` calls. Every call
// path (P2P + group + previews) goes through here, so the stale-device-id
// recovery logic lives in exactly one place.
//
// Two browsers raise different names for the same "deviceId.exact no longer
// matches a physical device" condition: Chromium / Safari say
// `OverconstrainedError`, Firefox says `NotFoundError`.
function isMissingDeviceError(err: unknown): boolean {
  if(!err || typeof err !== 'object') return false;
  const name = (err as {name?: unknown}).name;
  return name === 'OverconstrainedError' || name === 'NotFoundError';
}

type StrippedConstraint<T> = {value: T, stripped: boolean};
function stripDeviceId<T extends boolean | MediaTrackConstraints | undefined>(
  constraint: T
): StrippedConstraint<T> {
  if(!constraint || typeof constraint !== 'object') return {value: constraint, stripped: false};
  if(!('deviceId' in constraint)) return {value: constraint, stripped: false};
  const {deviceId: _, ...rest} = constraint as MediaTrackConstraints & {deviceId?: unknown};
  return {value: rest as T, stripped: true};
}

function applyMuted(stream: MediaStream, muted: boolean | undefined): MediaStream {
  if(muted !== undefined) {
    stream.getTracks().forEach((t) => t.enabled = !muted);
  }
  return stream;
}

// Acquire a media stream for the call subsystem with self-healing fallback
// when the persisted device id is stale.
//
// Recovery uses an **incremental** retry so a working preference isn't
// thrown out alongside a dead one:
//   1. Try the requested constraints unchanged.
//   2. If they fail with the missing-device error AND both audio and video
//      asked for an exact deviceId, retry keeping audio's deviceId but
//      dropping video's. On success the camera was the culprit — clear
//      cameraId, keep microphoneId.
//   3. Otherwise (single-deviceId failure, or step 2 also failed) drop the
//      deviceId from each constraint that had one, clear the matching
//      appSettings field, and retry. The call falls back to OS defaults for
//      whichever kind was bad and the call carries on.
//
// `muted` is only honoured if explicitly provided — leaving it `undefined`
// means "don't touch track enabled flags" (callers that don't care about
// muted state can skip the second argument).
export default async function getStream(
  constraints: MediaStreamConstraints,
  muted?: boolean
): Promise<MediaStream> {
  try {
    return applyMuted(await navigator.mediaDevices.getUserMedia(constraints), muted);
  } catch(err) {
    if(!isMissingDeviceError(err)) throw err;

    const audio = stripDeviceId(constraints.audio);
    const video = stripDeviceId(constraints.video);

    // Nothing to fall back FROM — propagate the original error so the caller
    // surfaces it (this is a real "no device at all" condition, not a stale
    // persisted choice).
    if(!audio.stripped && !video.stripped) throw err;

    log.warn('saved device id is stale, attempting fallback', {audioHadDeviceId: audio.stripped, videoHadDeviceId: video.stripped, error: (err as {name?: string})?.name});

    // Both had deviceId — try keeping audio first; if that succeeds, the
    // camera was the only stale device and the mic preference survives.
    if(audio.stripped && video.stripped) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: constraints.audio,
          video: video.value
        });
        if(appSettings.callDevices?.cameraId) {
          setAppSettings('callDevices', 'cameraId', '');
        }
        log('camera device was stale; kept microphone, cleared cameraId');
        return applyMuted(stream, muted);
      } catch(err2) {
        if(!isMissingDeviceError(err2)) throw err2;
        // audio.deviceId was also bad — fall through to the dual-clear path.
      }
    }

    if(audio.stripped && appSettings.callDevices?.microphoneId) {
      setAppSettings('callDevices', 'microphoneId', '');
    }
    if(video.stripped && appSettings.callDevices?.cameraId) {
      setAppSettings('callDevices', 'cameraId', '');
    }

    log.warn('clearing stale device id(s), retrying on OS defaults', {clearedMicrophone: audio.stripped, clearedCamera: video.stripped});

    return applyMuted(await navigator.mediaDevices.getUserMedia({
      audio: audio.value,
      video: video.value
    }), muted);
  }
}

(window as any).getStream = getStream;
