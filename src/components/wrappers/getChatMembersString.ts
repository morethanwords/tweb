/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import numberThousandSplitter from '../../helpers/number/numberThousandSplitter';
import {Chat, ChatParticipants} from '../../layer';
import {i18n, LangPackKey} from '../../lib/langPack';
import rootScope from '../../lib/rootScope';

export default async function getChatMembersString(
  chatId: ChatId,
  managers = rootScope.managers,
  chat?: Chat
) {
  chat ??= await managers.appChatsManager.getChat(chatId);
  if(chat._ === 'chatForbidden') {
    return i18n('YouWereKicked');
  }

  const chatFull = await managers.appProfileManager.getCachedFullChat(chatId);
  let count: number;
  if(chatFull) {
    if(chatFull._ === 'channelFull') {
      count = chatFull.participants_count;
    } else {
      count = (chatFull.participants as ChatParticipants.chatParticipants).participants?.length;
    }
  } else {
    count = (chat as Chat.chat).participants_count || (chat as any).participants?.participants.length;
  }

  const isBroadcast = (chat as Chat.channel).pFlags.broadcast;
  count = count || 1;

  const key: LangPackKey = isBroadcast ? 'Peer.Status.Subscribers' : 'Peer.Status.Member';
  return i18n(key, [numberThousandSplitter(count)]);
}
