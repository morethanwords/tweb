import callsController from '@lib/calls/callsController';
import groupCallsController from '@lib/calls/groupCallsController';
import type CallInstanceBase from '@lib/calls/callInstanceBase';

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
export type CallDeviceKind = 'speaker' | 'microphone' | 'camera';

export default function applyDeviceToActiveCall(kind: CallDeviceKind, deviceId: string): void {
  const instance = getActiveCallInstance();
  if(!instance) return;

  switch(kind) {
    case 'speaker':
      instance.setOutputDeviceId(deviceId);
      break;
    case 'microphone':
      // Returns a Promise — fire-and-forget; failures are surfaced via the
      // instance's own logger and rolling back the setting would be more
      // jarring than leaving the new value persisted for the next call.
      instance.setInputAudioDeviceId(deviceId).catch(() => {});
      break;
    case 'camera':
      instance.setInputVideoDeviceId(deviceId).catch(() => {});
      break;
  }
}
