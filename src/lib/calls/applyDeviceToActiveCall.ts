import callsController from '@lib/calls/callsController';
import groupCallsController from '@lib/calls/groupCallsController';
import type CallInstanceBase from '@lib/calls/callInstanceBase';
import {CALL_DEVICE_SETTING_KEYS, CallDeviceKind} from '@lib/calls/callDeviceKind';
import {appSettings, setAppSettings} from '@stores/appSettings';

// Resolves whichever call is live right now — either a P2P call (highest
// priority because the P2P UI is in front when both exist) or the legacy
// voice/video group call. Returns undefined when nothing is active, in
// which case callers just skip the live swap and rely on the persisted
// setting being read on the next call's media acquisition.
//
// Both controllers expose a singleton-ish "current" handle: callsController
// keeps a sorted instance list (current = highest priority), and
// groupCallsController carries a single `groupCall` for the legacy chat.
function getActiveCallInstance(): CallInstanceBase<any> | undefined {
  return callsController.currentCall || groupCallsController.groupCall;
}

// Propagate a device-id change to whichever call is live. Used from the
// in-call settings popup (which also has a direct instance handle, but
// going through here keeps the audio-output / mic / camera plumbing
// in one place) AND from the Speakers-and-Camera settings tab + the shared
// `CallCameraSection` — neither of those has access to a CallInstance, but
// both still want the device change to take effect immediately without
// waiting for the user to drop and rejoin the call.
const deviceChanges: Record<CallDeviceKind, {
  generation: number,
  pending: number,
  confirmedId: string
}> = {
  speaker: {generation: 0, pending: 0, confirmedId: appSettings.callDevices?.speakerId || ''},
  microphone: {generation: 0, pending: 0, confirmedId: appSettings.callDevices?.microphoneId || ''},
  camera: {generation: 0, pending: 0, confirmedId: appSettings.callDevices?.cameraId || ''}
};

export default function applyDeviceToActiveCall(kind: CallDeviceKind, deviceId: string): Promise<boolean> {
  const instance = getActiveCallInstance();
  if(!instance) return Promise.resolve(true);

  switch(kind) {
    case 'speaker':
      return instance.setOutputDeviceId(deviceId);
    case 'microphone':
      return instance.setInputAudioDeviceId(deviceId);
    case 'camera':
      return instance.setInputVideoDeviceId(deviceId);
  }
}

// Persist a device selection optimistically while making the live call swap a
// real transaction. The module-level generation covers every picker surface,
// so a late failure from Settings cannot roll back a newer in-call selection.
// `getStream` may clear the requested id after a successful fallback to the OS
// default; in that case the cleared value becomes the confirmed selection.
export async function changeCallDevice(kind: CallDeviceKind, deviceId: string): Promise<boolean> {
  const state = deviceChanges[kind];
  const settingKey = CALL_DEVICE_SETTING_KEYS[kind];
  if(!state.pending) state.confirmedId = appSettings.callDevices?.[settingKey] || '';

  const generation = ++state.generation;
  ++state.pending;
  setAppSettings('callDevices', settingKey, deviceId);

  try {
    const applied = await applyDeviceToActiveCall(kind, deviceId);
    if(generation !== state.generation || !applied) return false;
    state.confirmedId = appSettings.callDevices?.[settingKey] || '';
    return true;
  } catch(err) {
    if(generation !== state.generation) return false;
    setAppSettings('callDevices', settingKey, state.confirmedId);
    throw err;
  } finally {
    --state.pending;
  }
}
