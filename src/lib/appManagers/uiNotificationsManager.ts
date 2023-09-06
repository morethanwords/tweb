/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import type {PushNotificationObject} from '../serviceWorker/push';
import getPeerTitle from '../../components/wrappers/getPeerTitle';
import wrapMessageForReply from '../../components/wrappers/messageForReply';
import {MOUNT_CLASS_TO} from '../../config/debug';
import {FontFamily} from '../../config/font';
import {NOTIFICATION_BADGE_PATH, NOTIFICATION_ICON_PATH} from '../../config/notifications';
import {IS_MOBILE} from '../../environment/userAgent';
import IS_VIBRATE_SUPPORTED from '../../environment/vibrateSupport';
import deferredPromise, {CancellablePromise} from '../../helpers/cancellablePromise';
import drawCircle from '../../helpers/canvas/drawCircle';
import customProperties from '../../helpers/dom/customProperties';
import idleController from '../../helpers/idleController';
import deepEqual from '../../helpers/object/deepEqual';
import tsNow from '../../helpers/tsNow';
import {Message, MessagePeerReaction, PeerNotifySettings} from '../../layer';
import I18n, {FormatterArguments, LangPackKey} from '../langPack';
import apiManagerProxy from '../mtproto/mtprotoworker';
import singleInstance from '../mtproto/singleInstance';
import webPushApiManager, {PushSubscriptionNotify} from '../mtproto/webPushApiManager';
import fixEmoji from '../richTextProcessor/fixEmoji';
import getAbbreviation from '../richTextProcessor/getAbbreviation';
import wrapPlainText from '../richTextProcessor/wrapPlainText';
import rootScope from '../rootScope';
import appImManager from './appImManager';
import appRuntimeManager from './appRuntimeManager';
import {AppManagers} from './managers';
import getMessageThreadId from './utils/messages/getMessageThreadId';
import getPeerColorById from './utils/peers/getPeerColorById';
import getPeerId from './utils/peers/getPeerId';
import {logger} from '../logger';

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

export class UiNotificationsManager {
  private notificationsUiSupport: boolean;
  private notificationsShown: {[key: string]: MyNotification | true} = {};
  private notificationIndex = 0;
  private notificationsCount = 0;
  private soundsPlayed: {[tag: string]: number} = {};
  private vibrateSupport = IS_VIBRATE_SUPPORTED;
  private nextSoundAt: number;
  private prevSoundVolume: number;

  private faviconElements = Array.from(document.head.querySelectorAll<HTMLLinkElement>('link[rel="icon"], link[rel="alternate icon"]'));

  private titleBackup = document.title;
  private titleChanged = false;
  private titleInterval: number;
  private prevFavicon: string;

  private notifySoundEl: HTMLElement;

  private stopped = false;

  private topMessagesDeferred: CancellablePromise<void>;

  private settings: NotificationSettings = {} as any;

  private registeredDevice: any;
  private pushInited = false;

  private managers: AppManagers;
  private setAppBadge: (contents?: any) => Promise<void>;

  private avatarCanvas: HTMLCanvasElement;
  private avatarContext: CanvasRenderingContext2D;
  private avatarGradients: {[color: string]: CanvasGradient};

  private log: ReturnType<typeof logger>;

  construct(managers: AppManagers) {
    this.managers = managers;

    this.log = logger('NOTIFICATIONS');

    navigator.vibrate = navigator.vibrate || (navigator as any).mozVibrate || (navigator as any).webkitVibrate;
    this.setAppBadge = (navigator as any).setAppBadge?.bind(navigator);
    this.setAppBadge?.(0);

    this.notificationsUiSupport = ('Notification' in window) || ('mozNotification' in navigator);

    this.notifySoundEl = document.createElement('div');
    this.notifySoundEl.id = 'notify-sound';
    document.body.append(this.notifySoundEl);

    this.topMessagesDeferred = deferredPromise<void>();

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
        this.clear();
      }

      this.toggleToggler();
    });

    rootScope.addEventListener('notification_reset', (peerString) => {
      this.soundReset(peerString);
    });

    rootScope.addEventListener('notification_cancel', (str) => {
      this.cancel(str);
    });

    if(this.setAppBadge) {
      rootScope.addEventListener('folder_unread', (folder) => {
        if(folder.id === 0) {
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
      console.log('click', notificationData, peerId);
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

        appImManager.setInnerPeer({
          peerId,
          lastMsgId: await this.managers.appMessagesIdsManager.generateMessageId(+notificationData.custom.msg_id, channelId)
        });
      });
    });
  }

  public async buildNotification({
    message,
    fwdCount,
    peerReaction,
    peerTypeNotifySettings
  }: {
    message: Message.message | Message.messageService,
    fwdCount?: number,
    peerReaction?: MessagePeerReaction,
    peerTypeNotifySettings?: PeerNotifySettings
  }) {
    const peerId = message.peerId;
    const isAnyChat = peerId.isAnyChat();
    const notification: NotifyOptions = {};
    const [peerString, isForum = false] = await Promise.all([
      this.managers.appPeersManager.getPeerString(peerId),
      isAnyChat && this.managers.appPeersManager.isForum(peerId)
    ]);
    let notificationMessage: string;
    let wrappedMessage = false;

    if(peerTypeNotifySettings.show_previews) {
      if(message._ === 'message' && message.fwd_from && fwdCount > 1) {
        notificationMessage = I18n.format('Notifications.Forwarded', true, [fwdCount]);
      } else {
        notificationMessage = await wrapMessageForReply({message, plain: true});

        const reaction = peerReaction?.reaction;
        if(reaction?._ === 'reactionEmoji') {
          const langPackKey: LangPackKey = /* isAnyChat ? 'Notification.Group.Reacted' :  */'Notification.Contact.Reacted';
          const args: FormatterArguments = [
            fixEmoji(reaction.emoticon), // can be plain heart
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
    const peerTitle = notification.title = await getPeerTitle({...peerTitleOptions, peerId, threadId: threadId});
    if(isForum) {
      const peerTitle = await getPeerTitle({...peerTitleOptions, peerId});
      notification.title += ` (${peerTitle})`;

      if(wrappedMessage && notificationFromPeerId !== message.peerId) {
        notificationMessage = await getPeerTitle({...peerTitleOptions, peerId: notificationFromPeerId}) +
          ': ' + notificationMessage;
      }
    } else if(isAnyChat && notificationFromPeerId !== message.peerId) {
      notification.title = await getPeerTitle({...peerTitleOptions, peerId: notificationFromPeerId}) +
        ' @ ' +
        notification.title;
    }

    notification.title = wrapPlainText(notification.title);

    notification.onclick = () => {
      appImManager.setInnerPeer({peerId, lastMsgId: message.mid, threadId});
    };

    notification.message = notificationMessage;
    notification.key = 'msg' + message.mid;
    notification.tag = peerString;
    notification.silent = true;// message.pFlags.silent || false;

    const peerPhoto = await this.managers.appPeersManager.getPeerPhoto(peerId);
    if(peerPhoto) {
      const url = await this.managers.appAvatarsManager.loadAvatar(peerId, peerPhoto, 'photo_small');

      if(!peerReaction) { // ! WARNING, message can be already read
        message = await this.managers.appMessagesManager.getMessageByPeer(message.peerId, message.mid);
        if(!message || !message.pFlags.unread) return;
      }

      notification.image = url;
    } else {
      let {avatarCanvas, avatarContext} = this;
      if(!this.avatarCanvas) {
        avatarCanvas = this.avatarCanvas = document.createElement('canvas');
        avatarContext = this.avatarContext = avatarCanvas.getContext('2d');

        const SIZE = 54;
        const dpr = 1;
        avatarCanvas.dpr = dpr;
        avatarCanvas.width = avatarCanvas.height = SIZE * dpr;

        this.avatarGradients = {};
      } else {
        avatarContext.clearRect(0, 0, avatarCanvas.width, avatarCanvas.height);
      }

      const color = getPeerColorById(peerId, true);
      let gradient = this.avatarGradients[color];
      if(!gradient) {
        gradient = this.avatarGradients[color] = avatarContext.createLinearGradient(avatarCanvas.width / 2, 0, avatarCanvas.width / 2, avatarCanvas.height);

        const colorTop = customProperties.getProperty(`peer-avatar-${color}-top`);
        const colorBottom = customProperties.getProperty(`peer-avatar-${color}-bottom`);
        gradient.addColorStop(0, colorTop);
        gradient.addColorStop(1, colorBottom);
      }

      avatarContext.fillStyle = gradient;

      drawCircle(avatarContext, avatarCanvas.width / 2, avatarCanvas.height / 2, avatarCanvas.width / 2);
      avatarContext.fill();

      const fontSize = 20 * avatarCanvas.dpr;
      const abbreviation = getAbbreviation(peerTitle);

      avatarContext.font = `700 ${fontSize}px ${FontFamily}`;
      avatarContext.textBaseline = 'middle';
      avatarContext.textAlign = 'center';
      avatarContext.fillStyle = 'white';
      avatarContext.fillText(abbreviation.text, avatarCanvas.width / 2, avatarCanvas.height * (window.devicePixelRatio > 1 || true ? .5625 : .5));

      notification.image = avatarCanvas.toDataURL();
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

    const result = await this.notify(notification, pushData);
    if(result && this.registeredDevice) {
      webPushApiManager.ignorePushByMid(peerId, message.mid);
    }
  }

  private toggleToggler(enable = idleController.isIdle) {
    if(IS_MOBILE) return;

    const resetTitle = (isBlink?: boolean) => {
      this.titleChanged = false;
      document.title = this.titleBackup;
      this.setFavicon();
    };

    window.clearInterval(this.titleInterval);
    this.titleInterval = 0;

    if(!enable) {
      resetTitle();
    } else {
      this.titleInterval = window.setInterval(() => {
        const count = this.notificationsCount;
        if(!count) {
          this.toggleToggler(false);
        } else if(this.titleChanged) {
          resetTitle(true);
        } else {
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
        }
      }, 1000);
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

      href ??= link.dataset.href;
      link.href = href;
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
      ++this.notificationsCount;
    }

    if(!this.titleInterval) {
      this.toggleToggler();
    }

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
      appRuntimeManager.focus();
      this.clear();
      data.onclick?.();
    };

    notification.onclose = () => {
      this.log('notification onclose');
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
    const promises = keys.map(() => undefined);
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

    apiManagerProxy.getState().then((state) => {
      this.settings.nosound = !state.settings.notifications.sound;
    });
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

  public cancel(key: string) {
    const notification = this.notificationsShown[key];
    this.log('cancel', key, notification);
    if(notification) {
      if(this.notificationsCount > 0) {
        --this.notificationsCount;
      }

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

  public clear = () => {
    this.log.warn('clear');

    for(const i in this.notificationsShown) {
      const notification = this.notificationsShown[i];
      this.closeNotification(notification);
    }

    this.notificationsShown = {};
    this.notificationsCount = 0;

    webPushApiManager.hidePushNotifications();
  };

  public start() {
    this.log('start');
    this.stopped = false;

    this.updateLocalSettings();
    rootScope.addEventListener('settings_updated', this.updateLocalSettings);
    apiManagerProxy.getState().then((state) => {
      if(this.stopped || !state.keepSigned) {
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

  private stop() {
    this.log('stop');

    this.clear();
    window.clearInterval(this.titleInterval);
    this.titleInterval = 0;
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
      this.log('registered device');
      this.registeredDevice = tokenData;
    }, (error) => {
      error.handled = true;
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
    }, (error) => {
      error.handled = true;
    });
  }
}

const uiNotificationsManager = new UiNotificationsManager();
MOUNT_CLASS_TO && (MOUNT_CLASS_TO.uiNotificationsManager = uiNotificationsManager);
export default uiNotificationsManager;
