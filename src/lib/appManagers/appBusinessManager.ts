import {
  AccountConnectedBots,
  BusinessBotRecipients,
  BusinessBotRights,
  BusinessIntro,
  ConnectedBot,
  InputBusinessBotRecipients,
  InputUser,
  MessageEntity,
  Update,
  User
} from '@layer';
import {AppManager} from '@appManagers/manager';
import getPeerId from '@appManagers/utils/peers/getPeerId';
import {
  DEFAULT_AUTHORIZATION_AUTOCONFIRM_PERIOD,
  normalizeAuthorizationAutoconfirmPeriod
} from '@appManagers/utils/authorizationAutoconfirmPeriod';
import ctx from '@environment/ctx';
import isSameUserId from '@helpers/isSameUserId';

const MAX_TIMEOUT = 0x7fffffff;

export type UpdateConnectedBotOptions = {
  botId?: UserId,
  previousBotId?: UserId,
  recipients?: BusinessBotRecipients.businessBotRecipients,
  rights?: BusinessBotRights.businessBotRights
};

export type BusinessBotSearchResult = {
  userIds: UserId[],
  unsupportedUserId?: UserId
};

export type BotConnectionReview = {
  botId: UserId,
  date?: number,
  device?: string,
  location?: string
};

type PendingConnectedBotPeerRevoke = {
  botId: UserId,
  userId: UserId,
  confirmed: boolean
};

export function applyBotConnectionReviewUpdate(
  reviews: BotConnectionReview[],
  update: Update.updateNewBotConnection
) {
  const withoutBot = reviews.filter((review) => !isSameUserId(review.botId, update.bot_id as UserId));
  if(update.pFlags.confirmed) {
    return withoutBot;
  }

  return [{
    botId: update.bot_id as UserId,
    date: update.date,
    device: update.device,
    location: update.location
  }, ...withoutBot];
}

export function filterExpiredBotConnectionReviews(
  reviews: BotConnectionReview[],
  now: number,
  autoconfirmPeriod = DEFAULT_AUTHORIZATION_AUTOCONFIRM_PERIOD
) {
  return reviews.filter((review) => !review.date || review.date + autoconfirmPeriod > now);
}

export function normalizeBusinessBotUsername(query: string) {
  return query.trim()
  .replace(/^(?:https?:\/\/)?(?:www\.)?(?:t|telegram)\.me\//i, '')
  .replace(/^@/, '')
  .split(/[/?#]/)[0]
  .match(/^[a-z\d_]+$/i)?.[0];
}

export function toInputBusinessBotRecipients(
  recipients: BusinessBotRecipients.businessBotRecipients | undefined,
  getUserInput: (userId: UserId) => InputUser
): InputBusinessBotRecipients.inputBusinessBotRecipients {
  return {
    _: 'inputBusinessBotRecipients',
    pFlags: {...recipients?.pFlags},
    users: recipients?.users?.map((userId) => getUserInput(userId)),
    exclude_users: recipients?.exclude_users?.map((userId) => getUserInput(userId))
  };
}

export function revokeBusinessBotRecipientAccess(
  recipients: BusinessBotRecipients.businessBotRecipients,
  userId: UserId
): BusinessBotRecipients.businessBotRecipients {
  const withoutUser = (userIds: UserId[] = []) => userIds.filter((id) => !isSameUserId(id, userId));
  const withUser = (userIds: UserId[] = []) => [...withoutUser(userIds), userId];
  const users = recipients.pFlags.exclude_selected ?
    withUser(recipients.users) :
    withoutUser(recipients.users);
  const excludeUsers = recipients.pFlags.exclude_selected ?
    withoutUser(recipients.exclude_users) :
    withUser(recipients.exclude_users);

  return {
    ...recipients,
    pFlags: {...recipients.pFlags},
    users: users.length ? users : undefined,
    exclude_users: excludeUsers.length ? excludeUsers : undefined
  };
}

export default class AppBusinessManager extends AppManager {
  private connectedBotBase?: ConnectedBot.connectedBot;
  private connectedBot?: ConnectedBot.connectedBot;
  private connectedBotPromise?: Promise<ConnectedBot.connectedBot | undefined>;
  private connectedBotRequestOutcome?: Promise<ConnectedBot.connectedBot | undefined>;
  private connectedBotRequestId = 0;
  private connectedBotRequestPendingId?: number;
  private connectedBotMutationQueue: Promise<void> = Promise.resolve();
  private pendingConnectedBotPeerRevokes = new Map<number, PendingConnectedBotPeerRevoke>();
  private pendingConnectedBotPeerRevokeId = 0;

  private botConnectionReviews: BotConnectionReview[] = [];
  private botConnectionReviewsPromise?: Promise<void>;
  private botConnectionReviewExpirationTimeout?: number;
  private botConnectionReviewExpirationSchedule = 0;
  private botConnectionReviewsLoaded = false;
  private authorizationAutoconfirmPeriod = DEFAULT_AUTHORIZATION_AUTOCONFIRM_PERIOD;
  private authorizationAutoconfirmPeriodVersion = 0;

  protected after() {
    this.rootScope.addEventListener('app_config', (appConfig) => {
      ++this.authorizationAutoconfirmPeriodVersion;
      this.setAuthorizationAutoconfirmPeriod(
        appConfig.authorization_autoconfirm_period,
        this.botConnectionReviewsLoaded
      );
    });

    this.apiUpdatesManager.addMultipleEventsListeners({
      updateNewBotConnection: (update) => {
        this.loadBotConnectionReviews().then(() => {
          this.setBotConnectionReviews(applyBotConnectionReviewUpdate(this.botConnectionReviews, update));
          this.connectedBotPromise = undefined;
          this.refreshConnectedBot();
        });
      }
    });

    return this.loadBotConnectionReviews();
  }

  public saveBusinessIntro(userId: UserId, intro: BusinessIntro) {
    if(!intro) {
      return;
    }

    intro.sticker = this.appDocsManager.saveDoc(intro.sticker, {type: 'userFull', userId});
    return intro;
  }

  public resolveBusinessChatLink(slug: string) {
    return this.apiManager.invokeApiSingleProcess({
      method: 'account.resolveBusinessChatLink',
      params: {slug},
      processResult: (resolved) => {
        this.appPeersManager.saveApiPeers(resolved);

        const peerId = getPeerId(resolved.peer);
        const {message, entities} = resolved;
        const out: {peerId: PeerId, message: string, entities?: MessageEntity[]/* , totalEntities?: MessageEntity[] */} = {
          peerId,
          message,
          entities
        };

        // this.appMessagesManager.wrapMessageEntities(out);
        return out;
      }
    });
  }

  public getConnectedBot(overwrite?: boolean) {
    if(this.connectedBotPromise && !overwrite) {
      return this.connectedBotPromise;
    }

    const previousRequestId = this.connectedBotRequestId;
    const previousPendingRequestId = this.connectedBotRequestPendingId;
    const requestId = this.connectedBotRequestId = previousRequestId + 1;
    this.connectedBotRequestPendingId = requestId;
    const confirmedPeerRevokeIds = this.getConfirmedConnectedBotPeerRevokeIds();
    let promise: ReturnType<AppBusinessManager['requestConnectedBot']>;
    try {
      promise = this.requestConnectedBot(overwrite);
    } catch(err) {
      if(this.connectedBotRequestId === requestId) {
        this.connectedBotRequestId = previousRequestId;
        this.connectedBotRequestPendingId = previousPendingRequestId;
      }

      throw err;
    }

    const handledPromise = promise.then(
      (result) => {
        if(requestId !== this.connectedBotRequestId) {
          return this.connectedBotRequestOutcome;
        }

        this.connectedBotRequestPendingId = undefined;
        this.clearConnectedBotPeerRevokes(confirmedPeerRevokeIds);
        return this.commitConnectedBotResult(result);
      },
      (err) => {
        if(requestId !== this.connectedBotRequestId) {
          return this.connectedBotRequestOutcome;
        }

        if(this.connectedBotRequestPendingId === requestId) {
          this.connectedBotRequestPendingId = undefined;
        }
        if(this.connectedBotPromise === handledPromise) {
          this.connectedBotPromise = this.connectedBotBase || this.connectedBot ?
            Promise.resolve(this.connectedBot) :
            undefined;
        }

        throw err;
      }
    );
    this.connectedBotRequestOutcome = handledPromise;
    this.connectedBotPromise = handledPromise;

    return this.connectedBotPromise;
  }

  public getBotConnectionReviews() {
    return this.loadBotConnectionReviews().then(() => this.botConnectionReviews);
  }

  public async confirmBotConnection(botId: UserId) {
    const connectedBot = await this.getConnectedBot(true);
    if(!connectedBot || !isSameUserId(connectedBot.bot_id as UserId, botId)) {
      this.recomputeConnectedBot(true);
      return false;
    }

    const result = await this.apiManager.invokeApiSingle('account.confirmBotConnection', {
      bot_id: this.appUsersManager.getUserInput(botId)
    });
    if(result) {
      this.removeBotConnectionReview(botId);
    }

    return result;
  }

  public async rejectBotConnection(botId: UserId) {
    const connectedBot = await this.getConnectedBot(true);
    if(!connectedBot || !isSameUserId(connectedBot.bot_id as UserId, botId)) {
      this.recomputeConnectedBot(true);
      return false;
    }

    await this.updateConnectedBot({previousBotId: botId});
    return true;
  }

  public async searchBusinessBots(query: string): Promise<BusinessBotSearchResult> {
    const username = normalizeBusinessBotUsername(query);
    if(!username) {
      return {userIds: []};
    }

    const user = await this.appUsersManager.resolveUsername(username);
    if(user?._ !== 'user') {
      return {userIds: []};
    }

    return this.isBusinessBot(user) ?
      {userIds: [user.id]} :
      {userIds: [], unsupportedUserId: user.pFlags?.bot ? user.id : undefined};
  }

  public updateConnectedBot(options: UpdateConnectedBotOptions) {
    return this.enqueueConnectedBotMutation(() => this.updateConnectedBotInternal(options));
  }

  private async updateConnectedBotInternal(options: UpdateConnectedBotOptions) {
    const {botId, previousBotId} = options;
    const deleteBot = !botId;
    const targetBotId = botId || previousBotId;
    if(!targetBotId) {
      return;
    }
    if(!await this.hasConnectedBotPrincipal(previousBotId)) {
      this.recomputeConnectedBot(true);
      throw new Error('CONNECTED_BOT_CHANGED');
    }

    const recipients = toInputBusinessBotRecipients(
      deleteBot ? undefined : options.recipients,
      (userId) => this.appUsersManager.getUserInput(userId)
    );
    await this.apiManager.invokeApiSingleProcess({
      method: 'account.updateConnectedBot',
      params: {
        deleted: deleteBot || undefined,
        rights: deleteBot ? undefined : options.rights,
        bot: this.appUsersManager.getUserInput(targetBotId),
        recipients
      },
      processResult: (updates) => {
        this.apiUpdatesManager.processUpdateMessage(updates);
      }
    });
    this.clearConfirmedConnectedBotPeerRevokes();

    let connectedBot: ConnectedBot.connectedBot | undefined;
    let hasCanonicalConnectedBot = true;
    try {
      connectedBot = await this.getConnectedBot(true);
    } catch{
      hasCanonicalConnectedBot = false;
      const cachedConnectedBot = this.connectedBotBase || this.connectedBot;
      const keepCachedMetadata = !deleteBot && cachedConnectedBot &&
        isSameUserId(cachedConnectedBot.bot_id as UserId, targetBotId);
      connectedBot = deleteBot ? undefined : {
        ...(keepCachedMetadata ? cachedConnectedBot : {}),
        _: 'connectedBot',
        bot_id: targetBotId,
        recipients: options.recipients || (keepCachedMetadata ? cachedConnectedBot.recipients : {
          _: 'businessBotRecipients',
          pFlags: {}
        }),
        rights: options.rights || (keepCachedMetadata ? cachedConnectedBot.rights : {
          _: 'businessBotRights',
          pFlags: {}
        })
      };
      connectedBot = this.commitConnectedBotBase(connectedBot);
    }

    connectedBot = this.connectedBot;
    this.rootScope.dispatchEvent('chat_automation_update', connectedBot);

    const targetStillConnected = connectedBot && isSameUserId(connectedBot.bot_id as UserId, targetBotId);
    if(deleteBot && (!hasCanonicalConnectedBot || !targetStillConnected)) {
      this.removeBotConnectionReview(targetBotId);
    } else if(
      !deleteBot &&
      previousBotId &&
      !isSameUserId(previousBotId, botId) &&
      (!hasCanonicalConnectedBot || !isSameUserId(connectedBot?.bot_id as UserId, previousBotId))
    ) {
      this.removeBotConnectionReview(previousBotId);
    }

    if(!hasCanonicalConnectedBot) {
      this.refreshConnectedBot();
    }
  }

  public toggleConnectedBotPaused(peerId: PeerId, paused: boolean, expectedBotId: UserId) {
    return this.enqueueConnectedBotMutation(() => (
      this.toggleConnectedBotPausedInternal(peerId, paused, expectedBotId)
    ));
  }

  private async toggleConnectedBotPausedInternal(
    peerId: PeerId,
    paused: boolean,
    expectedBotId: UserId
  ) {
    if(!await this.hasConnectedBotPrincipal(expectedBotId)) {
      this.recomputeConnectedBot(true);
      throw new Error('CONNECTED_BOT_CHANGED');
    }

    const result = await this.apiManager.invokeApiSingle('account.toggleConnectedBotPaused', {
      peer: this.appPeersManager.getInputPeerById(peerId),
      paused
    });
    if(!result) throw new Error('ACCOUNT_TOGGLE_CONNECTED_BOT_PAUSED_FAILED');

    const modifiedCachedSettings = this.appProfileManager.modifyCachedPeerSettings(peerId, (settings) => {
      if(paused) {
        settings.pFlags.business_bot_paused = true;
        delete settings.pFlags.business_bot_can_reply;
      } else {
        delete settings.pFlags.business_bot_paused;
        settings.pFlags.business_bot_can_reply = true;
      }
    });
    if(!modifiedCachedSettings) {
      Promise.resolve(this.appProfileManager.refreshPeerSettings(peerId)).catch(() => {});
    }
    return result;
  }

  public disablePeerConnectedBot(peerId: PeerId, expectedBotId: UserId) {
    let peerRevokeId: number;
    if(peerId.isUser()) {
      if(!this.connectedBotBase && this.connectedBot) {
        this.connectedBotBase = this.connectedBot;
      }
      peerRevokeId = ++this.pendingConnectedBotPeerRevokeId;
      this.pendingConnectedBotPeerRevokes.set(peerRevokeId, {
        botId: expectedBotId,
        userId: peerId.toUserId(),
        confirmed: false
      });
      this.recomputeConnectedBot(true);
    }

    return this.enqueueConnectedBotMutation(() => (
      this.disablePeerConnectedBotInternal(peerId, expectedBotId, peerRevokeId)
    ));
  }

  private async disablePeerConnectedBotInternal(
    peerId: PeerId,
    expectedBotId: UserId,
    peerRevokeId?: number
  ) {
    let hasExpectedPrincipal: boolean;
    try {
      hasExpectedPrincipal = await this.hasConnectedBotPrincipal(expectedBotId);
    } catch(err) {
      if(peerRevokeId) this.pendingConnectedBotPeerRevokes.delete(peerRevokeId);
      this.recomputeConnectedBot(true);
      throw err;
    }
    if(!hasExpectedPrincipal) {
      if(peerRevokeId) this.pendingConnectedBotPeerRevokes.delete(peerRevokeId);
      this.recomputeConnectedBot(true);
      return true;
    }

    if(peerRevokeId) this.recomputeConnectedBot(true);
    let result = false;
    let requestError: unknown;
    try {
      result = await this.apiManager.invokeApiSingle('account.disablePeerConnectedBot', {
        peer: this.appPeersManager.getInputPeerById(peerId)
      });
      if(!result) {
        throw new Error('ACCOUNT_DISABLE_PEER_CONNECTED_BOT_FAILED');
      }
    } catch(err) {
      requestError = err;
    }

    if(requestError) {
      if(peerRevokeId) this.pendingConnectedBotPeerRevokes.delete(peerRevokeId);
      this.recomputeConnectedBot(true);
    } else {
      const peerRevoke = peerRevokeId && this.pendingConnectedBotPeerRevokes.get(peerRevokeId);
      if(peerRevoke) peerRevoke.confirmed = true;
      this.appProfileManager.modifyCachedPeerSettings(peerId, (settings) => {
        delete settings.pFlags.business_bot_paused;
        delete settings.pFlags.business_bot_can_reply;
        delete settings.business_bot_id;
        delete settings.business_bot_manage_url;
      });
    }

    await this.reconcileConnectedBot();
    if(requestError) throw requestError;

    return result;
  }

  private requestConnectedBot(overwrite?: boolean) {
    return this.apiManager.invokeApiSingleProcess({
      method: 'account.getConnectedBots',
      params: {},
      processResult: (result) => result,
      options: {overwrite}
    });
  }

  private commitConnectedBotResult(result: AccountConnectedBots.accountConnectedBots) {
    this.appPeersManager.saveApiPeers(result);
    return this.commitConnectedBotBase(result.connected_bots[0]);
  }

  private commitConnectedBotBase(connectedBot?: ConnectedBot.connectedBot, dispatch = false) {
    this.connectedBotBase = connectedBot;
    return this.recomputeConnectedBot(dispatch);
  }

  private recomputeConnectedBot(dispatch = false) {
    this.connectedBot = this.applyPendingConnectedBotPeerRevokes(this.connectedBotBase);
    if(this.connectedBotRequestPendingId === undefined) {
      this.connectedBotPromise = Promise.resolve(this.connectedBot);
    }
    if(dispatch) {
      this.rootScope.dispatchEvent('chat_automation_update', this.connectedBot);
    }

    return this.connectedBot;
  }

  private applyPendingConnectedBotPeerRevokes(connectedBot?: ConnectedBot.connectedBot) {
    if(!connectedBot) return connectedBot;

    let recipients = connectedBot.recipients;
    this.pendingConnectedBotPeerRevokes.forEach((peerRevoke) => {
      if(isSameUserId(connectedBot.bot_id as UserId, peerRevoke.botId)) {
        recipients = revokeBusinessBotRecipientAccess(recipients, peerRevoke.userId);
      }
    });

    return recipients === connectedBot.recipients ? connectedBot : {
      ...connectedBot,
      recipients
    };
  }

  private clearConfirmedConnectedBotPeerRevokes() {
    this.pendingConnectedBotPeerRevokes.forEach((peerRevoke, id) => {
      if(peerRevoke.confirmed) this.pendingConnectedBotPeerRevokes.delete(id);
    });
  }

  private getConfirmedConnectedBotPeerRevokeIds() {
    const ids: number[] = [];
    this.pendingConnectedBotPeerRevokes.forEach((peerRevoke, id) => {
      if(peerRevoke.confirmed) ids.push(id);
    });
    return ids;
  }

  private clearConnectedBotPeerRevokes(ids: number[]) {
    ids.forEach((id) => this.pendingConnectedBotPeerRevokes.delete(id));
  }

  private async hasConnectedBotPrincipal(expectedBotId?: UserId) {
    await this.getConnectedBot(true);

    return expectedBotId ?
      !!this.connectedBot && isSameUserId(this.connectedBot.bot_id as UserId, expectedBotId) :
      !this.connectedBot;
  }

  private async reconcileConnectedBot() {
    try {
      await this.getConnectedBot(true);
      this.recomputeConnectedBot(true);
    } catch{
      this.retryConnectedBotReconciliation();
    }
  }

  private retryConnectedBotReconciliation() {
    this.getConnectedBot(true).then(() => {
      this.recomputeConnectedBot(true);
    }).catch(() => {});
  }

  private enqueueConnectedBotMutation<T>(mutation: () => Promise<T>) {
    const result = this.connectedBotMutationQueue.then(mutation, mutation);
    this.connectedBotMutationQueue = result.then(
      (): void => {},
      (): void => {}
    );
    return result;
  }

  private isBusinessBot(user: User) {
    return user?._ === 'user' && !!user.pFlags?.bot_business;
  }

  private loadBotConnectionReviews() {
    const periodVersion = this.authorizationAutoconfirmPeriodVersion;
    return this.botConnectionReviewsPromise ??= this.appStateManager.getState().then((state) => {
      if(periodVersion === this.authorizationAutoconfirmPeriodVersion) {
        this.setAuthorizationAutoconfirmPeriod(
          state.appConfig?.authorization_autoconfirm_period,
          false
        );
      }

      const reviews = state.botConnectionReviews || [];
      const filteredReviews = this.filterExpiredBotConnectionReviews(reviews);
      this.botConnectionReviewsLoaded = true;
      this.setBotConnectionReviews(filteredReviews, filteredReviews.length !== reviews.length);

      if(filteredReviews.length) {
        this.refreshConnectedBot();
      }
    });
  }

  private setAuthorizationAutoconfirmPeriod(period?: number, updateReviews = true) {
    const normalizedPeriod = normalizeAuthorizationAutoconfirmPeriod(period);
    if(this.authorizationAutoconfirmPeriod === normalizedPeriod) return;

    this.authorizationAutoconfirmPeriod = normalizedPeriod;
    if(updateReviews) {
      const reviews = this.filterExpiredBotConnectionReviews(this.botConnectionReviews);
      if(reviews.length !== this.botConnectionReviews.length) {
        this.setBotConnectionReviews(reviews);
      } else {
        this.scheduleBotConnectionReviewsExpiration();
      }
    }
  }

  private filterExpiredBotConnectionReviews(reviews: BotConnectionReview[]) {
    return filterExpiredBotConnectionReviews(
      reviews,
      (Date.now() / 1000 | 0) + this.timeManager.getServerTimeOffset(),
      this.authorizationAutoconfirmPeriod
    );
  }

  private setBotConnectionReviews(reviews: BotConnectionReview[], persist = true) {
    this.botConnectionReviews = reviews;
    if(persist) {
      this.appStateManager.pushToState('botConnectionReviews', reviews);
    }

    this.rootScope.dispatchEvent('bot_connection_reviews_update', reviews);
    this.scheduleBotConnectionReviewsExpiration();
  }

  private removeBotConnectionReview(botId: UserId) {
    const reviews = this.botConnectionReviews.filter((review) => !isSameUserId(review.botId, botId));
    if(reviews.length !== this.botConnectionReviews.length) {
      this.setBotConnectionReviews(reviews);
    }
  }

  private scheduleBotConnectionReviewsExpiration() {
    const schedule = ++this.botConnectionReviewExpirationSchedule;
    if(this.botConnectionReviewExpirationTimeout !== undefined) {
      ctx.clearTimeout(this.botConnectionReviewExpirationTimeout);
      this.botConnectionReviewExpirationTimeout = undefined;
    }

    const datedReviews = this.botConnectionReviews.filter((review) => review.date);
    if(!datedReviews.length) return;

    const now = (Date.now() / 1000 | 0) + this.timeManager.getServerTimeOffset();
    const expiresAt = Math.min(...datedReviews.map((review) => {
      return review.date + this.authorizationAutoconfirmPeriod;
    }));
    const timeout = Math.min(Math.max(0, (expiresAt - now) * 1000), MAX_TIMEOUT);
    this.botConnectionReviewExpirationTimeout = ctx.setTimeout(() => {
      if(schedule !== this.botConnectionReviewExpirationSchedule) return;

      this.botConnectionReviewExpirationTimeout = undefined;
      const reviews = this.filterExpiredBotConnectionReviews(this.botConnectionReviews);
      if(reviews.length !== this.botConnectionReviews.length) {
        this.setBotConnectionReviews(reviews);
      } else {
        this.scheduleBotConnectionReviewsExpiration();
      }
    }, timeout);
  }

  private refreshConnectedBot() {
    this.getConnectedBot(true).then((connectedBot) => {
      this.rootScope.dispatchEvent('chat_automation_update', connectedBot);
    }).catch(() => {});
  }
}
