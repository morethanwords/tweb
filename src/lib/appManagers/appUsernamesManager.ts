/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import {AppManager} from './manager';

export default class AppUsernamesManager extends AppManager {
  public toggleUsername({
    username,
    active,
    peerId
  }: {
    username: string,
    active: boolean,
    peerId?: PeerId
  }) {
    if(!peerId || peerId === this.appUsersManager.userId) {
      return this.apiManager.invokeApi('account.toggleUsername', {username, active});
    } else if(peerId.isAnyChat()) {
      const chatId = peerId.toChatId();
      const promise = this.apiManager.invokeApi('channels.toggleUsername', {
        channel: this.appChatsManager.getChannelInput(chatId),
        username,
        active
      });

      return this.appChatsManager.refreshChatAfterRequest(chatId, promise);
    } else {
      return this.apiManager.invokeApi('bots.toggleUsername', {
        bot: this.appUsersManager.getUserInput(peerId),
        username,
        active
      });
    }
  }

  public reorderUsernames({
    peerId,
    order
  }: {
    peerId: PeerId,
    order: string[]
  }) {
    if(!peerId) {
      return this.apiManager.invokeApi('account.reorderUsernames', {order});
    } else if(peerId.isAnyChat()) {
      const chatId = peerId.toChatId();
      const promise = this.apiManager.invokeApi('channels.reorderUsernames', {
        channel: this.appChatsManager.getChannelInput(chatId),
        order
      });

      return this.appChatsManager.refreshChatAfterRequest(chatId, promise);
    } else {
      return this.apiManager.invokeApi('bots.reorderUsernames', {
        bot: this.appUsersManager.getUserInput(peerId),
        order
      });
    }
  }
}
