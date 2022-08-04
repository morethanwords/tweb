/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import {Message, MessageAction} from '../../layer';
import wrapUrl from '../../lib/richTextProcessor/wrapUrl';

export default function wrapJoinVoiceChatAnchor(message: Message.messageService) {
  const action = message.action as MessageAction.messageActionInviteToGroupCall;
  const {onclick, url} = wrapUrl(`tg://voicechat?chat_id=${message.peerId.toChatId()}&id=${action.call.id}&access_hash=${action.call.access_hash}`);
  if(!onclick) {
    return document.createElement('span');
  }

  const a = document.createElement('a');
  a.href = url;
  a.setAttribute('onclick', onclick + '(this)');

  return a;
}
