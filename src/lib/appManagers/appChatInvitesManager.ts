/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import {InputUser} from '../../layer';
import {AppManager} from './manager';
import getPeerId from './utils/peers/getPeerId';

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

  public exportChatInvite({
    chatId,
    expireDate,
    usageLimit,
    requestNeeded,
    title
  }: {
    chatId: ChatId,
    expireDate?: number,
    usageLimit?: number,
    requestNeeded?: boolean,
    title?: string
  }) {
    return this.apiManager.invokeApi('messages.exportChatInvite', {
      peer: this.appChatsManager.getInputPeer(chatId),
      expire_date: expireDate,
      usage_limit: usageLimit,
      request_needed: requestNeeded,
      title
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
    }).then((chatInvites) => {
      this.appUsersManager.saveApiUsers(chatInvites.users);
      return chatInvites;
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
    }).then((chatInvite) => {
      this.appUsersManager.saveApiUsers(chatInvite.users);
      return chatInvite;
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
