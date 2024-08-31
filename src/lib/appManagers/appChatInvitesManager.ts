/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import Modes from '../../config/modes';
import {ChatInvite, InputUser, StarsSubscriptionPricing, Updates} from '../../layer';
import {AppManager} from './manager';
import getPeerId from './utils/peers/getPeerId';

function starsSubscriptionPricing(amount: number): StarsSubscriptionPricing {
  return {
    _: 'starsSubscriptionPricing',
    amount,
    period: Modes.test ? 60 : 2592000
  };
}

export default class AppChatInvitesManager extends AppManager {
  protected after() {
    this.apiUpdatesManager.addMultipleEventsListeners({
      updatePendingJoinRequests: async(update) => {
        const peerId = getPeerId(update.peer);
        const state = await this.appStateManager.getState();
        delete state.hideChatJoinRequests[peerId];
        this.appStateManager.pushToState('hideChatJoinRequests', state.hideChatJoinRequests);
        this.rootScope.dispatchEvent('chat_requests', {
          chatId: peerId.toChatId(),
          recentRequesters: update.recent_requesters,
          requestsPending: update.requests_pending
        });
      }
    });
  }

  public saveChatInvite(hash: string, chatInvite: ChatInvite) {
    if(!chatInvite) {
      return;
    }

    if((chatInvite as ChatInvite.chatInvitePeek).chat) {
      this.appChatsManager.saveApiChat((chatInvite as ChatInvite.chatInvitePeek).chat, true);
    }

    if((chatInvite as ChatInvite.chatInvite).photo) {
      (chatInvite as ChatInvite.chatInvite).photo = this.appPhotosManager.savePhoto(
        (chatInvite as ChatInvite.chatInvite).photo,
        {type: 'chatInvite', hash}
      );
    }

    return chatInvite;
  }

  public exportChatInvite({
    chatId,
    expireDate,
    usageLimit,
    requestNeeded,
    title,
    stars
  }: {
    chatId: ChatId,
    expireDate?: number,
    usageLimit?: number,
    requestNeeded?: boolean,
    title?: string,
    stars?: number
  }) {
    return this.apiManager.invokeApi('messages.exportChatInvite', {
      peer: this.appChatsManager.getInputPeer(chatId),
      expire_date: expireDate,
      usage_limit: usageLimit,
      request_needed: requestNeeded,
      title,
      subscription_pricing: stars ? starsSubscriptionPricing(stars) : undefined
    });
  }

  public checkChatInvite(hash: string) {
    return this.apiManager.invokeApi('messages.checkChatInvite', {hash}).then((chatInvite) => {
      return this.appChatInvitesManager.saveChatInvite(hash, chatInvite);
    });
  }

  public importChatInvite(hash: string) {
    return this.apiManager.invokeApi('messages.importChatInvite', {hash})
    .then((updates) => {
      this.apiUpdatesManager.processUpdateMessage(updates);
      const chat = (updates as Updates.updates).chats[0];
      return chat.id;
    });
  }

  public getExportedChatInvites({
    chatId,
    revoked,
    adminId
  }: {
    chatId: ChatId,
    revoked?: boolean,
    adminId?: UserId
  }) {
    return this.apiManager.invokeApi('messages.getExportedChatInvites', {
      peer: this.appChatsManager.getInputPeer(chatId),
      admin_id: adminId ? this.appUsersManager.getUserInput(adminId) : {_: 'inputUserSelf'},
      limit: 50,
      revoked
    }).then((exportedChatInvites) => {
      this.appUsersManager.saveApiUsers(exportedChatInvites.users);
      return exportedChatInvites;
    });
  }

  public editExportedChatInvite({
    chatId,
    link,
    expireDate,
    usageLimit,
    requestNeeded,
    title,
    revoked
  }: {
    chatId: ChatId,
    link: string,
    expireDate?: number,
    usageLimit?: number,
    requestNeeded?: boolean,
    title?: string,
    revoked?: boolean
  }) {
    return this.apiManager.invokeApi('messages.editExportedChatInvite', {
      peer: this.appChatsManager.getInputPeer(chatId),
      revoked,
      link,
      expire_date: expireDate,
      usage_limit: usageLimit,
      request_needed: requestNeeded,
      title
    }).then((exportedChatInvite) => {
      this.appUsersManager.saveApiUsers(exportedChatInvite.users);
      return exportedChatInvite;
    });
  }

  public deleteRevokedExportedChatInvites(chatId: ChatId, adminId?: UserId) {
    return this.apiManager.invokeApi('messages.deleteRevokedExportedChatInvites', {
      peer: this.appChatsManager.getInputPeer(chatId),
      admin_id: this.appUsersManager.getUserInput(adminId)
    });
  }

  public deleteExportedChatInvite(chatId: ChatId, link: string) {
    return this.apiManager.invokeApi('messages.deleteExportedChatInvite', {
      peer: this.appChatsManager.getInputPeer(chatId),
      link
    });
  }

  public getAdminsWithInvites(chatId: ChatId) {
    return this.apiManager.invokeApi('messages.getAdminsWithInvites', {
      peer: this.appChatsManager.getInputPeer(chatId)
    }).then((chatAdminsWithInvites) => {
      this.appUsersManager.saveApiUsers(chatAdminsWithInvites.users);
      return chatAdminsWithInvites;
    });
  }

  public getChatInviteImporters({
    chatId,
    limit = 50,
    offsetDate = 0,
    offsetUserId,
    link,
    q,
    requested
  }: {
    chatId: ChatId,
    limit?: number,
    offsetDate?: number,
    offsetUserId?: UserId,
    link?: string,
    q?: string,
    requested?: boolean
  }) {
    const offsetUser: InputUser = offsetUserId ? this.appUsersManager.getUserInput(offsetUserId) : {_: 'inputUserEmpty'};
    return this.apiManager.invokeApi('messages.getChatInviteImporters', {
      peer: this.appChatsManager.getInputPeer(chatId),
      limit,
      offset_date: offsetDate,
      offset_user: offsetUser,
      link,
      q,
      requested
    }).then((chatInviteImporters) => {
      this.appUsersManager.saveApiUsers(chatInviteImporters.users);
      return chatInviteImporters;
    });
  }
}
