import {InputGroupCall, Message, MessageAction} from '@layer';
import wrapUrl from '@lib/richTextProcessor/wrapUrl';

export default function wrapJoinVoiceChatAnchor(message: Message.messageService) {
  const action = message.action as
    | MessageAction.messageActionInviteToGroupCall
    | MessageAction.messageActionGroupCall;

  // Legacy voice/video chat in a group/channel — the tg:// URL flow routes
  // through appImManager.joinGroupCall. Only the messageActionGroupCall /
  // messageActionInviteToGroupCall variants carry an InputGroupCall on their
  // `call` field, and both only ever appear for a chat peer. Conference calls
  // (messageActionConferenceCall, always a private chat) are joined from their
  // own bubble instead — see `wrapCallBubble`.
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
