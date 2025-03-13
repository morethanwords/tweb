/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import type {PushNotificationObject} from '../serviceWorker/push';
import getPeerTitle from '../../components/wrappers/getPeerTitle';
import wrapMessageForReply from '../../components/wrappers/messageForReply';
import {FontFamily} from '../../config/font';
import {NOTIFICATION_BADGE_PATH, NOTIFICATION_ICON_PATH} from '../../config/notifications';
import {IS_MOBILE} from '../../environment/userAgent';
import IS_VIBRATE_SUPPORTED from '../../environment/vibrateSupport';
import deferredPromise, {CancellablePromise} from '../../helpers/cancellablePromise';
import idleController from '../../helpers/idleController';
import deepEqual from '../../helpers/object/deepEqual';
import tsNow from '../../helpers/tsNow';
import {Reaction, User} from '../../layer';
import I18n, {FormatterArguments, LangPackKey} from '../langPack';
import singleInstance from '../mtproto/singleInstance';
import fixEmoji from '../richTextProcessor/fixEmoji';
import wrapPlainText from '../richTextProcessor/wrapPlainText';
import {AppManagers} from './managers';
import getMessageThreadId from './utils/messages/getMessageThreadId';
import getPeerId from './utils/peers/getPeerId';
import {logger} from '../logger';
import LazyLoadQueueBase from '../../components/lazyLoadQueueBase';
import webPushApiManager, {PushSubscriptionNotify} from '../mtproto/webPushApiManager';
import rootScope from '../rootScope';
import appImManager from './appImManager';
import appRuntimeManager from './appRuntimeManager';
import {getCurrentAccount} from '../accounts/getCurrentAccount';
import limitSymbols from '../../helpers/string/limitSymbols';
import apiManagerProxy, {NotificationBuildTaskPayload} from '../mtproto/mtprotoworker';
import commonStateStorage from '../commonStateStorage';
import {ActiveAccountNumber} from '../accounts/types';
import {createProxiedManagersForAccount} from './getProxiedManagers';
import AccountController from '../accounts/accountController';
import {createAppURLForAccount} from '../accounts/createAppURLForAccount';
import createNotificationImage from '../../helpers/createNotificationImage';
import {getMiddleware} from '../../helpers/middleware';
import {FOLDER_ID_ALL} from '../mtproto/mtproto_config';
import PasscodeLockScreenController from '../../components/passcodeLock/passcodeLockScreenController';

type MyNotification = Notification & {
  hidden?: boolean,
  show?: () => void,
};

export type NotifyOptions = Partial<{
  tag: string;
  image: string;
  key: string;
  title: string;
  message: string;
  silent: boolean;
  onclick: () => void;
  noIncrement: boolean;
}>;

export type NotificationSettings = {
  nodesktop: boolean,
  volume: number,
  novibrate: boolean,
  nopreview: boolean,
  nopush: boolean,
  nosound: boolean
};

const SHOW_NOTIFICATIONS_FOR_OTHER_ACCOUNT = false;

export class UiNotificationsManager {
  private notificationsUiSupport: boolean;
  private notificationsShown: {[key: string]: MyNotification | true} = {};
  private notificationIndex = 0;
  private soundsPlayed: {[tag: string]: number} = {};
  private vibrateSupport = IS_VIBRATE_SUPPORTED;
  private nextSoundAt: number;
  private prevSoundVolume: number;

  private static faviconElements = Array.from(document.head.querySelectorAll<HTMLLinkElement>('link[rel="icon"], link[rel="alternate icon"]'));

  private static titleBackup = document.title;
  private static titleChanged = false;
  private static titleMiddlewareHelper = getMiddleware();
  private static prevFavicon: string;

  private notifySoundEl: HTMLElement;

  private static stopped = false;

  private topMessagesDeferred: CancellablePromise<void>;

  private settings: NotificationSettings = {} as any;

  private registeredDevice: any;
  private pushInited = false;

  private accountNumber: ActiveAccountNumber;
  private managers: AppManagers;
  private setAppBadge: (contents?: any) => Promise<void>;

  private static log = logger('NOTIFICATIONS');

  private notificationsQueue: LazyLoadQueueBase;

  public static byAccount = {} as Record<ActiveAccountNumber, UiNotificationsManager>;

  static async getNotificationsCountForAllAccounts(): Promise<Partial<Record<ActiveAccountNumber, number>>> {
    return (await commonStateStorage.get('notificationsCount', false)) || {};
  }

  static async getNotificationsCountForAllAccountsForTitle() {
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

  async getNotificationsCount() {
    const notificationsCount = await UiNotificationsManager.getNotificationsCountForAllAccounts();
    return notificationsCount?.[this.accountNumber] || 0;
  }

  async setNotificationCount(valueOrFn: number | ((prev: number) => number)) {
    // * make it safe to call from multiple tabs
    await navigator.locks.request('notificationsCount', async() => {
      const notificationsCount = await UiNotificationsManager.getNotificationsCountForAllAccounts();

      let newValue = valueOrFn instanceof Function ?
        valueOrFn(notificationsCount[this.accountNumber] || 0) :
        valueOrFn;
      newValue = Math.max(0, newValue);
      if(notificationsCount[this.accountNumber] === newValue) {
        return;
      }

      await commonStateStorage.set({
        notificationsCount: {
          ...notificationsCount,
          [this.accountNumber]: newValue
        }
      });
      rootScope.dispatchEvent('notification_count_update');
    });
  }

  construct(accountNumber: ActiveAccountNumber) {
    this.managers = createProxiedManagersForAccount(accountNumber);
    this.accountNumber = accountNumber;

    this.notificationsQueue = new LazyLoadQueueBase(1);

    navigator.vibrate = navigator.vibrate || (navigator as any).mozVibrate || (navigator as any).webkitVibrate;
    this.setAppBadge = (navigator as any).setAppBadge?.bind(navigator);
    this.setAppBadge?.(0);

    this.notificationsUiSupport = ('Notification' in window) || ('mozNotification' in navigator);

    this.notifySoundEl = document.createElement('div');
    this.notifySoundEl.id = 'notify-sound';
    document.body.append(this.notifySoundEl);

    this.topMessagesDeferred = deferredPromise<void>();

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

    webPushApiManager.addEventListener('push_init', (tokenData) => {
      this.pushInited = true;
      if(!this.settings.nodesktop && !this.settings.nopush) {
        if(tokenData) {
          this.registerDevice(tokenData);
        } else {
          webPushApiManager.subscribe();
        }
      } else {
        this.unregisterDevice(tokenData);
      }
    });
    webPushApiManager.addEventListener('push_subscribe', (tokenData) => {
      this.registerDevice(tokenData);
    });
    webPushApiManager.addEventListener('push_unsubscribe', (tokenData) => {
      this.unregisterDevice(tokenData);
    });

    rootScope.addEventListener('dialogs_multiupdate', () => {
      // unregisterTopMsgs()
      this.topMessagesDeferred.resolve();
    }, {once: true});

    webPushApiManager.addEventListener('push_notification_click', (notificationData) => {
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

      if(notificationData.action === 'mute1d') {
        this.managers.apiManager.invokeApi('account.updateDeviceLocked', {
          period: 86400
        }).then(() => {
          // var toastData = toaster.pop({
          //   type: 'info',
          //   body: _('push_action_mute1d_success'),
          //   bodyOutputType: 'trustedHtml',
          //   clickHandler: () => {
          //     toaster.clear(toastData)
          //   },
          //   showCloseButton: false
          // })
        });

        return;
      }

      const peerId = notificationData.custom && notificationData.custom.peerId.toPeerId();
      if(!peerId) {
        return;
      }

      this.topMessagesDeferred.then(async() => {
        const chatId = peerId.isAnyChat() ? peerId.toChatId() : undefined;
        let channelId: ChatId;
        if(chatId) {
          if(!(await this.managers.appChatsManager.hasChat(chatId))) {
            return;
          }

          channelId = await this.managers.appChatsManager.isChannel(chatId) ? chatId : undefined;
        }

        if(!chatId && !(await this.managers.appUsersManager.hasUser(peerId.toUserId()))) {
          return;
        }

        const lastMsgId = await this.managers.appMessagesIdsManager.generateMessageId(+notificationData.custom.msg_id, channelId);

        appImManager.setInnerPeer({
          peerId,
          lastMsgId
        });
      });
    });
  }

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
    isOtherTabActive
  }: NotificationBuildTaskPayload) {
    const peerId = message.peerId;
    const isAnyChat = peerId.isAnyChat();
    const notification: NotifyOptions = {};
    const [peerString, isForum = false] = await Promise.all([
      this.managers.appPeersManager.getPeerString(peerId),
      isAnyChat && this.managers.appPeersManager.isForum(peerId)
    ]);
    let notificationMessage: string;
    let wrappedMessage = false;

    const isLocked = PasscodeLockScreenController.getIsLocked();

    if(peerTypeNotifySettings.show_previews && !isLocked) {
      if(message._ === 'message' && message.fwd_from && fwdCount > 1) {
        notificationMessage = I18n.format('Notifications.Forwarded', true, [fwdCount]);
      } else {
        notificationMessage = await wrapMessageForReply({message, plain: true});

        const reaction = peerReaction?.reaction;
        if(reaction && reaction._ !== 'reactionEmpty') {
          let emoticon = (reaction as Reaction.reactionEmoji).emoticon;
          if(!emoticon) {
            const doc = await this.managers.appEmojiManager.getCustomEmojiDocument((reaction as Reaction.reactionCustomEmoji).document_id);
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
      managers: this.managers
    };

    const threadId = isForum ? getMessageThreadId(message, isForum) : undefined;
    const notificationFromPeerId = peerReaction ? getPeerId(peerReaction.peer_id) : message.fromId;
    const peerTitle = notification.title = await getPeerTitle({...peerTitleOptions, peerId, threadId: threadId, managers: this.managers, useManagers: true});
    if(isForum) {
      const peerTitle = await getPeerTitle({...peerTitleOptions, peerId});
      notification.title += ` (${peerTitle})`;

      if(wrappedMessage && notificationFromPeerId !== message.peerId) {
        notificationMessage = await getPeerTitle({...peerTitleOptions, peerId: notificationFromPeerId, managers: this.managers, useManagers: true}) +
          ': ' + notificationMessage;
      }
    } else if(isAnyChat && notificationFromPeerId !== message.peerId) {
      notification.title = await getPeerTitle({...peerTitleOptions, peerId: notificationFromPeerId, managers: this.managers, useManagers: true}) +
        ' @ ' +
        notification.title;
    }

    function wrapUserName(user: User.user) {
      let name = user.first_name;
      if(user.last_name) name += ' ' + user.last_name;

      name = limitSymbols(name, 12, 15);
      return wrapPlainText(name);
    }

    const accountNumber = await this.managers.apiManager.getAccountNumber()
    const isDifferentAccount = accountNumber !== getCurrentAccount();
    const hasMoreThanOneAccount = (await AccountController.getTotalAccounts()) > 1;
    if((hasMoreThanOneAccount && isOtherTabActive) || isDifferentAccount) {
      // ' ➜ '
      notification.title += ' \u279C ' + wrapUserName(await this.managers.appUsersManager.getSelf());
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
    notification.key = `msg_${this.accountNumber}_${message.peerId}_${message.mid}`;
    notification.tag = peerString;
    notification.silent = true;// message.pFlags.silent || false;

    notification.image = !isLocked ? await createNotificationImage(this.managers, peerId, peerTitle) : undefined;
    if(!peerReaction) { // ! WARNING, message can be already read
      message = await this.managers.appMessagesManager.getMessageByPeer(message.peerId, message.mid);
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
      title: ''
    };

    if(isLocked) {
      notification.title = I18n.format('PasscodeLock.NotificationTitle', true);
      notification.message = I18n.format('PasscodeLock.NotificationDescription', true);
    }

    const result = await this.notify(notification, pushData);
    if(result && this.registeredDevice) {
      webPushApiManager.ignorePushByMid(peerId, message.mid);
    }
  }

  private static constructAndStartNotificationManagerFor(accountNumber: ActiveAccountNumber) {
    if(this.byAccount[accountNumber]) {
      this.byAccount[accountNumber].start();
      return;
    }

    const managers = createProxiedManagersForAccount(accountNumber);

    managers.apiUpdatesManager.attach(I18n.lastRequestedLangCode);

    const uiNotificationManager = this.byAccount[accountNumber] = new UiNotificationsManager;

    uiNotificationManager.construct(accountNumber);
    uiNotificationManager.start();
  }

  static constructAndStartAll() {
    this.start();

    rootScope.addEventListener('account_logged_in', async({accountNumber}) => {
      if(this.byAccount[accountNumber]) return;
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
        for(const _accountNumber in this.byAccount) {
          const accountNumber = +_accountNumber as ActiveAccountNumber;
          if(
            (SHOW_NOTIFICATIONS_FOR_OTHER_ACCOUNT && !apiManagerProxy.hasTabOpenFor(accountNumber)) ||
            accountNumber === getCurrentAccount()
          ) {
            this.byAccount[accountNumber].clear();
          }
        }
      }

      this.toggleToggler();
    });
  }

  static async start() {
    this.stopped = false;

    const totalAccounts = await AccountController.getTotalAccounts();
    for(let i = 1; i <= totalAccounts; i++) {
      const accountNumber = i as ActiveAccountNumber;
      this.constructAndStartNotificationManagerFor(accountNumber);
    }

    this.byAccount[getCurrentAccount()].setNotificationCount(0);
  }

  private static onTitleInterval = async() => {
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

  private static resetTitle(isBlink?: boolean) {
    if(!this.titleChanged) {
      return;
    }

    this.titleChanged = false;
    document.title = this.titleBackup;
    this.setFavicon();
  }

  private static async toggleToggler(enable = idleController.isIdle) {
    if(IS_MOBILE) return;

    this.titleMiddlewareHelper.clean();
    const middleware = this.titleMiddlewareHelper.get();

    if(!enable) {
      this.resetTitle();
    } else {
      const titleInterval = await apiManagerProxy.setInterval(UiNotificationsManager.onTitleInterval, 1000);
      middleware.onClean(() => {
        apiManagerProxy.clearInterval(titleInterval);
      });
    }
  }

  private static setFavicon(href?: string) {
    if(this.prevFavicon === href) {
      return;
    }

    this.prevFavicon = href;
    this.faviconElements.forEach((element, idx, arr) => {
      const link = element.cloneNode() as HTMLLinkElement;

      link.dataset.href ||= link.href;

      href ??= link.dataset.href;
      link.href = href;
      element.replaceWith(arr[idx] = link);
    });
  }

  public async notify(data: NotifyOptions, pushData: PushNotificationObject) {
    UiNotificationsManager.log('notify', data, idleController.isIdle, this.notificationsUiSupport, UiNotificationsManager.stopped);

    if(UiNotificationsManager.stopped) {
      return;
    }

    data.image ||= NOTIFICATION_ICON_PATH;

    if(!data.noIncrement) {
      this.setNotificationCount((prev) => ++prev);
    }

    UiNotificationsManager.toggleToggler();

    const idx = ++this.notificationIndex;
    const key = data.key || 'k' + idx;
    this.notificationsShown[key] = true;

    const now = tsNow();
    if(this.settings.volume > 0 && !this.settings.nosound/* &&
      (
        !data.tag ||
        !this.soundsPlayed[data.tag] ||
        now > this.soundsPlayed[data.tag] + 60000
      ) */
    ) {
      this.testSound(this.settings.volume);
      this.soundsPlayed[data.tag] = now;
    }

    if(!this.notificationsUiSupport ||
      'Notification' in window && Notification.permission !== 'granted') {
      return;
    }

    if(this.settings.nodesktop) {
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
        for(const i in this.notificationsShown) {
          const notification = this.notificationsShown[i];
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
        UiNotificationsManager.log.error('creating push error', err, data, notificationOptions);
      }

      if(!notification) {
        this.notificationsUiSupport = false;
        webPushApiManager.setLocalNotificationsDisabled();
        return;
      }
    }

    notification.onclick = () => {
      UiNotificationsManager.log('notification onclick');
      notification.close();
      appRuntimeManager.focus();
      this.clear();
      data.onclick?.();
    };

    notification.onclose = () => {
      UiNotificationsManager.log('notification onclose');
      if(!notification.hidden) {
        delete this.notificationsShown[key];
        this.clear();
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

  public updateLocalSettings = () => {
    const keys = ['notify_nodesktop', 'notify_volume', 'notify_novibrate', 'notify_nopreview', 'notify_nopush'];
    const promises = keys.map(() => undefined as any);
    // const promises = keys.map((k) => stateStorage.get(k as any));
    Promise.all(promises)
    .then((updSettings) => {
      this.settings.nodesktop = updSettings[0];
      this.settings.volume = updSettings[1] === undefined ? 0.5 : updSettings[1];
      this.settings.novibrate = updSettings[2];
      this.settings.nopreview = updSettings[3];
      this.settings.nopush = updSettings[4];

      if(this.pushInited) {
        const needPush = !this.settings.nopush && !this.settings.nodesktop && webPushApiManager.isAvailable || false;
        const hasPush = this.registeredDevice !== false;
        if(needPush !== hasPush) {
          if(needPush) {
            webPushApiManager.subscribe();
          } else {
            webPushApiManager.unsubscribe();
          }
        }
      }

      webPushApiManager.setSettings(this.settings);
    });

    this.settings.nosound = !rootScope.settings.notifications.sound;
  }

  public getLocalSettings() {
    return this.settings;
  }

  private hide(key: string) {
    const notification = this.notificationsShown[key];
    if(notification) {
      this.closeNotification(notification);
    }
  }

  public soundReset(tag: string) {
    delete this.soundsPlayed[tag];
  }

  private requestPermission = () => {
    Notification.requestPermission();
    window.removeEventListener('click', this.requestPermission);
  };

  public testSound(volume: number) {
    const now = tsNow();
    if(this.nextSoundAt && now < this.nextSoundAt && this.prevSoundVolume === volume) {
      return;
    }

    this.nextSoundAt = now + 1000;
    this.prevSoundVolume = volume;
    const filename = 'assets/audio/notification.mp3';
    const audio = document.createElement('audio');
    audio.autoplay = true;
    audio.setAttribute('mozaudiochannel', 'notification');
    audio.volume = volume;
    audio.innerHTML = `
      <source src="${filename}" type="audio/mpeg" />
      <embed hidden="true" autostart="true" loop="false" volume="${volume * 100}" src="${filename}" />
    `;
    this.notifySoundEl.append(audio);

    audio.addEventListener('ended', () => {
      audio.remove();
    }, {once: true});
  }

  public async cancel(key: string) {
    const notification = this.notificationsShown[key];
    UiNotificationsManager.log('cancel', key, notification);
    if(notification) {
      this.setNotificationCount((prev) => --prev);
      this.closeNotification(notification);
      delete this.notificationsShown[key];
    }
  }

  private closeNotification(notification: boolean | MyNotification) {
    try {
      if(typeof(notification) !== 'boolean' && notification.close) {
        UiNotificationsManager.log('close notification', notification);
        notification.hidden = true;
        notification.close();
      }
    } catch(e) {}
  }

  public clear = () => {
    UiNotificationsManager.log.warn('clear');

    for(const i in this.notificationsShown) {
      const notification = this.notificationsShown[i];
      this.closeNotification(notification);
    }

    this.notificationsShown = {};
    this.setNotificationCount(0);

    webPushApiManager.hidePushNotifications();
  };

  public start() {
    UiNotificationsManager.log('start');

    this.updateLocalSettings();
    this.managers.appStateManager.getState().then((state) => {
      if(UiNotificationsManager.stopped) {
        return;
      }

      webPushApiManager.start();
    });

    if(!this.notificationsUiSupport) {
      return false;
    }

    if('Notification' in window && Notification.permission !== 'granted' && Notification.permission !== 'denied') {
      window.addEventListener('click', this.requestPermission);
    }

    try {
      if('onbeforeunload' in window) {
        window.addEventListener('beforeunload', this.clear);
      }
    } catch(e) {}
  }

  private static stop() {
    UiNotificationsManager.log('stop');

    for(const key in this.byAccount) {
      const accountNumber = key as unknown as ActiveAccountNumber;
      this.byAccount[accountNumber].clear();
    }

    this.titleMiddlewareHelper.clean();
    this.setFavicon();
    this.stopped = true;
  }

  private registerDevice(tokenData: PushSubscriptionNotify) {
    if(this.registeredDevice && deepEqual(this.registeredDevice, tokenData)) {
      return false;
    }

    this.managers.apiManager.invokeApi('account.registerDevice', {
      token_type: tokenData.tokenType,
      token: tokenData.tokenValue,
      other_uids: [],
      app_sandbox: false,
      secret: new Uint8Array()
    }).then(() => {
      UiNotificationsManager.log('registered device');
      this.registeredDevice = tokenData;
    });
  }

  private unregisterDevice(tokenData: PushSubscriptionNotify) {
    if(!this.registeredDevice) {
      return false;
    }

    this.managers.apiManager.invokeApi('account.unregisterDevice', {
      token_type: tokenData.tokenType,
      token: tokenData.tokenValue,
      other_uids: []
    }).then(() => {
      this.registeredDevice = false;
    });
  }
}
