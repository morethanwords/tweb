import constraintSupported, {MyMediaTrackSupportedConstraints} from '@environment/constraintSupport';
import {shouldUseBrowserNoiseSuppression} from '@lib/calls/noiseSuppression/noiseSuppression';
import {appSettings} from '@stores/appSettings';

// `deviceId` opt-in: callers pass the persisted choice from
// `appSettings.callDevices.microphoneId`; the helper falls back to the store
// directly so older call sites that built the constraints without explicit
// args keep using the saved device. Empty string ⇒ no constraint ⇒ OS default.
//
// `noiseSuppression` follows the "Noise suppression" switch of the call
// settings, and is off when RNNoise does the job instead (getCallStream); the
// other audio-DSP constraints (echo cancellation, auto gain) stay always-on
// because they have no user-facing switch yet and disabling either makes a
// call dramatically worse for the remote side.
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

  if(constraintSupported('noiseSuppression')) {
    constraints.noiseSuppression = shouldUseBrowserNoiseSuppression();
  }

  const id = deviceId ?? appSettings.callDevices?.microphoneId;
  if(id) {
    constraints.deviceId = {exact: id};
  }

  return constraints;
}
