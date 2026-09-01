import Icon from '@components/icon';
import {wrapCallDuration} from '@components/wrappers/wrapDuration';
import getServerMessageId from '@appManagers/utils/messageId/getServerMessageId';
import {MessageAction} from '@layer';
import {_i18n, LangPackKey} from '@lib/langPack';
import {getConferenceCallLangKey, getConferenceCallState} from '@lib/calls/helpers/conferenceCallAction';
import {CallType} from '@lib/calls/types';

export type CallBubbleAction =
  | MessageAction.messageActionPhoneCall
  | MessageAction.messageActionConferenceCall;

/**
 * The call-log bubble: icon, what kind of call it was, and a status line the
 * caller appends the message time to. tdesktop draws 1-on-1 and conference
 * calls with the very same media (HistoryView::Call, history_view_call.cpp),
 * and so does this — the conference variant differs only in its icon, in
 * taking its title from the call's state, and in carrying the invite message
 * id the join click needs.
 */
export default function wrapCallBubble(options: {
  action: CallBubbleAction,
  isOut: boolean,
  /** Local mid of the message the bubble belongs to. */
  mid: number
}) {
  const {action, isOut, mid} = options;
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

  let isMissed: boolean;
  if(action._ === 'messageActionConferenceCall') {
    // The title carries the whole state (invitation / ongoing / missed /
    // declined), the status line only ever adds a duration next to the time,
    // and the bubble as a whole is the join affordance.
    const state = getConferenceCallState(action);
    isMissed = state === 'missed';
    element.dataset.conferenceMsgId = '' + getServerMessageId(mid);
    _i18n(title, getConferenceCallLangKey(state, isOut));

    if(action.duration !== undefined) {
      subtitle.append(wrapCallDuration(action.duration));
    }
  } else {
    const type: CallType = action.pFlags.video ? 'video' : 'voice';
    element.dataset.type = type;
    isMissed = action.duration === undefined;

    _i18n(title, isOut ?
      (action.pFlags.video ? 'CallMessageVideoOutgoing' : 'CallMessageOutgoing') :
      (action.pFlags.video ? 'CallMessageVideoIncoming' : 'CallMessageIncoming'));

    if(action.duration !== undefined) {
      subtitle.append(wrapCallDuration(action.duration));
    } else {
      let langPackKey: LangPackKey;
      switch(action.reason._) {
        case 'phoneCallDiscardReasonBusy':
          langPackKey = 'Call.StatusBusy';
          break;
        case 'phoneCallDiscardReasonMissed':
          langPackKey = 'Chat.Service.Call.Missed';
          break;
        // case 'phoneCallDiscardReasonHangup':
        default:
          langPackKey = 'Chat.Service.Call.Cancelled';
          break;
      }

      subtitle.classList.add('is-reason');
      _i18n(subtitle, langPackKey);
    }
  }

  subtitle.prepend(Icon('arrow_next', 'bubble-call-arrow', 'bubble-call-arrow-' + (isMissed ? 'red' : 'green')));

  element.append(title, subtitle);

  return {element, subtitle};
}
