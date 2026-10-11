import type {GroupCallParticipant} from '@layer';
import type {LangPackKey} from '@lib/langPack';
import type GroupCallInstance from '@lib/calls/groupCallInstance';
import {UNMUTE_INTENT_TTL_MS} from '@lib/calls/constants';

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

// Before the server lists us (a conference takes our row a roster poll after the join) there is
// no participant: the microphone is what we joined with — muted, unless the caller knows better.
export function getGroupCallMicrophoneButtonState(
  participant?: GroupCallParticipant,
  muted = participant ? !!participant.pFlags.muted : true
) {
  if(participant && !participant.pFlags.can_self_unmute) {
    return GROUP_CALL_MICROPHONE_BUTTON_STATE.HAND;
  }

  return muted ?
    GROUP_CALL_MICROPHONE_BUTTON_STATE.MUTED :
    GROUP_CALL_MICROPHONE_BUTTON_STATE.UNMUTED;
}

export function getMicrophoneControlAccessibility(
  participant?: GroupCallParticipant,
  muted = participant ? !!participant.pFlags.muted : true
): MicrophoneControlAccessibility {
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

/** A press on the microphone made before the server listed us: the state it asked for, and when. */
export type MicrophonePressBeforeListed = {muted: boolean, at: number};

/**
 * Whether such a press is still to be carried out now that we are listed: it asked for what the
 * microphone is not, not long ago — an old one must not open it by surprise — and the server lets
 * us have it (a hand to raise is not what the label offered).
 */
export function shouldCarryOutMicrophonePress(
  press: MicrophonePressBeforeListed,
  participant: GroupCallParticipant,
  muted: boolean,
  now = performance.now()
) {
  return now - press.at < UNMUTE_INTENT_TTL_MS &&
    press.muted !== muted &&
    getGroupCallMicrophoneButtonState(participant, muted) !== GROUP_CALL_MICROPHONE_BUTTON_STATE.HAND;
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
