import {LangPackKey} from '@lib/langPack';
import {MessageAction} from '@layer';

/**
 * State of a conference-call service action, mirroring tdesktop's
 * `Data::CallState` as computed in `ComputeCallData`
 * (data_media_types.cpp:505): a duration means the call is over, otherwise the
 * flags describe whether it was missed, is still running, or is a pending
 * invitation.
 */
export type ConferenceCallState = 'invitation' | 'active' | 'missed' | 'hangup';

export function getConferenceCallState(
  action: MessageAction.messageActionConferenceCall
): ConferenceCallState {
  if(action.duration !== undefined) return 'hangup';
  if(action.pFlags.missed) return 'missed';
  if(action.pFlags.active) return 'active';
  return 'invitation';
}

/**
 * Title of a conference-call message — tdesktop's `MediaCall::Text`
 * (data_media_types.cpp:1903). It is both the bubble's title and the plain
 * text used for chat list previews, replies and notifications.
 */
export function getConferenceCallLangKey(state: ConferenceCallState, isOut: boolean): LangPackKey {
  if(state === 'invitation') return 'Chat.Service.ConferenceCall.Invitation';
  if(state === 'active') return 'Chat.Service.ConferenceCall.Ongoing';
  if(isOut) {
    return state === 'missed' ?
      'Chat.Service.ConferenceCall.Declined' :
      'Chat.Service.ConferenceCall.Outgoing';
  }

  return state === 'missed' ?
    'Chat.Service.ConferenceCall.Missed' :
    'Chat.Service.ConferenceCall.Incoming';
}
