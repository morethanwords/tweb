/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import limitSymbols from "../../helpers/string/limitSymbols";
import { Chat } from "../../layer";
import { AppManagers } from "../../lib/appManagers/managers";
import I18n from "../../lib/langPack";
import wrapEmojiText from "../../lib/richTextProcessor/wrapEmojiText";
import rootScope from "../../lib/rootScope";

export default async function getPeerTitle(peerId: PeerId, plainText: true, onlyFirstName?: boolean, _limitSymbols?: number, managers?: AppManagers): Promise<string>;
export default async function getPeerTitle(peerId: PeerId, plainText?: false, onlyFirstName?: boolean, _limitSymbols?: number, managers?: AppManagers): Promise<DocumentFragment>;
export default async function getPeerTitle(peerId: PeerId, plainText: boolean, onlyFirstName?: boolean, _limitSymbols?: number, managers?: AppManagers): Promise<DocumentFragment | string>;
export default async function getPeerTitle(peerId: PeerId, plainText = false, onlyFirstName = false, _limitSymbols?: number, managers: AppManagers = rootScope.managers): Promise<DocumentFragment | string> {
  if(!peerId) {
    peerId = rootScope.myId;
  }
  
  let title = '';
  if(peerId.isUser()) {
    const user = await managers.appUsersManager.getUser(peerId.toUserId());
    if(user.first_name) title += user.first_name;
    if(user.last_name && (!onlyFirstName || !title)) title += ' ' + user.last_name;

    if(!title) title = user.pFlags.deleted ? I18n.format(onlyFirstName ? 'Deleted' : 'HiddenName', true) : user.username;
    else title = title.trim();
  } else {
    const chat: Chat.chat = await managers.appChatsManager.getChat(peerId.toChatId());
    title = chat.title;

    if(onlyFirstName) {
      title = title.split(' ')[0];
    }
  }

  if(_limitSymbols !== undefined) {
    title = limitSymbols(title, _limitSymbols, _limitSymbols);
  }
  
  return plainText ? title : wrapEmojiText(title);
}
