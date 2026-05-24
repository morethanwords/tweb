import {InputGroupCall, Message, MessageAction} from '@layer';
import wrapUrl from '@lib/richTextProcessor/wrapUrl';
import rootScope from '@lib/rootScope';
import groupCallsController from '@lib/calls/groupCallsController';
import {attachClickEvent} from '@helpers/dom/clickEvent';
import getServerMessageId from '@appManagers/utils/messageId/getServerMessageId';
import IS_CONFERENCE_CALL_SUPPORTED from '@environment/conferenceCallSupport';

export default function wrapJoinVoiceChatAnchor(message: Message.messageService) {
  const action = message.action as
    | MessageAction.messageActionInviteToGroupCall
    | MessageAction.messageActionConferenceCall
    | MessageAction.messageActionGroupCall;

  // 1-on-1 chats with a User peer mean this is a TdE2E conference invite —
  // legacy voice chats only live in chats/channels. Bypass the URL handler
  // (which assumes peerId.toChatId() is valid) and call into the conference
  // controller directly via `inputGroupCallInviteMessage`, which is the
  // canonical form for joining from a service message (see tdesktop
  // window_session_controller.cpp:993 and calls_group_call.cpp:4254).
  //
  // Gated until the SFU exposes a multi-mid layout to browser clients — see
  // docs/conf-call-browser-recv-blocker.md.
  if(message.peerId.isUser()) {
    if(!IS_CONFERENCE_CALL_SUPPORTED) {
      return document.createElement('span');
    }
    const inviteInput: InputGroupCall.inputGroupCallInviteMessage = {
      _: 'inputGroupCallInviteMessage',
      msg_id: getServerMessageId(message.mid)
    };

    const a = document.createElement('a');
    a.classList.add('anchor-join-conference');
    attachClickEvent(a, async() => {
      try {
        await groupCallsController.joinConference({
          input: inviteInput,
          selfUserId: BigInt(rootScope.myId),
          muted: true
        });
      } catch(err) {
        console.error('joinConference failed', err);
      }
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
