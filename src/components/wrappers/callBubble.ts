import Icon from '@components/icon';
import StackedAvatars from '@components/stackedAvatars';
import {wrapCallDuration} from '@components/wrappers/wrapDuration';
import {formatTime} from '@helpers/date';
import getPeerId from '@appManagers/utils/peers/getPeerId';
import getServerMessageId from '@appManagers/utils/messageId/getServerMessageId';
import {Middleware} from '@helpers/middleware';
import {_i18n, i18n, LangPackKey} from '@lib/langPack';
import {getConferenceCallLangKey, getConferenceCallState} from '@lib/calls/helpers/conferenceCallAction';
import {CallLogAction} from '@lib/calls/helpers/callLog';
import {CallType} from '@lib/calls/types';
import {MessageAction} from '@layer';

export type CallBubbleAction = CallLogAction;

/** iOS' `peopleAvatarSize` (ChatMessageCallBubbleContentNode.swift:102). */
const PARTICIPANT_AVATAR_SIZE = 16;

/**
 * Who to put on a conference bubble's participants row: the message's author
 * followed by the peers the action names, without repeats. iOS builds the same
 * list out of `message.author` + `otherParticipants`
 * (ChatMessageCallBubbleContentNode.swift:153-161); Android dedupes its own
 * into a set (ChatMessageCell.java:8907-8916), which is why this does too — the
 * count under the faces is the length of this list.
 */
export function getConferenceCallParticipants(
  action: MessageAction.messageActionConferenceCall,
  fromId?: PeerId
): PeerId[] {
  if(!action.other_participants?.length) {
    return [];
  }

  const peerIds = [fromId, ...action.other_participants.map((peer) => getPeerId(peer))];
  return Array.from(new Set(peerIds.filter(Boolean)));
}

/**
 * Title of a 1-on-1 call bubble. Every official client says how the call ended
 * here rather than in the status line — tdesktop's `MediaCall::Text`
 * (data_media_types.cpp:1908) and Android's `getCallMessageText`
 * (ChatMessageCell.java:29525) agree down to the branches: an outgoing call
 * nobody picked up was cancelled, an incoming one was missed, and an incoming
 * one the other side hung up on was declined.
 */
function getPhoneCallLangKey(
  action: MessageAction.messageActionPhoneCall,
  isOut: boolean
): LangPackKey {
  const video = !!action.pFlags.video;
  const reason = action.reason?._;
  if(isOut) {
    return reason === 'phoneCallDiscardReasonMissed' ?
      (video ? 'CallMessageVideoOutgoingMissed' : 'CallMessageOutgoingMissed') :
      (video ? 'CallMessageVideoOutgoing' : 'CallMessageOutgoing');
  }

  if(reason === 'phoneCallDiscardReasonMissed') {
    return video ? 'CallMessageVideoIncomingMissed' : 'CallMessageIncomingMissed';
  }

  if(reason === 'phoneCallDiscardReasonBusy') {
    return video ? 'CallMessageVideoIncomingDeclined' : 'CallMessageIncomingDeclined';
  }

  return video ? 'CallMessageVideoIncoming' : 'CallMessageIncoming';
}

/**
 * The call-log bubble: what kind of call it was, a status line, and the call
 * icon down the right-hand side. tdesktop draws 1-on-1 and conference calls
 * with the very same media (HistoryView::Call, history_view_call.cpp) and so
 * does this — the conference variant differs only in its icon, in taking its
 * title from the call's state, in the people it was shared with, and in
 * carrying the invite message id the join click needs.
 *
 * The status line is the message's own time, plus the duration after a comma
 * when the call actually happened (`lng_call_duration_info` = "{time},
 * {duration}", iOS' `Notification_CallFormat`). It is printed here rather than
 * pulled from `MessageRender.setTime` because this bubble carries no message
 * info of its own — tdesktop says the same with `customInfoLayout() = true`
 * (history_view_call.h:39), which is also why there is no delivery status.
 */
export default function wrapCallBubble(options: {
  action: CallBubbleAction,
  isOut: boolean,
  /** Local mid of the message the bubble belongs to. */
  mid: number,
  /** When the call happened — the status line leads with it. */
  date: number,
  /** The message's author — the first face on a conference's participants row. */
  fromId?: PeerId,
  /** Without it the participants row is skipped: its avatars outlive the paint. */
  middleware?: Middleware,
  loadPromises?: Promise<any>[]
}) {
  const {action, isOut, mid, date, fromId, middleware, loadPromises} = options;
  const isConference = action._ === 'messageActionConferenceCall';

  const element = document.createElement('div');
  element.classList.add('bubble-call');
  element.append(Icon(
    action.pFlags.video ? 'videocamera' : (isConference ? 'group' : 'phone'),
    'bubble-call-icon'
  ));

  const title = document.createElement('div');
  title.classList.add('bubble-call-title');

  const subtitle = document.createElement('div');
  subtitle.classList.add('bubble-call-subtitle');

  const status = document.createElement('span');
  status.classList.add('bubble-call-status');
  const time = formatTime(new Date(date * 1000));
  status.append(action.duration !== undefined ?
    i18n('Chat.CallMessage.TimeAndDuration', [time, wrapCallDuration(action.duration)]) :
    time);
  subtitle.append(status);

  let isMissed: boolean;
  if(action._ === 'messageActionConferenceCall') {
    // The title carries the whole state (invitation / ongoing / missed /
    // declined), the status line adds who was on the call after the time, and
    // the bubble as a whole is the join affordance.
    const state = getConferenceCallState(action);
    isMissed = state === 'missed';
    element.dataset.conferenceMsgId = '' + getServerMessageId(mid);
    _i18n(title, getConferenceCallLangKey(state, isOut));

    const participants = getConferenceCallParticipants(action, fromId);
    if(participants.length && middleware) {
      const row = document.createElement('div');
      row.classList.add('bubble-call-participants');

      const avatars = new StackedAvatars({
        avatarSize: PARTICIPANT_AVATAR_SIZE,
        middleware
      });
      avatars.render(participants, loadPromises);

      const count = document.createElement('span');
      count.classList.add('bubble-call-participants-count');
      count.append(i18n('Chat.CallMessage.GroupCallParticipantCount', [participants.length]));

      row.append(avatars.container, count);
      // The faces continue the status line, so they are read off the same
      // comma the duration would have used (ChatMessageCallBubbleContentNode.swift:247).
      status.append(',');
      subtitle.append(row);
    }
  } else {
    const type: CallType = action.pFlags.video ? 'video' : 'voice';
    element.dataset.type = type;
    isMissed = action.duration === undefined;

    _i18n(title, getPhoneCallLangKey(action, isOut));
  }

  subtitle.prepend(Icon('arrow_next', 'bubble-call-arrow', 'bubble-call-arrow-' + (isMissed ? 'red' : 'green')));

  element.append(title, subtitle);

  return {element};
}
