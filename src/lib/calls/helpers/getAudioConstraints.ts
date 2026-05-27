import constraintSupported, {MyMediaTrackSupportedConstraints} from '@environment/constraintSupport';
import {appSettings} from '@stores/appSettings';

// `deviceId` opt-in: callers pass the persisted choice from
// `appSettings.callDevices.microphoneId`; the helper falls back to the store
// directly so older call sites that built the constraints without explicit
// args keep using the saved device. Empty string ⇒ no constraint ⇒ OS default.
//
// `noiseSuppression` honours the in-call toggle exposed in the settings
// popup; the other audio-DSP constraints (echo cancellation, auto gain) stay
// always-on because they have no user-facing switch yet and disabling either
// makes a call dramatically worse for the remote side.
export default function getAudioConstraints(deviceId?: string): MediaTrackConstraints {
  const constraints: MediaTrackConstraints = {
    channelCount: 2
  };

  const desirable: (keyof MyMediaTrackSupportedConstraints)[] = [
    'echoCancellation',
    'autoGainControl'
  ];

  desirable.forEach((constraint) => {
    if(constraintSupported(constraint)) {
      // @ts-ignore
      constraints[constraint] = true;
    }
  });

  // `noiseSuppression` defaults to true (legacy behavior) — opt-out via the
  // call settings toggle when the user wants to capture ambient sound.
  if(constraintSupported('noiseSuppression')) {
    const enabled = appSettings.callDevices?.noiseSuppression ?? true;
    constraints.noiseSuppression = enabled;
  }

  const id = deviceId ?? appSettings.callDevices?.microphoneId;
  if(id) {
    constraints.deviceId = {exact: id};
  }

  return constraints;
}
