/*
 * The call log — the message-level model behind the Calls list.
 *
 * Every client builds that list out of the same thing: a peerless
 * `messages.search` for `inputMessagesFilterPhoneCalls`, whose service
 * messages are then collapsed into rows. The collapsing rules here are
 * tdesktop's `Calls::BoxController::Row::canAddItem`
 * (calls_box_controller.cpp:279) — same direction, same peer, same calendar
 * day — applied to the id-descending stream the server returns, which is also
 * how Android merges them (CallLogActivity.java:1410).
 */

import {Message, MessageAction} from '@layer';
import getServerMessageId from '@appManagers/utils/messageId/getServerMessageId';

/** Service action of a call message — 1-on-1 and conference alike. */
export type CallLogAction =
  | MessageAction.messageActionPhoneCall
  | MessageAction.messageActionConferenceCall;

export type CallLogMessage = Message.messageService & {action: CallLogAction};

/** tdesktop's `Row::Type` (calls_box_controller.cpp:461) — what the arrow shows. */
export type CallLogDirection = 'in' | 'out' | 'missed';

export type CallLogGroup = {
  /**
   * Names the newest call of the row, which paging in an older page can never
   * change — so rows already on screen keep their identity across a reconcile.
   */
  id: string,
  peerId: PeerId,
  direction: CallLogDirection,
  video: boolean,
  /**
   * Server id of the newest invite message when that call was a conference —
   * the id `phone.getGroupCall`/`joinConference` speaks in.
   */
  conferenceMsgId?: number,
  /** Local mids of the collapsed calls, newest first. */
  mids: number[],
  /** Date (sec) of the newest call in the group. */
  date: number
};

export function isCallLogMessage(message: Message): message is CallLogMessage {
  const action = (message as Message.messageService)?.action;
  return action?._ === 'messageActionPhoneCall' || action?._ === 'messageActionConferenceCall';
}

export function getCallLogDirection(message: CallLogMessage): CallLogDirection {
  // An outgoing call is `Out` whatever became of it — tdesktop checks `out()`
  // before it looks at the discard reason.
  if(message.pFlags.out) {
    return 'out';
  }

  const action = message.action;
  if(action._ === 'messageActionConferenceCall') {
    return action.pFlags.missed ? 'missed' : 'in';
  }

  // A duration means it connected; without one, "busy" counts as missed too.
  return action.duration === undefined && (
    action.reason._ === 'phoneCallDiscardReasonMissed' ||
    action.reason._ === 'phoneCallDiscardReasonBusy'
  ) ? 'missed' : 'in';
}

/** Local calendar day, the granularity calls are grouped by. */
function getDayKey(dateSec: number) {
  const date = new Date(dateSec * 1000);
  return `${date.getFullYear()}_${date.getMonth()}_${date.getDate()}`;
}

/**
 * Collapses a newest-first run of call messages into rows. Non-adjacent calls
 * never merge, so an A → B → A sequence stays three rows, exactly as it does in
 * tdesktop (where the row is found by an id range) and Android.
 */
export function groupCallLogMessages(messages: CallLogMessage[]): CallLogGroup[] {
  const groups: CallLogGroup[] = [];
  let group: CallLogGroup;
  let groupDayKey: string;

  for(const message of messages) {
    const direction = getCallLogDirection(message);
    const dayKey = getDayKey(message.date);

    if(
      !group ||
      group.peerId !== message.peerId ||
      group.direction !== direction ||
      groupDayKey !== dayKey
    ) {
      const {action} = message;
      group = {
        id: `${message.peerId}_${message.mid}`,
        peerId: message.peerId,
        direction,
        // The row takes its media kind from the call that opened it, i.e. the
        // newest one — same as tdesktop's `_st`.
        video: !!action.pFlags.video,
        conferenceMsgId: action._ === 'messageActionConferenceCall' ?
          getServerMessageId(message.mid) :
          undefined,
        mids: [],
        date: message.date
      };
      groupDayKey = dayKey;
      groups.push(group);
    }

    group.mids.push(message.mid);
  }

  return groups;
}
