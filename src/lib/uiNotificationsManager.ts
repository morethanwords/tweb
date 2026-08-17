import type {PushNotificationObject} from '@lib/serviceWorker/push';
import getPeerTitle from '@components/wrappers/getPeerTitle';
import wrapMessageForReply from '@components/wrappers/messageForReply';
import {FontFamily} from '@config/font';
import {NOTIFICATION_BADGE_PATH, NOTIFICATION_ICON_PATH} from '@config/notifications';
import {IS_MOBILE} from '@environment/userAgent';
import IS_VIBRATE_SUPPORTED from '@environment/vibrateSupport';
import deferredPromise, {CancellablePromise} from '@helpers/cancellablePromise';
import idleController from '@helpers/idleController';
import tsNow from '@helpers/tsNow';
import {Reaction, User} from '@layer';
import I18n, {FormatterArguments, LangPackKey} from '@lib/langPack';
import singleInstance from '@lib/singleInstance';
import fixEmoji from '@lib/richTextProcessor/fixEmoji';
import wrapPlainText from '@lib/richTextProcessor/wrapPlainText';
import getMessageThreadId from '@appManagers/utils/messages/getMessageThreadId';
import getPeerId from '@appManagers/utils/peers/getPeerId';
import {logger} from '@lib/logger';
import LazyLoadQueueBase from '@components/lazyLoadQueueBase';
import webPushApiManager from '@lib/webPushApiManager';
import rootScope, {BroadcastEvents} from '@lib/rootScope';
import appImManager from '@lib/appImManager';
import {getCurrentAccount} from '@lib/accounts/getCurrentAccount';
import limitSymbols from '@helpers/string/limitSymbols';
import apiManagerProxy, {NotificationBuildTaskPayload, NotificationBuildStoryTaskPayload, NotificationBuildStoryReactionTaskPayload} from '@lib/apiManagerProxy';
import commonStateStorage from '@lib/commonStateStorage';
import type {ActiveAccountNumber} from '@lib/accounts/types';
import {createProxiedManagersForAccount, ProxiedManagers} from '@lib/getProxiedManagers';
import AccountController from '@lib/accounts/accountController';
import {createAppURLForAccount} from '@lib/accounts/createAppURLForAccount';
import createNotificationImage from '@helpers/createNotificationImage';
import {getMiddleware, MiddlewareHelper} from '@helpers/middleware';
import {FOLDER_ID_ALL} from '@appManagers/constants';
import PasscodeLockScreenController from '@components/passcodeLock/passcodeLockScreenController';
import {StateSettings} from '@config/state';
import {useAppSettings} from '@stores/appSettings';
import {unwrap} from 'solid-js/store';
import AudioAssetPlayer from '@helpers/audioAssetPlayer';
import {createEffect, createRoot, on} from 'solid-js';
import appNavigationController from '@components/appNavigationController';

type MyNotification = Notification & {
  hidden?: boolean,
  show?: () => void,
};

export type NotifyOptions = Partial<{
  tag: string;
  image: string;
  key: NotificationKey;
  title: string;
  message: string;
  silent: boolean;
  onclick: () => void;
  noIncrement: boolean;
}>;

export type NotificationSettings = StateSettings['notifications'];

const SHOW_NOTIFICATIONS_FOR_OTHER_ACCOUNT = false;

// * push loc_key prefix of a reaction to our own story ('REACT_STORY', 'REACT_STORY_HIDDEN')
const STORY_REACTION_LOC_KEY = 'REACT_STORY';

// * cancels are fired per message, so batch them into a single storage write
const CANCEL_FLUSH_TIMEOUT = 100;
const MAX_PENDING_NOTIFICATIONS = 1000;

type Account = {managers: ProxiedManagers};
type NotificationKey = BroadcastEvents['notification_cancel'];
type PendingNotifications = Partial<Record<ActiveAccountNumber, NotificationKey[]>>;
/** peerId -> the message id everything is read up to */
type CancelledRanges = Map<PeerId, number>;

function matchesCancelledRange(key: NotificationKey, accountNumber: ActiveAccountNumber, ranges: CancelledRanges) {
  if(!ranges) {
    return false;
  }

  const [type, keyAccountNumber, peerId, mid] = key.split('_');
  if(type !== 'msg' || +keyAccountNumber !== accountNumber) {
    return false;
  }

  const maxId = ranges.get(+peerId as PeerId);
  return maxId !== undefined && +mid <= maxId;
}

function wrapUserName(user: User.user) {
  let name = user.first_name;
  if(user.last_name) name += ' ' + user.last_name;

  name = limitSymbols(name, 12, 15);
  return wrapPlainText(name);
}

export class UiNotificationsManager {
  private notificationsUiSupport: boolean;
  private notificationsShown: {[key: NotificationKey]: MyNotification | true};
  private notificationsQueue: LazyLoadQueueBase;
  private notificationIndex: number;
  private soundsPlayed: {[tag: string]: number};
  private vibrateSupport: boolean;

  private faviconElements: HTMLLinkElement[];

  private titleBackup: string;
  private titleChanged: boolean;
  private titleMiddlewareHelper: MiddlewareHelper;
  private prevFavicon: string;

  private stopped: boolean;

  private cancelledKeys: Set<NotificationKey>;
  private cancelledRanges: Map<ActiveAccountNumber, CancelledRanges>;
  private cancelTimeout: number;

  private topMessagesDeferred: CancellablePromise<void>;

  private setAppBadge: (contents?: any) => Promise<void>;

  private log: ReturnType<typeof logger>;

  public accounts: Map<ActiveAccountNumber, Account>;

  private audioAssetPlayer: AudioAssetPlayer<Record<'notification', string>>;

  private appSettings: StateSettings;

  private get settings() {
    return this.appSettings.notifications;
  }

  private async getPendingNotifications(): Promise<PendingNotifications> {
    return (await commonStateStorage.get('pendingNotifications', false)) || {};
  }

  public async getNotificationsCountForAllAccounts(): Promise<Partial<Record<ActiveAccountNumber, number>>> {
    const pending = await this.getPendingNotifications();
    const count: Partial<Record<ActiveAccountNumber, number>> = {};
    for(const key in pending) {
      const accountNumber = +key as ActiveAccountNumber;
      count[accountNumber] = pending[accountNumber]?.length || 0;
    }

    return count;
  }

  private async getNotificationsCountForAllAccountsForTitle() {
    const notificationsCount = await this.getNotificationsCountForAllAccounts();
    const shouldCount = (accountNumber: ActiveAccountNumber) =>
      accountNumber === getCurrentAccount() ||
      (SHOW_NOTIFICATIONS_FOR_OTHER_ACCOUNT && !apiManagerProxy.hasTabOpenFor(accountNumber));

    const count = Object.entries(notificationsCount).reduce(
      (prev, [accountNumber, count]) => prev + (shouldCount(+accountNumber as ActiveAccountNumber) ? count : 0) || 0,
      0
    );

    return count;
  }

  private async modifyPendingNotifications(
    accountNumber: ActiveAccountNumber,
    modify: (keys: NotificationKey[]) => NotificationKey[]
  ) {
    // * make it safe to call from multiple tabs
    await navigator.locks.request('notificationsCount', async() => {
      const pending = await this.getPendingNotifications();
      const keys = pending[accountNumber] || [];

      let newKeys = modify(keys);
      if(newKeys.length > MAX_PENDING_NOTIFICATIONS) {
        newKeys = newKeys.slice(newKeys.length - MAX_PENDING_NOTIFICATIONS);
      }

      if(newKeys.length === keys.length && newKeys.every((key, idx) => key === keys[idx])) {
        return;
      }

      await commonStateStorage.set({
        pendingNotifications: {
          ...pending,
          [accountNumber]: newKeys
        }
      });
      rootScope.dispatchEvent('notification_count_update');
    });
  }

  private addPendingNotification(key: NotificationKey, accountNumber: ActiveAccountNumber) {
    return this.modifyPendingNotifications(accountNumber, (keys) => {
      return keys.includes(key) ? keys : keys.concat(key);
    });
  }

  private clearPendingNotifications(accountNumber: ActiveAccountNumber) {
    return this.modifyPendingNotifications(accountNumber, () => []);
  }

  /**
   * The count is kept in a storage shared by every tab, while the notifications themselves are only
   * known to the tab that has shown them. Cancelling has to go through that storage too, otherwise
   * the badge stays stuck whenever the messages are read anywhere else — another tab, another
   * client, or this very tab before a reload.
   */
  private queueNotificationCancel(key: NotificationKey) {
    this.cancelledKeys.add(key);
    this.scheduleNotificationCancelFlush();
  }

  private queueNotificationCancelUpTo({accountNumber, peerId, maxId}: BroadcastEvents['notification_cancel_up_to']) {
    let ranges = this.cancelledRanges.get(accountNumber);
    if(!ranges) {
      this.cancelledRanges.set(accountNumber, ranges = new Map());
    }

    ranges.set(peerId, Math.max(ranges.get(peerId) || 0, maxId));
    this.scheduleNotificationCancelFlush();
  }

  private scheduleNotificationCancelFlush() {
    if(this.cancelTimeout !== undefined) {
      return;
    }

    this.cancelTimeout = window.setTimeout(this.flushNotificationCancels, CANCEL_FLUSH_TIMEOUT);
  }

  private flushNotificationCancels = () => {
    this.cancelTimeout = undefined;

    const keys = this.cancelledKeys;
    const ranges = this.cancelledRanges;
    this.cancelledKeys = new Set();
    this.cancelledRanges = new Map();

    const accountNumbers = new Set<ActiveAccountNumber>(ranges.keys());
    for(const key of keys) {
      const accountNumber = +key.split('_')[1] as ActiveAccountNumber;
      if(accountNumber) {
        accountNumbers.add(accountNumber);
      }
    }

    for(const accountNumber of accountNumbers) {
      const peerRanges = ranges.get(accountNumber);
      this.modifyPendingNotifications(accountNumber, (pendingKeys) => pendingKeys.filter((key) => {
        return !keys.has(key) && !matchesCancelledRange(key, accountNumber, peerRanges);
      }));
    }
  };

  construct() {
    this.notificationsUiSupport = ('Notification' in window) || ('mozNotification' in navigator);
    this.notificationsShown = {};
    this.notificationsQueue = new LazyLoadQueueBase(1);
    this.notificationIndex = 0;
    this.soundsPlayed = {};
    this.vibrateSupport = IS_VIBRATE_SUPPORTED;

    this.faviconElements = Array.from(document.head.querySelectorAll<HTMLLinkElement>('link[rel="icon"], link[rel="alternate icon"]'));

    this.titleBackup = document.title;
    this.titleChanged = false;
    this.titleMiddlewareHelper = getMiddleware();

    this.stopped = true;

    this.cancelledKeys = new Set();
    this.cancelledRanges = new Map();

    this.topMessagesDeferred = deferredPromise<void>();

    this.setAppBadge = (navigator as any).setAppBadge?.bind(navigator);
    this.setAppBadge?.(0);

    this.log = logger('NOTIFICATIONS');

    this.accounts = new Map();

    this.audioAssetPlayer = new AudioAssetPlayer({
      notification: 'notification.mp3'
    });

    this.appSettings = useAppSettings()[0];

    // * set listeners

    rootScope.addEventListener('settings_updated', this.updateLocalSettings);

    rootScope.addEventListener('notification_reset', (peerString) => {
      this.soundReset(peerString);
    });

    rootScope.addEventListener('notification_cancel', (str) => {
      this.cancel(str);
    });

    rootScope.addEventListener('notification_cancel_up_to', (payload) => {
      const {accountNumber, peerId, maxId} = payload;
      const ranges: CancelledRanges = new Map([[peerId, maxId]]);
      for(const key in this.notificationsShown) {
        if(matchesCancelledRange(key as NotificationKey, accountNumber, ranges)) {
          this.cancel(key as NotificationKey);
        }
      }

      this.queueNotificationCancelUpTo(payload);
    });

    if(this.setAppBadge) {
      rootScope.addEventListener('folder_unread', (folder) => {
        if(folder.id === FOLDER_ID_ALL) {
          this.setAppBadge(folder.unreadUnmutedPeerIds.size);
        }
      });
    }

    createRoot((dispose) => {
      createEffect(on(() => this.settings.push, this.onPushConditionsChange));
    });

    rootScope.addEventListener('dialogs_multiupdate', () => {
      // unregisterTopMsgs()
      this.topMessagesDeferred.resolve();
    }, {once: true});

    webPushApiManager.addEventListener('push_notification_click', async(notificationData) => {
      if(notificationData.p) { // * decrypt push notification
        notificationData = await apiManagerProxy.pushSingleManager.decryptPush(notificationData.p, notificationData.keyIdBase64);
        notificationData = await apiManagerProxy.serviceMessagePort.invoke('fillPushObject', notificationData);
      }

      if(notificationData.action === 'push_settings') {
        /* this.topMessagesDeferred.then(() => {
          $modal.open({
            templateUrl: templateUrl('settings_modal'),
            controller: 'SettingsModalController',
            windowClass: 'settings_modal_window mobile_modal',
            backdrop: 'single'
          })
        }); */
        return;
      }

      // * can be undefined if push is decrypted here
      if(
        notificationData.accountNumber !== undefined &&
        notificationData.accountNumber !== getCurrentAccount()
      ) {
        return;
      }

      const {custom} = notificationData;
      // * a reaction to OUR story ('REACT_STORY' / 'REACT_STORY_HIDDEN'): the story is ours,
      // * the push peer is whoever reacted — so this must NOT be routed by peer
      const isStoryReaction = !!notificationData.loc_key?.startsWith(STORY_REACTION_LOC_KEY);

      const peerId = custom && custom.peerId.toPeerId();
      if(!peerId && !isStoryReaction) {
        return;
      }

      this.topMessagesDeferred.then(async() => {
        const managers = rootScope.managers;

        if(isStoryReaction) {
          // * the server sends the story id as msg_id, our own notification as story_id
          const storyId = +(custom?.story_id || custom?.msg_id) || undefined;
          const self = await managers.appUsersManager.getSelf();
          appImManager.openStoriesForPeer(self.id.toPeerId(), storyId);
          return;
        }

        const chatId = peerId.isAnyChat() ? peerId.toChatId() : undefined;
        let channelId: ChatId;
        if(chatId) {
          if(!(await managers.appChatsManager.hasChat(chatId))) {
            return;
          }

          channelId = await managers.appChatsManager.isChannel(chatId) ? chatId : undefined;
        }

        if(!chatId && !(await managers.appUsersManager.hasUser(peerId.toUserId()))) {
          return;
        }

        if(custom.story_id) {
          appImManager.openStoriesForPeer(peerId);
          return;
        }

        const lastMsgId = await managers.appMessagesIdsManager.generateMessageId(+custom.msg_id, channelId);

        appImManager.setInnerPeer({
          peerId,
          lastMsgId
        });
      });
    });
  }

  public onPushConditionsChange = async() => {
    const needPush = this.settings.push &&
      webPushApiManager.isAvailable &&
      Notification.permission === 'granted';

    let tokenData = await webPushApiManager.getSubscription();
    if(needPush) {
      tokenData ||= await webPushApiManager.subscribe();
      if(tokenData) {
        apiManagerProxy.pushSingleManager.registerDevice(tokenData);
      }
    } else if(tokenData) {
      webPushApiManager.unsubscribe();
      apiManagerProxy.pushSingleManager.unregisterDevice(tokenData);
    }
  };

  public async buildNotificationQueue(options: Parameters<UiNotificationsManager['buildNotification']>[0]) {
    this.notificationsQueue.push({
      load: () => this.buildNotification(options)
    });
  }

  public async buildNotification(payload: NotificationBuildTaskPayload) {
    if('story' in payload) {
      return this.buildStoryNotification(payload);
    }

    if('storyReaction' in payload) {
      return this.buildStoryReactionNotification(payload);
    }

    const {
      fwdCount,
      peerReaction,
      peerTypeNotifySettings,
      isOtherTabActive,
      accountNumber
    } = payload;
    let {message} = payload;
    const peerId = message.peerId;
    const isAnyChat = peerId.isAnyChat();
    const notification: NotifyOptions = {};
    const account = this.accounts.get(accountNumber);
    const [peerString, isForum = false] = await Promise.all([
      account.managers.appPeersManager.getPeerString(peerId),
      isAnyChat && account.managers.appPeersManager.isForum(peerId)
    ]);
    let notificationMessage: string;
    let wrappedMessage = false;

    const isLocked = PasscodeLockScreenController.getIsLocked();

    if(peerTypeNotifySettings.show_previews && !isLocked) {
      if(message._ === 'message' && message.fwd_from && fwdCount > 1) {
        notificationMessage = I18n.format('Notifications.Forwarded', true, [fwdCount]);
      } else {
        notificationMessage = await wrapMessageForReply({message, plain: true, managers: account.managers});

        const emoticon = await this.getReactionEmoticon(account.managers, peerReaction?.reaction);
        if(emoticon) {
          const langPackKey: LangPackKey = /* isAnyChat ? 'Notification.Group.Reacted' :  */'Notification.Contact.Reacted';
          const args: FormatterArguments = [
            fixEmoji(emoticon), // can be plain heart
            notificationMessage
          ];

          /* if(isAnyChat) {
            args.unshift(appPeersManager.getPeerTitle(message.fromId, true));
          } */

          notificationMessage = I18n.format(langPackKey, true, args);
        } else {
          wrappedMessage = true;
        }
      }
    } else {
      notificationMessage = I18n.format('Notifications.New', true);
    }

    if(peerReaction) {
      notification.noIncrement = true;
    }

    const peerTitleOptions/* : Partial<Parameters<typeof getPeerTitle>[0]> */ = {
      plainText: true as const,
      managers: account.managers
    };

    const threadId = isForum ? getMessageThreadId(message, {isForum}) : undefined;
    const notificationFromPeerId = peerReaction ? getPeerId(peerReaction.peer_id) : message.fromId;
    const peerTitle = notification.title = await getPeerTitle({...peerTitleOptions, peerId, threadId: threadId, managers: account.managers, useManagers: true});
    if(isForum) {
      const peerTitle = await getPeerTitle({...peerTitleOptions, peerId});
      notification.title += ` (${peerTitle})`;

      if(wrappedMessage && notificationFromPeerId !== message.peerId) {
        notificationMessage = await getPeerTitle({...peerTitleOptions, peerId: notificationFromPeerId, managers: account.managers, useManagers: true}) +
          ': ' + notificationMessage;
      }
    } else if(isAnyChat && notificationFromPeerId !== message.peerId) {
      notification.title = await getPeerTitle({...peerTitleOptions, peerId: notificationFromPeerId, managers: account.managers, useManagers: true}) +
        ' @ ' +
        notification.title;
    }

    const isDifferentAccount = accountNumber !== getCurrentAccount();

    notification.onclick = () => {
      if(isDifferentAccount) {
        const url = createAppURLForAccount(accountNumber, {
          p: '' + peerId,
          message: '' + (message.mid || ''),
          thread: '' + (threadId || '')
        });

        window.open(url, '_blank');
      } else {
        appImManager.setInnerPeer({peerId, lastMsgId: message.mid, threadId});
      }
    };

    notification.message = notificationMessage;
    notification.key = `msg_${accountNumber}_${message.peerId}_${message.mid}`;

    if(!peerReaction) { // ! WARNING, message can be already read
      message = await account.managers.appMessagesManager.getMessageByPeer(message.peerId, message.mid);
      if(!message || !message.pFlags.unread) return;
    }

    const result = await this.finishNotification({
      notification,
      account,
      accountNumber,
      isDifferentAccount,
      isOtherTabActive,
      peerId,
      peerString,
      peerTitle,
      hideContent: isLocked,
      custom: {
        msg_id: '' + message.mid,
        peerId: '' + peerId
      }
    });

    if(result && await apiManagerProxy.pushSingleManager.isRegistered()) {
      webPushApiManager.ignorePushByMid(peerId, message.mid);
    }
  }

  private async buildStoryNotification({
    story: {peerId, storyId},
    accountNumber,
    isOtherTabActive
  }: NotificationBuildStoryTaskPayload) {
    const account = this.accounts.get(accountNumber);
    if(!account) {
      return;
    }

    const {peerString, peerTitle} = await this.getNotificationPeer(account, peerId);
    const isDifferentAccount = accountNumber !== getCurrentAccount();

    return this.finishNotification({
      notification: {
        title: peerTitle,
        message: I18n.format('Story.Notification', true),
        key: `story_${accountNumber}_${peerId}_${storyId}`,
        // * stories shouldn't play the notification sound nor bump the tab-title counter
        noIncrement: true,
        onclick: () => {
          if(isDifferentAccount) {
            const url = createAppURLForAccount(accountNumber, {p: '' + peerId, story: '1'});
            window.open(url, '_blank');
          } else {
            appImManager.openStoriesForPeer(peerId);
          }
        }
      },
      account,
      accountNumber,
      isDifferentAccount,
      isOtherTabActive,
      peerId,
      peerString,
      peerTitle,
      hideContent: PasscodeLockScreenController.getIsLocked(),
      custom: {
        msg_id: '0',
        story_id: '' + storyId,
        peerId: '' + peerId
      }
    });
  }

  private async buildStoryReactionNotification({
    storyReaction: {peerId, storyId, reaction, showPreview},
    accountNumber,
    isOtherTabActive
  }: NotificationBuildStoryReactionTaskPayload) {
    const account = this.accounts.get(accountNumber);
    if(!account) {
      return;
    }

    const [{peerString, peerTitle}, emoticon, self] = await Promise.all([
      this.getNotificationPeer(account, peerId),
      this.getReactionEmoticon(account.managers, reaction),
      account.managers.appUsersManager.getSelf()
    ]);

    // * without a preview the notification must not tell who reacted with what
    const hideContent = !showPreview || !emoticon || PasscodeLockScreenController.getIsLocked();
    const selfPeerId = self.id.toPeerId();
    const isDifferentAccount = accountNumber !== getCurrentAccount();

    return this.finishNotification({
      notification: {
        title: hideContent ? I18n.format('Story.Notification.ReactedHiddenSender', true) : peerTitle,
        message: hideContent ?
          I18n.format('Story.Notification.ReactedHidden', true) :
          I18n.format('Story.Notification.Reacted', true, [fixEmoji(emoticon)]),
        key: `storyReaction_${accountNumber}_${peerId}_${storyId}`,
        // * reactions shouldn't play the notification sound nor bump the tab-title counter
        noIncrement: true,
        // * open our own story that was reacted to, as the mobile clients do
        onclick: () => {
          if(isDifferentAccount) {
            const url = createAppURLForAccount(accountNumber, {
              p: '' + selfPeerId,
              story: '1',
              story_id: '' + storyId
            });
            window.open(url, '_blank');
          } else {
            appImManager.openStoriesForPeer(selfPeerId, storyId);
          }
        }
      },
      account,
      accountNumber,
      isDifferentAccount,
      isOtherTabActive,
      peerId,
      peerString,
      peerTitle,
      hideContent,
      self,
      locKey: STORY_REACTION_LOC_KEY,
      custom: {
        msg_id: '0',
        story_id: '' + storyId,
        peerId: '' + selfPeerId
      }
    });
  }

  // * the peer a notification is attributed to: its title is (part of) the notification
  // * title, its avatar is the image and its string is the tag notifications collapse by
  private async getNotificationPeer(account: Account, peerId: PeerId) {
    const [peerString, peerTitle] = await Promise.all([
      account.managers.appPeersManager.getPeerString(peerId),
      getPeerTitle({peerId, plainText: true, managers: account.managers, useManagers: true})
    ]);

    return {peerString, peerTitle};
  }

  /**
   * Shared tail of every builder: the other-account title suffix, the peer's avatar, the
   * passcode-lock override and the push payload boilerplate.
   */
  private async finishNotification({
    notification,
    account,
    accountNumber,
    isDifferentAccount,
    isOtherTabActive,
    peerId,
    peerString,
    peerTitle,
    hideContent,
    self,
    custom,
    locKey
  }: {
    notification: NotifyOptions,
    account: Account,
    accountNumber: ActiveAccountNumber,
    isDifferentAccount: boolean,
    isOtherTabActive: boolean,
    peerId: PeerId,
    peerString: string,
    peerTitle: string,
    /** don't reveal who it's from nor what it says: passcode lock, or previews turned off */
    hideContent?: boolean,
    /** pass it when already resolved, otherwise it's fetched only when the suffix is needed */
    self?: User.user,
    custom: PushNotificationObject['custom'],
    /** the server's loc_key this notification stands in for, so a click routes the same way */
    locKey?: string
  }) {
    const hasMoreThanOneAccount = (await AccountController.getTotalAccounts()) > 1;
    if((hasMoreThanOneAccount && isOtherTabActive) || isDifferentAccount) {
      // ' ➜ '
      notification.title += ' ➜ ' + wrapUserName(self ?? await account.managers.appUsersManager.getSelf());
    }

    notification.title = wrapPlainText(notification.title);
    notification.tag = peerString;
    notification.silent = true;// message.pFlags.silent || false;

    if(!hideContent) {
      notification.image = await createNotificationImage(account.managers, peerId, peerTitle);
    }

    if(PasscodeLockScreenController.getIsLocked()) {
      notification.title = I18n.format('PasscodeLock.NotificationTitle', true);
      notification.message = I18n.format('PasscodeLock.NotificationDescription', true);
    }

    return this.notify(notification, {
      custom,
      // * only routing matters here: the service-worker fallback reads it back on click
      loc_key: locKey || '',
      description: '',
      loc_args: [],
      mute: '',
      random_id: 0,
      title: '',
      accountNumber
    });
  }

  private async getReactionEmoticon(managers: ProxiedManagers, reaction: Reaction) {
    if(reaction?._ === 'reactionEmoji') {
      return reaction.emoticon;
    }

    if(reaction?._ === 'reactionCustomEmoji') {
      const doc = await managers.appEmojiManager.getCustomEmojiDocument(reaction.document_id);
      return doc?.stickerEmojiRaw;
    }
  }

  private constructAndStartNotificationManagerFor(accountNumber: ActiveAccountNumber) {
    if(this.accounts.has(accountNumber)) {
      return;
    }

    const account: Account = {
      managers: createProxiedManagersForAccount(accountNumber)
    };
    this.accounts.set(accountNumber, account);
    account.managers.apiUpdatesManager.attach();
  }

  public constructAndStartAll() {
    this.construct();

    rootScope.addEventListener('account_logged_in', ({accountNumber}) => {
      this.constructAndStartNotificationManagerFor(accountNumber);
    });

    singleInstance.addEventListener('deactivated', () => {
      this.stop();
    });

    singleInstance.addEventListener('activated', () => {
      if(this.stopped) {
        this.start();
      }
    });

    idleController.addEventListener('change', (idle) => {
      if(this.stopped) {
        return;
      }

      if(!idle) {
        for(const accountNumber of this.accounts.keys()) {
          if(
            (SHOW_NOTIFICATIONS_FOR_OTHER_ACCOUNT && !apiManagerProxy.hasTabOpenFor(accountNumber)) ||
            accountNumber === getCurrentAccount()
          ) {
            this.clear(accountNumber);
          }
        }
      }

      this.toggleToggler();
    });

    // *

    this.start();
    this.log('start');

    this.updateLocalSettings();
    rootScope.managers.appStateManager.getState().then(() => {
      if(this.stopped) {
        return;
      }

      webPushApiManager.start();
    });

    if(!this.notificationsUiSupport) {
      return false;
    }

    // if('Notification' in window && Notification.permission !== 'granted' && Notification.permission !== 'denied') {
    //   window.addEventListener('click', this.requestPermission);
    // }

    try {
      if('onbeforeunload' in window) {
        window.addEventListener('beforeunload', () => this.clear(getCurrentAccount()));
      }
    } catch(e) {}
  }

  public async start() {
    if(!this.stopped) {
      return;
    }

    this.stopped = false;

    const totalAccounts = await AccountController.getTotalAccounts();
    for(let i = 1; i <= totalAccounts; i++) {
      const accountNumber = i as ActiveAccountNumber;
      this.constructAndStartNotificationManagerFor(accountNumber);
    }

    this.clearPendingNotifications(getCurrentAccount());
  }

  private onTitleInterval = async() => {
    const middleware = this.titleMiddlewareHelper.get();
    const count = await this.getNotificationsCountForAllAccountsForTitle();
    if(!middleware()) return;

    const titleChanged = this.titleChanged;
    if(titleChanged) {
      this.resetTitle(true);
    }

    if(!count || titleChanged) {
      return;
    }

    this.titleChanged = true;
    document.title = I18n.format('Notifications.Count', true, [count]);
    // this.setFavicon('assets/img/favicon_unread.ico');

    // fetch('assets/img/favicon.ico')
    // .then((res) => res.blob())
    // .then((blob) => {
    // const img = document.createElement('img');
    // img.src = URL.createObjectURL(blob);

    const canvas = document.createElement('canvas');
    canvas.width = 32 * window.devicePixelRatio;
    canvas.height = canvas.width;

    const ctx = canvas.getContext('2d');
    ctx.beginPath();
    ctx.arc(canvas.width / 2, canvas.height / 2, canvas.width / 2, 0, 2 * Math.PI, false);
    ctx.fillStyle = '#3390ec';
    ctx.fill();

    let fontSize = 24;
    let str = '' + count;
    if(count < 10) {
      fontSize = 22;
    } else if(count < 100) {
      fontSize = 20;
    } else {
      str = '99+';
      fontSize = 16;
    }

    fontSize *= window.devicePixelRatio;

    ctx.font = `700 ${fontSize}px ${FontFamily}`;
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'center';
    ctx.fillStyle = 'white';
    ctx.fillText(str, canvas.width / 2, canvas.height * .5625);

    /* const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height); */

    this.setFavicon(canvas.toDataURL());
    // });
  };

  private resetTitle(isBlink?: boolean) {
    if(!this.titleChanged) {
      return;
    }

    this.titleChanged = false;
    document.title = this.titleBackup;
    this.setFavicon();
  }

  private async toggleToggler(enable = idleController.isIdle) {
    if(IS_MOBILE) return;

    this.titleMiddlewareHelper.clean();
    const middleware = this.titleMiddlewareHelper.get();

    if(!enable) {
      this.resetTitle();
    } else {
      const titleInterval = await apiManagerProxy.setInterval(this.onTitleInterval, 1000);
      middleware.onClean(() => {
        apiManagerProxy.clearInterval(titleInterval);
      });
    }
  }

  private setFavicon(href?: string) {
    if(this.prevFavicon === href) {
      return;
    }

    this.prevFavicon = href;
    this.faviconElements.forEach((element, idx, arr) => {
      const link = element.cloneNode() as HTMLLinkElement;
      link.dataset.href ||= link.href;
      link.href = href ?? link.dataset.href;
      element.replaceWith(arr[idx] = link);
    });
  }

  public async notify(data: NotifyOptions, pushData: PushNotificationObject) {
    this.log('notify', data, idleController.isIdle, this.notificationsUiSupport, this.stopped);

    if(this.stopped) {
      return;
    }

    data.image ||= NOTIFICATION_ICON_PATH;

    const idx = ++this.notificationIndex;
    const key = data.key || 'k' + idx as NotificationKey;
    this.notificationsShown[key] = true;

    if(!data.noIncrement) {
      this.addPendingNotification(key, pushData.accountNumber);
    }

    this.toggleToggler();

    const now = tsNow();
    if(this.settings.volume > 0 && this.settings.sound && !data.noIncrement) {
      this.testSound(this.settings.volume);
      this.soundsPlayed[data.tag] = now;
    }

    if(!this.notificationsUiSupport ||
      'Notification' in window && Notification.permission !== 'granted') {
      return;
    }

    if(!this.settings.desktop) {
      if(this.vibrateSupport && !this.settings.novibrate) {
        navigator.vibrate([200, 100, 200]);
        return;
      }

      return;
    }

    if(!('Notification' in window)) {
      return;
    }

    let notification: MyNotification;

    const notificationOptions: NotificationOptions = {
      badge: NOTIFICATION_BADGE_PATH,
      icon: data.image || '',
      body: data.message || '',
      tag: data.tag || '',
      silent: data.silent || false,
      data: pushData
    };

    try {
      if(data.tag) {
        for(const key in this.notificationsShown) {
          const notification = this.notificationsShown[key as NotificationKey];
          if(typeof(notification) !== 'boolean' && notification.tag === data.tag) {
            notification.hidden = true;
          }
        }
      }

      // throw new Error('test');
      notification = new Notification(data.title, notificationOptions);
    } catch(e) {
      try {
        const registration = await navigator.serviceWorker.ready;
        await registration.showNotification(data.title, notificationOptions);
        const notifications = await registration.getNotifications({tag: notificationOptions.tag});
        notification = notifications[notifications.length - 1];
      } catch(err) {
        this.log.error('creating push error', err, data, notificationOptions);
      }

      if(!notification) {
        this.notificationsUiSupport = false;
        webPushApiManager.setLocalNotificationsDisabled();
        return;
      }
    }

    notification.onclick = () => {
      this.log('notification onclick');
      notification.close();
      appNavigationController.focus();
      this.clear(pushData.accountNumber);
      data.onclick?.();
    };

    notification.onclose = () => {
      this.log('notification onclose');
      if(!notification.hidden) {
        delete this.notificationsShown[key];
        this.clear(pushData.accountNumber);
      }
    };

    notification.show?.();
    this.notificationsShown[key] = notification;

    if(!IS_MOBILE) {
      setTimeout(() => {
        this.hide(key);
      }, 8000);
    }

    return true;
  }

  public updateLocalSettings = async() => {
    webPushApiManager.setSettings(unwrap(this.settings));
  };

  public getLocalSettings() {
    return this.settings;
  }

  private hide(key: NotificationKey) {
    const notification = this.notificationsShown[key];
    if(notification) {
      this.closeNotification(notification);
    }
  }

  public soundReset(tag: string) {
    delete this.soundsPlayed[tag];
  }

  // private requestPermission = () => {
  //   Notification.requestPermission();
  //   window.removeEventListener('click', this.requestPermission);
  // };

  public testSound(volume: number) {
    this.audioAssetPlayer.playWithThrottle({name: 'notification', volume}, 1000);
  }

  public async cancel(key: NotificationKey) {
    const notification = this.notificationsShown[key];
    this.log('cancel', key, notification);
    if(notification) {
      this.closeNotification(notification);
      delete this.notificationsShown[key];
    }

    this.queueNotificationCancel(key);
  }

  private closeNotification(notification: boolean | MyNotification) {
    try {
      if(typeof(notification) !== 'boolean' && notification.close) {
        this.log('close notification', notification);
        notification.hidden = true;
        notification.close();
      }
    } catch(e) {}
  }

  public clear = (accountNumber: ActiveAccountNumber) => {
    this.log.warn('clear');

    for(const key in this.notificationsShown) {
      const notification = this.notificationsShown[key as NotificationKey];
      this.closeNotification(notification);
    }

    this.notificationsShown = {};
    this.clearPendingNotifications(accountNumber);

    webPushApiManager.hidePushNotifications();
  };

  private stop() {
    if(this.stopped) {
      return;
    }

    this.log('stop');

    for(const accountNumber of this.accounts.keys()) {
      this.clear(accountNumber);
    }

    this.titleMiddlewareHelper.clean();
    this.setFavicon();
    this.stopped = true;
  }
}

const uiNotificationsManager = new UiNotificationsManager();
export default uiNotificationsManager;
