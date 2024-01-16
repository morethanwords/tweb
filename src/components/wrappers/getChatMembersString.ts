/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import callbackify from '../../helpers/callbackify';
import numberThousandSplitter from '../../helpers/number/numberThousandSplitter';
import {Chat, ChatFull} from '../../layer';
import getParticipantsCount from '../../lib/appManagers/utils/chats/getParticipantsCount';
import {i18n, LangPackKey} from '../../lib/langPack';
import apiManagerProxy from '../../lib/mtproto/mtprotoworker';
import rootScope from '../../lib/rootScope';

function _getChatMembersString(chat: Chat, chatFull: ChatFull) {
  let count: number;
  if(chatFull) {
    count = getParticipantsCount(chatFull);
  } else {
    count = (chat as Chat.chat).participants_count || (chat as any).participants?.participants.length;
  }

  const isBroadcast = (chat as Chat.channel).pFlags.broadcast;
  count = count || 1;

  const key: LangPackKey = isBroadcast ? 'Peer.Status.Subscribers' : 'Peer.Status.Member';
  return i18n(key, [numberThousandSplitter(count)]);
}

export default function getChatMembersString(
  chatId: ChatId,
  managers = rootScope.managers,
  chat?: Chat,
  onlySync?: boolean,
  chatFull?: ChatFull
) {
  chat ??= apiManagerProxy.getChat(chatId);
  if(chat._ === 'chatForbidden') {
    return i18n('YouWereKicked');
  }

  if(onlySync) {
    return _getChatMembersString(chat, undefined);
  }

  const result = chatFull || managers.appProfileManager.getCachedFullChat(chatId);
  return callbackify(result, (chatFull) => _getChatMembersString(chat, chatFull));
}
