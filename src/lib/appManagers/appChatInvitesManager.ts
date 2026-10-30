import Modes from '@config/modes';
import {ChatInvite, DataJSON, InputUser, StarsSubscriptionPricing, Update, Updates} from '@layer';
import {AppManager} from '@appManagers/manager';
import getPeerId from '@appManagers/utils/peers/getPeerId';

function starsSubscriptionPricing(amount: number): StarsSubscriptionPricing {
  return {
    _: 'starsSubscriptionPricing',
    amount,
    period: Modes.test ? 60 : 2592000
  };
}

/** as many of the latest requesters as the chat's bar of requests shows */
const RECENT_REQUESTERS_LIMIT = 3;

export default class AppChatInvitesManager extends AppManager {
  /** how many `updatePendingJoinRequests` came for each chat (`reloadPendingJoinRequests`) */
  private pendingJoinRequestsRevisions = new Map<PeerId, number>();

  protected after() {
    this.apiUpdatesManager.addMultipleEventsListeners({
      updatePendingJoinRequests: this.onUpdatePendingJoinRequests,
      updateJoinChatWebViewDecision: (update) => {
        this.rootScope.dispatchEvent('join_chat_webview_decision', update);
      }
    });
  }

  private onUpdatePendingJoinRequests = async(
    update: Update.updatePendingJoinRequests
  ) => {
    const peerId = getPeerId(update.peer);
    this.pendingJoinRequestsRevisions.set(peerId, (this.pendingJoinRequestsRevisions.get(peerId) ?? 0) + 1);
    if(this.appCommunitiesManager.handlePendingJoinRequestsUpdate(update)) {
      return;
    }

    const state = await this.appStateManager.getState();
    delete state.hideChatJoinRequests[peerId];
    this.appStateManager.pushToState('hideChatJoinRequests', state.hideChatJoinRequests);
    this.rootScope.dispatchEvent('chat_requests', {
      chatId: peerId.toChatId(),
      recentRequesters: update.recent_requesters,
      requestsPending: update.requests_pending
    });
  };

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
    .then((result) => {
      const processed = this.appChatsManager.processChatInviteJoinResult(result);
      if(processed._ === 'chatInviteJoinWebView') {
        return processed;
      }

      this.apiUpdatesManager.processUpdateMessage(processed);
      const chat = (processed as Updates.updates).chats[0];
      return chat.id;
    });
  }

  public requestChatJoinWebView(queryId: Long, themeParams?: DataJSON) {
    return this.apiManager.invokeApi('messages.requestChatJoinWebView', {
      query_id: queryId,
      theme_params: themeParams ?? this.apiManager.getThemeParams(),
      platform: 'web'
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

  /**
   * Shows a chat's queue of join requests as the server has it now, as its `updatePendingJoinRequests` would - for
   * when one has changed it without saying so. One that comes while the queue is read is the newer word and stays.
   */
  public async reloadPendingJoinRequests(chatId: ChatId) {
    const peerId = chatId.toPeerId(true);
    const revision = this.pendingJoinRequestsRevisions.get(peerId);
    const {count, importers} = await this.getChatInviteImporters({chatId, requested: true, limit: RECENT_REQUESTERS_LIMIT});
    if(this.pendingJoinRequestsRevisions.get(peerId) !== revision) {
      return;
    }

    this.apiUpdatesManager.processLocalUpdate({
      _: 'updatePendingJoinRequests',
      peer: this.appPeersManager.getOutputPeer(peerId),
      requests_pending: count,
      recent_requesters: importers.map((importer) => importer.user_id)
    });
  }
}
