import {
  AccountConnectedBots,
  BusinessBotRecipients,
  BusinessBotRights,
  BusinessChatLink,
  BusinessIntro,
  BusinessLocation,
  BusinessWorkHours,
  ConnectedBot,
  GeoPoint,
  InputBusinessBotRecipients,
  InputBusinessChatLink,
  InputUser,
  MessageEntity,
  Update,
  User
} from '@layer';
import {AppManager} from '@appManagers/manager';
import getPeerId from '@appManagers/utils/peers/getPeerId';
import getDocumentInput from '@appManagers/utils/docs/getDocumentInput';
import {
  DEFAULT_AUTHORIZATION_AUTOCONFIRM_PERIOD,
  normalizeAuthorizationAutoconfirmPeriod
} from '@appManagers/utils/authorizationAutoconfirmPeriod';
import ctx from '@environment/ctx';
import isSameUserId from '@helpers/isSameUserId';
import createSerializedQueue, {SerializedQueue} from '@helpers/createSerializedQueue';
import noop from '@helpers/noop';

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

/** A link to chat as it is edited: the preset message and the name only its owner sees. */
export type BusinessChatLinkDraft = {
  message: string,
  entities?: MessageEntity[],
  title?: string
};

/** The start page as it is edited: an empty title and message show the defaults, no sticker a random one. */
export type BusinessIntroDraft = {
  title: string,
  description: string,
  stickerId?: DocId
};

/**
 * What `account.createBusinessChatLink` and `editBusinessChatLink` take: an empty name and no entities
 * are left out, as tdesktop's `Api::ChatLinks` sends them.
 */
export function toInputBusinessChatLink(
  draft: BusinessChatLinkDraft,
  getInputEntities: (entities: MessageEntity[]) => MessageEntity[] | undefined
): InputBusinessChatLink.inputBusinessChatLink {
  const title = draft.title?.trim();
  const entities = draft.entities?.length ? getInputEntities(draft.entities) : undefined;
  return {
    _: 'inputBusinessChatLink',
    message: draft.message,
    entities: entities?.length ? entities : undefined,
    title: title || undefined
  };
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

  /** The links to chat as the server last gave them, by the link: what a change of one part keeps the rest of */
  private chatLinks = new Map<string, BusinessChatLink.businessChatLink>();
  /** One link's edits and its deletion go out one at a time, each from what the one before it left */
  private chatLinkWrites = new Map<string, SerializedQueue>();
  /** Counts the writes to links as they start and as they end */
  private chatLinkWriteVersion = 0;
  /** Each link's last such count: a list asked for before it knows less of the link than `chatLinks` does */
  private chatLinkWritten = new Map<string, number>();

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

  /**
   * `account.updateBusinessWorkHours` — pass nothing to stop showing business hours.
   * Mirrors Android's OpeningHoursActivity.processDone.
   */
  public async updateBusinessWorkHours(workHours?: BusinessWorkHours.businessWorkHours) {
    const hours = workHours?.weekly_open?.length ? workHours : undefined;
    const result = await this.apiManager.invokeApi('account.updateBusinessWorkHours', {
      business_work_hours: hours
    });

    if(!result) {
      throw new Error('ACCOUNT_UPDATE_BUSINESS_WORK_HOURS_FAILED');
    }

    this.appProfileManager.modifyCachedFullUser(this.rootScope.myId.toUserId(), (userFull) => {
      if(hours) userFull.business_work_hours = hours;
      else delete userFull.business_work_hours;
    });

    return hours;
  }

  /**
   * `account.updateBusinessLocation` — pass nothing to remove the location.
   * The geo point is optional: an address alone is a valid business location.
   */
  public async updateBusinessLocation(location?: {address: string, geoPoint?: GeoPoint.geoPoint}) {
    const address = location?.address?.trim();
    const geoPoint = address ? location.geoPoint : undefined;
    const result = await this.apiManager.invokeApi('account.updateBusinessLocation', {
      address: address || undefined,
      geo_point: geoPoint && {
        _: 'inputGeoPoint',
        lat: geoPoint.lat,
        long: geoPoint.long
      }
    });

    if(!result) {
      throw new Error('ACCOUNT_UPDATE_BUSINESS_LOCATION_FAILED');
    }

    const businessLocation: BusinessLocation.businessLocation = address ? {
      _: 'businessLocation',
      address,
      geo_point: geoPoint
    } : undefined;

    this.appProfileManager.modifyCachedFullUser(this.rootScope.myId.toUserId(), (userFull) => {
      if(businessLocation) userFull.business_location = businessLocation;
      else delete userFull.business_location;
    });

    return businessLocation;
  }

  /**
   * `account.updateBusinessIntro` — the start page others see in an empty chat with this account.
   * Nothing to show (no title, no message, no sticker) resets it to the default one, as tdesktop's
   * `BusinessInfo::saveChatIntro` does.
   */
  public async updateBusinessIntro(draft?: BusinessIntroDraft) {
    const title = draft?.title?.trim() || '';
    const description = draft?.description?.trim() || '';
    const sticker = draft?.stickerId ? this.appDocsManager.getDoc(draft.stickerId) : undefined;
    const hasIntro = !!(title || description || sticker);

    const result = await this.apiManager.invokeApi('account.updateBusinessIntro', {
      intro: hasIntro ? {
        _: 'inputBusinessIntro',
        title,
        description,
        sticker: sticker ? getDocumentInput(sticker) : undefined
      } : undefined
    });

    if(!result) {
      throw new Error('ACCOUNT_UPDATE_BUSINESS_INTRO_FAILED');
    }

    const intro: BusinessIntro.businessIntro = hasIntro ? {
      _: 'businessIntro',
      title,
      description,
      sticker
    } : undefined;

    this.appProfileManager.modifyCachedFullUser(this.rootScope.myId.toUserId(), (userFull) => {
      if(intro) userFull.business_intro = intro;
      else delete userFull.business_intro;
    });

    return intro;
  }

  /**
   * `account.getBusinessChatLinks` — the account's links to chat, in the server's order. Asked once the
   * writes on their way have gone out, so that it has them as the server does; a link written to while
   * it was on its way (from another tab, say) is taken as that write left it, not as the answer has it.
   */
  public async getBusinessChatLinks() {
    await Promise.all([...this.chatLinkWrites.values()].map((queue) => queue.enqueue(noop)));
    const askedAt = this.chatLinkWriteVersion;
    const isWrittenSince = (link: string) => (this.chatLinkWritten.get(link) ?? 0) > askedAt;
    return this.apiManager.invokeApiSingleProcess({
      method: 'account.getBusinessChatLinks',
      params: {},
      processResult: (result) => {
        this.appPeersManager.saveApiPeers(result);
        const chatLinks = new Map<string, BusinessChatLink.businessChatLink>();
        (result.links as BusinessChatLink.businessChatLink[]).forEach((link) => {
          // * a link deleted since is not there any more
          const kept = isWrittenSince(link.link) ? this.chatLinks.get(link.link) : link;
          if(kept) chatLinks.set(link.link, kept);
        });
        // * and one created since comes after the rest, the newest last as the server lists them
        this.chatLinks.forEach((link, key) => {
          if(isWrittenSince(key) && !chatLinks.has(key)) chatLinks.set(key, link);
        });
        this.chatLinks = chatLinks;
        return [...chatLinks.values()];
      }
    });
  }

  public async createBusinessChatLink(draft: BusinessChatLinkDraft) {
    const link = await this.apiManager.invokeApi('account.createBusinessChatLink', {
      link: this.toInputBusinessChatLink(draft)
    }) as BusinessChatLink.businessChatLink;
    this.chatLinks.set(link.link, link);
    this.markChatLinkWritten(link.link);
    return link;
  }

  private markChatLinkWritten(link: string) {
    this.chatLinkWritten.set(link, ++this.chatLinkWriteVersion);
  }

  private writeBusinessChatLink<T>(link: string, send: () => Promise<T>) {
    let queue = this.chatLinkWrites.get(link);
    if(!queue) {
      this.chatLinkWrites.set(link, queue = createSerializedQueue());
    }

    return queue.enqueue(async() => {
      this.markChatLinkWritten(link);
      try {
        return await send();
      } finally {
        this.markChatLinkWritten(link);
      }
    });
  }

  /**
   * `account.editBusinessChatLink`. The link itself is the slug the server takes, the way tdesktop
   * and Android pass it; the name and the message are replaced together, so what `changes` leaves out
   * is taken from the link as the edits before this one left it, when this one goes out.
   */
  public editBusinessChatLink(link: string, changes: Partial<BusinessChatLinkDraft>) {
    return this.writeBusinessChatLink(link, async() => {
      const current = this.chatLinks.get(link);
      if(!current) {
        throw new Error('BUSINESS_CHAT_LINK_NOT_FOUND');
      }

      const draft: BusinessChatLinkDraft = {
        message: current.message,
        entities: current.entities,
        title: current.title,
        ...changes
      };
      const edited = await this.apiManager.invokeApi('account.editBusinessChatLink', {
        slug: link,
        link: this.toInputBusinessChatLink(draft)
      }) as BusinessChatLink.businessChatLink;
      this.chatLinks.set(link, edited);
      return edited;
    });
  }

  public deleteBusinessChatLink(link: string) {
    return this.writeBusinessChatLink(link, async() => {
      const result = await this.apiManager.invokeApi('account.deleteBusinessChatLink', {slug: link});
      if(!result) {
        throw new Error('ACCOUNT_DELETE_BUSINESS_CHAT_LINK_FAILED');
      }

      this.chatLinks.delete(link);
      return result;
    });
  }

  private toInputBusinessChatLink(draft: BusinessChatLinkDraft) {
    return toInputBusinessChatLink(draft, (entities) => this.appMessagesManager.getInputEntities(entities));
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
      this.timeManager.getServerTime(),
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

    const now = this.timeManager.getServerTime();
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
