import DEBUG, {MOUNT_CLASS_TO} from '@config/debug';
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
    // `muted` is the voice-call microphone intent. A combined audio+video
    // acquisition must not silently disable the camera when the user joins
    // muted but explicitly chose to keep video on.
    stream.getAudioTracks().forEach((track) => track.enabled = !muted);
  }
  return stream;
}

function getRequestedDeviceId(constraint: boolean | MediaTrackConstraints | undefined): string | undefined {
  if(!constraint || typeof constraint !== 'object') return undefined;
  const {deviceId} = constraint;
  if(typeof deviceId === 'string') return deviceId;
  if(!deviceId || typeof deviceId !== 'object' || Array.isArray(deviceId)) return undefined;
  const {exact} = deviceId as ConstrainDOMStringParameters;
  return typeof exact === 'string' ? exact : undefined;
}

function clearStaleDeviceId(kind: 'microphoneId' | 'cameraId', requestedDeviceId: string | undefined): boolean {
  if(!requestedDeviceId || appSettings.callDevices?.[kind] !== requestedDeviceId) return false;
  setAppSettings('callDevices', kind, '');
  return true;
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
//   3. If step 2 also reports a missing device, try the symmetric probe: keep
//      video's exact deviceId and drop audio's. On success only the microphone
//      was stale, so cameraId survives.
//   4. Otherwise (single-deviceId failure, or both probes failed) drop every
//      requested deviceId, clear the matching appSettings fields, and retry on
//      OS defaults.
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
    const requestedMicrophoneId = getRequestedDeviceId(constraints.audio);
    const requestedCameraId = getRequestedDeviceId(constraints.video);

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
        clearStaleDeviceId('cameraId', requestedCameraId);
        log('camera device was stale; kept microphone, cleared cameraId');
        return applyMuted(stream, muted);
      } catch(err2) {
        if(!isMissingDeviceError(err2)) throw err2;
      }

      // The first probe only proved that keeping audio still fails. Preserve a
      // working camera preference by trying the mirror image before clearing
      // both ids; a stale microphone plus a valid camera is a common USB/headset
      // hot-unplug case.
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: audio.value,
          video: constraints.video
        });
        clearStaleDeviceId('microphoneId', requestedMicrophoneId);
        log('microphone device was stale; kept camera, cleared microphoneId');
        return applyMuted(stream, muted);
      } catch(err3) {
        if(!isMissingDeviceError(err3)) throw err3;
        // Both exact ids may be stale — fall through to the dual-clear path.
      }
    }

    const clearedMicrophone = audio.stripped && clearStaleDeviceId('microphoneId', requestedMicrophoneId);
    const clearedCamera = video.stripped && clearStaleDeviceId('cameraId', requestedCameraId);

    log.warn('clearing stale device id(s), retrying on OS defaults', {clearedMicrophone, clearedCamera});

    return applyMuted(await navigator.mediaDevices.getUserMedia({
      audio: audio.value,
      video: video.value
    }), muted);
  }
}

DEBUG && (MOUNT_CLASS_TO.getStream = getStream);
