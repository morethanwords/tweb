import type {GroupCallParticipant} from '@layer';
import type {LangPackKey} from '@lib/langPack';
import type GroupCallInstance from '@lib/calls/groupCallInstance';

type MicrophoneCall = Pick<GroupCallInstance, 'participant' | 'changeRaiseHand' | 'toggleMuted'>;

export enum GROUP_CALL_MICROPHONE_BUTTON_STATE {
  HAND,
  MUTED,
  UNMUTED
}

export type MicrophoneControlAccessibility = {
  disabled: boolean,
  label: LangPackKey
};

export function getGroupCallMicrophoneButtonState(
  participant: GroupCallParticipant,
  muted = !!participant.pFlags.muted
) {
  if(!participant.pFlags.can_self_unmute) {
    return GROUP_CALL_MICROPHONE_BUTTON_STATE.HAND;
  }

  return muted ?
    GROUP_CALL_MICROPHONE_BUTTON_STATE.MUTED :
    GROUP_CALL_MICROPHONE_BUTTON_STATE.UNMUTED;
}

export function getMicrophoneControlAccessibility(
  participant?: GroupCallParticipant,
  muted = !!participant?.pFlags.muted
): MicrophoneControlAccessibility {
  if(!participant) {
    return {
      disabled: true,
      label: 'VoiceChat.Status.Connecting'
    };
  }

  const state = getGroupCallMicrophoneButtonState(participant, muted);
  if(state === GROUP_CALL_MICROPHONE_BUTTON_STATE.HAND) {
    const handRaised = participant.raise_hand_rating !== undefined;
    return {
      disabled: handRaised,
      label: handRaised ? 'ConferenceCall.Controls.HandRaised' : 'ConferenceCall.Controls.RaiseHand'
    };
  }

  const isMuted = state === GROUP_CALL_MICROPHONE_BUTTON_STATE.MUTED;
  return {
    disabled: false,
    label: isMuted ? 'VoipUnmute' : 'Call.Mute'
  };
}

export function performMicrophoneControlAction(instance: MicrophoneCall): Promise<void> {
  const {participant} = instance;
  if(!participant) return Promise.resolve();

  if(getGroupCallMicrophoneButtonState(participant) === GROUP_CALL_MICROPHONE_BUTTON_STATE.HAND) {
    if(participant.raise_hand_rating !== undefined) return Promise.resolve();
    return instance.changeRaiseHand(true);
  }

  return instance.toggleMuted();
}
