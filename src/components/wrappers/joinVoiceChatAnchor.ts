import {InputGroupCall, Message, MessageAction} from '@layer';
import wrapUrl from '@lib/richTextProcessor/wrapUrl';
import {attachClickEvent} from '@helpers/dom/clickEvent';
import getServerMessageId from '@appManagers/utils/messageId/getServerMessageId';
import noop from '@helpers/noop';

export default function wrapJoinVoiceChatAnchor(message: Message.messageService) {
  const action = message.action as
    | MessageAction.messageActionInviteToGroupCall
    | MessageAction.messageActionConferenceCall
    | MessageAction.messageActionGroupCall;

  // 1-on-1 chats with a User peer mean this is a TdE2E conference invite —
  // legacy voice chats only live in chats/channels. Route the invite straight
  // into `appImManager.joinConference` — the single conference-join policy entry
  // point, which owns the support gate, the leave-current-call confirmation and
  // the dead-link error UX — via `inputGroupCallInviteMessage`, the canonical
  // form for joining from a service message (see tdesktop
  // window_session_controller.cpp:993 and calls_group_call.cpp:4254).
  if(message.peerId.isUser()) {
    const inviteInput: InputGroupCall.inputGroupCallInviteMessage = {
      _: 'inputGroupCallInviteMessage',
      msg_id: getServerMessageId(message.mid)
    };

    const a = document.createElement('a');
    a.classList.add('anchor-join-conference');
    // Lazy import — keep it dynamic. `joinVoiceChatAnchor` sits on the message-
    // render path, which is itself inside `appImManager`'s static import graph;
    // a top-level `import appImManager` here closes a cycle that crashes page
    // load with a `Row` TDZ ("Cannot access 'Row' before initialization").
    // Resolving it at click-time (appImManager is long loaded by then) keeps the
    // single conference-join entry point without the cycle. `.catch(noop)` drops
    // the benign leave-current-call cancel — every join error is toasted inside.
    attachClickEvent(a, () => {
      import('@lib/appImManager').then(({default: appImManager}) => appImManager.joinConference(inviteInput)).catch(noop);
    });
    return a;
  }

  // Legacy voice/video chat in a group/channel — keep the existing tg://
  // URL flow which routes through appImManager.joinGroupCall. Only the
  // messageActionGroupCall / messageActionInviteToGroupCall variants carry
  // an InputGroupCall on their `call` field; messageActionConferenceCall
  // does not (and never appears for a chat peer in current servers).
  const call = (action as MessageAction.messageActionInviteToGroupCall).call as InputGroupCall.inputGroupCall;
  if(!call || call._ !== 'inputGroupCall') {
    return document.createElement('span');
  }

  const {onclick, url} = wrapUrl(
    `tg://voicechat?chat_id=${message.peerId.toChatId()}&id=${call.id}&access_hash=${call.access_hash}`
  );
  if(!onclick) {
    return document.createElement('span');
  }

  const a = document.createElement('a');
  a.href = url;
  a.setAttribute('onclick', onclick + '(this)');
  return a;
}
