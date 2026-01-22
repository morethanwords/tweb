/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

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
import apiManagerProxy, {NotificationBuildTaskPayload} from '@lib/apiManagerProxy';
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

type Account = {managers: ProxiedManagers};
type NotificationKey = BroadcastEvents['notification_cancel'];

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

  private topMessagesDeferred: CancellablePromise<void>;

  private setAppBadge: (contents?: any) => Promise<void>;

  private log: ReturnType<typeof logger>;

  public accounts: Map<ActiveAccountNumber, Account>;

  private audioAssetPlayer: AudioAssetPlayer<Record<'notification', string>>;

  private appSettings: StateSettings;

  private get settings() {
    return this.appSettings.notifications;
  }

  public async getNotificationsCountForAllAccounts(): Promise<Partial<Record<ActiveAccountNumber, number>>> {
    return (await commonStateStorage.get('notificationsCount', false)) || {};
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

  private async getNotificationsCount(accountNumber: ActiveAccountNumber) {
    const notificationsCount = await this.getNotificationsCountForAllAccounts();
    return notificationsCount?.[accountNumber] || 0;
  }

  private async setNotificationCount(valueOrFn: number | ((prev: number) => number), accountNumber: ActiveAccountNumber) {
    // * make it safe to call from multiple tabs
    await navigator.locks.request('notificationsCount', async() => {
      const notificationsCount = await this.getNotificationsCountForAllAccounts();

      let newValue = valueOrFn instanceof Function ?
        valueOrFn(notificationsCount[accountNumber] || 0) :
        valueOrFn;
      newValue = Math.max(0, newValue);
      if(notificationsCount[accountNumber] === newValue) {
        return;
      }

      await commonStateStorage.set({
        notificationsCount: {
          ...notificationsCount,
          [accountNumber]: newValue
        }
      });
      rootScope.dispatchEvent('notification_count_update');
    });
  }

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

      const peerId = notificationData.custom && notificationData.custom.peerId.toPeerId();
      if(!peerId) {
        return;
      }

      this.topMessagesDeferred.then(async() => {
        const managers = rootScope.managers;
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

        const lastMsgId = await managers.appMessagesIdsManager.generateMessageId(+notificationData.custom.msg_id, channelId);

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

  public async buildNotification({
    message,
    fwdCount,
    peerReaction,
    peerTypeNotifySettings,
    isOtherTabActive,
    accountNumber
  }: NotificationBuildTaskPayload) {
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

        const reaction = peerReaction?.reaction;
        if(reaction && reaction._ !== 'reactionEmpty') {
          let emoticon = (reaction as Reaction.reactionEmoji).emoticon;
          if(!emoticon) {
            const doc = await account.managers.appEmojiManager.getCustomEmojiDocument((reaction as Reaction.reactionCustomEmoji).document_id);
            emoticon = doc.stickerEmojiRaw;
          }

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
      notification.silent = true;
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

    function wrapUserName(user: User.user) {
      let name = user.first_name;
      if(user.last_name) name += ' ' + user.last_name;

      name = limitSymbols(name, 12, 15);
      return wrapPlainText(name);
    }

    const isDifferentAccount = accountNumber !== getCurrentAccount();
    const hasMoreThanOneAccount = (await AccountController.getTotalAccounts()) > 1;
    if((hasMoreThanOneAccount && isOtherTabActive) || isDifferentAccount) {
      // ' ➜ '
      notification.title += ' \u279C ' + wrapUserName(await account.managers.appUsersManager.getSelf());
    }

    notification.title = wrapPlainText(notification.title);

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
    notification.tag = peerString;
    notification.silent = true;// message.pFlags.silent || false;

    notification.image = !isLocked ? await createNotificationImage(account.managers, peerId, peerTitle) : undefined;
    if(!peerReaction) { // ! WARNING, message can be already read
      message = await account.managers.appMessagesManager.getMessageByPeer(message.peerId, message.mid);
      if(!message || !message.pFlags.unread) return;
    }

    const pushData: PushNotificationObject = {
      custom: {
        msg_id: '' + message.mid,
        peerId: '' + peerId
      },
      description: '',
      loc_key: '',
      loc_args: [],
      mute: '',
      random_id: 0,
      title: '',
      accountNumber
    };

    if(isLocked) {
      notification.title = I18n.format('PasscodeLock.NotificationTitle', true);
      notification.message = I18n.format('PasscodeLock.NotificationDescription', true);
    }

    const result = await this.notify(notification, pushData);
    if(result && await apiManagerProxy.pushSingleManager.isRegistered()) {
      webPushApiManager.ignorePushByMid(peerId, message.mid);
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

    this.setNotificationCount(0, getCurrentAccount());
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

    if(!data.noIncrement) {
      this.setNotificationCount((prev) => ++prev, pushData.accountNumber);
    }

    this.toggleToggler();

    const idx = ++this.notificationIndex;
    const key = data.key || 'k' + idx as NotificationKey;
    this.notificationsShown[key] = true;

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
      this.setNotificationCount((prev) => --prev, +key.split('_')[1] as ActiveAccountNumber);
      this.closeNotification(notification);
      delete this.notificationsShown[key];
    }
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
    this.setNotificationCount(0, accountNumber);

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
