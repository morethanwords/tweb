/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 *
 * Originally from:
 * https://github.com/zhukov/webogram
 * Copyright (C) 2014 Igor Zhukov <igor.beatle@gmail.com>
 * https://github.com/zhukov/webogram/blob/master/LICENSE
 */

import type {PushNotificationObject} from '../serviceWorker/push';
import type {ServicePushPingTaskPayload} from '../serviceWorker/serviceMessagePort';
import type {NotificationSettings} from '../appManagers/uiNotificationsManager';
import type ServiceMessagePort from '../serviceWorker/serviceMessagePort';
import {MOUNT_CLASS_TO} from '../../config/debug';
import {logger} from '../logger';
import I18n, {LangPackKey} from '../langPack';
import {IS_MOBILE} from '../../environment/userAgent';
import appRuntimeManager from '../appManagers/appRuntimeManager';
import copy from '../../helpers/object/copy';
import singleInstance from './singleInstance';
import EventListenerBase from '../../helpers/eventListenerBase';
import getServerMessageId from '../appManagers/utils/messageId/getServerMessageId';

export type PushSubscriptionNotifyType = 'init' | 'subscribe' | 'unsubscribe';
export type PushSubscriptionNotifyEvent = `push_${PushSubscriptionNotifyType}`;

export type PushSubscriptionNotify = {
  tokenType: number,
  tokenValue: string
};

const PING_PUSH_INTERVAL = 10000;

export class WebPushApiManager extends EventListenerBase<{
  push_notification_click: (n: PushNotificationObject) => void,
  push_init: (n: PushSubscriptionNotify) => void,
  push_subscribe: (n: PushSubscriptionNotify) => void,
  push_unsubscribe: (n: PushSubscriptionNotify) => void
}> {
  public isAvailable = true;
  private isPushEnabled = false;
  private localNotificationsAvailable = true;
  private started = false;
  private settings: NotificationSettings & {baseUrl?: string} = {} as any;
  private isAliveTO: any;
  private isFirefox = navigator.userAgent.toLowerCase().indexOf('firefox') > -1;
  private userVisibleOnly = this.isFirefox ? false : true;
  private log = logger('PUSH-API');

  public serviceMessagePort: ServiceMessagePort<true>;

  constructor() {
    super(false);

    if(!('PushManager' in window) ||
      !('Notification' in window) ||
      !('serviceWorker' in navigator)) {
      this.log.warn('Push messaging is not supported.');
      this.isAvailable = false;
      this.localNotificationsAvailable = false;
    }

    if(this.isAvailable && Notification.permission === 'denied') {
      this.log.warn('The user has blocked notifications.');
    }
  }

  public start() {
    if(!this.started) {
      this.started = true;
      this.getSubscription();
      this.setUpServiceWorkerChannel();
    }
  }

  public setLocalNotificationsDisabled() {
    this.localNotificationsAvailable = false;
  }

  public getSubscription() {
    if(!this.isAvailable) {
      return;
    }

    navigator.serviceWorker.ready.then((reg) => {
      reg.pushManager.getSubscription().then((subscription) => {
        this.isPushEnabled = !!subscription;
        this.pushSubscriptionNotify('init', subscription);
      }).catch((err) => {
        this.log.error('Error during getSubscription()', err);
      });
    });
  }

  public subscribe = () => {
    if(!this.isAvailable) {
      return;
    }

    navigator.serviceWorker.ready.then((reg) => {
      reg.pushManager.subscribe({userVisibleOnly: this.userVisibleOnly}).then((subscription) => {
        // The subscription was successful
        this.isPushEnabled = true;
        this.pushSubscriptionNotify('subscribe', subscription);
      }).catch((e) => {
        if(Notification.permission === 'denied') {
          this.log('Permission for Notifications was denied');
        } else {
          this.log('Unable to subscribe to push.', e);
          if(!this.userVisibleOnly) {
            this.userVisibleOnly = true;
            setTimeout(this.subscribe, 0);
          }
        }
      });
    });
  }

  public unsubscribe() {
    if(!this.isAvailable) {
      return;
    }

    navigator.serviceWorker.ready.then((reg) => {
      reg.pushManager.getSubscription().then((subscription) => {
        this.isPushEnabled = false;

        if(subscription) {
          this.pushSubscriptionNotify('unsubscribe', subscription);

          setTimeout(() => {
            subscription.unsubscribe().then((successful) => {
              this.isPushEnabled = false;
            }).catch((e) => {
              this.log.error('Unsubscription error: ', e);
            });
          }, 3000);
        }
      }).catch((e) => {
        this.log.error('Error thrown while unsubscribing from ' +
          'push messaging.', e);
      });
    });
  }

  public forceUnsubscribe() {
    if(!this.isAvailable) {
      return;
    }

    navigator.serviceWorker.ready.then((reg) => {
      reg.pushManager.getSubscription().then((subscription) => {
        this.log.warn('force unsubscribe', subscription);
        if(!subscription) {
          return;
        }

        subscription.unsubscribe().then((successful) => {
          this.log.warn('force unsubscribe successful', successful);
          this.isPushEnabled = false;
        }).catch((e) => {
          this.log.error('Unsubscription error: ', e);
        });
      }).catch((e) => {
        this.log.error('Error thrown while unsubscribing from ' +
          'push messaging.', e);
      });
    });
  }

  public isAliveNotify = () => {
    if(!this.isAvailable || singleInstance.deactivatedReason) {
      return;
    }

    this.settings.baseUrl = (location.href || '').replace(/#.*$/, '');

    const lang: ServicePushPingTaskPayload['lang'] = {} as any;
    const ACTIONS_LANG_MAP: Record<keyof ServicePushPingTaskPayload['lang'], LangPackKey> = {
      push_action_mute1d: IS_MOBILE ? 'PushNotification.Action.Mute1d.Mobile' : 'PushNotification.Action.Mute1d',
      push_action_settings: IS_MOBILE ? 'PushNotification.Action.Settings.Mobile' : 'PushNotification.Action.Settings',
      push_message_nopreview: 'PushNotification.Message.NoPreview'
    };

    for(const action in ACTIONS_LANG_MAP) {
      lang[action as keyof typeof ACTIONS_LANG_MAP] = I18n.format(ACTIONS_LANG_MAP[action as keyof typeof ACTIONS_LANG_MAP], true);
    }

    this.serviceMessagePort.invokeVoid('pushPing', {
      localNotifications: this.localNotificationsAvailable,
      lang: lang,
      settings: this.settings
    });

    this.isAliveTO = setTimeout(this.isAliveNotify, PING_PUSH_INTERVAL);
  }

  public setSettings(newSettings: WebPushApiManager['settings']) {
    this.settings = copy(newSettings);
    clearTimeout(this.isAliveTO);
    this.isAliveNotify();
  }

  public hidePushNotifications() {
    if(!this.isAvailable) {
      return;
    }

    this.serviceMessagePort.invokeVoid('notificationsClear', undefined);
  }

  public setUpServiceWorkerChannel() {
    if(!this.isAvailable) {
      return;
    }

    this.serviceMessagePort.addEventListener('pushClick', (payload) => {
      if(singleInstance.deactivatedReason) {
        appRuntimeManager.reload();
        return;
      }

      this.dispatchEvent('push_notification_click', payload);
    });

    navigator.serviceWorker.ready.then(this.isAliveNotify);
  }

  public pushSubscriptionNotify(event: PushSubscriptionNotifyType, subscription?: PushSubscription) {
    if(subscription) {
      const subscriptionObj: PushSubscriptionJSON = subscription.toJSON();
      if(!subscriptionObj ||
        !subscriptionObj.endpoint ||
        !subscriptionObj.keys ||
        !subscriptionObj.keys.p256dh ||
        !subscriptionObj.keys.auth) {
        this.log.warn('Invalid push subscription', subscriptionObj);
        this.unsubscribe();
        this.isAvailable = false;
        this.pushSubscriptionNotify(event);
        return;
      }

      this.log.warn('Push', event, subscriptionObj);
      this.dispatchEvent(('push_' + event) as PushSubscriptionNotifyEvent, {
        tokenType: 10,
        tokenValue: JSON.stringify(subscriptionObj)
      });
    } else {
      this.log.warn('Push', event, false);
      this.dispatchEvent(('push_' + event) as PushSubscriptionNotifyEvent, false as any);
    }
  }

  public ignorePushByMid(peerId: PeerId, mid: number) {
    if(!this.isAvailable) {
      return;
    }

    this.serviceMessagePort.invokeVoid('shownNotification', peerId + '_' + getServerMessageId(mid));
  }
}

const webPushApiManager = new WebPushApiManager();
MOUNT_CLASS_TO && (MOUNT_CLASS_TO.webPushApiManager = webPushApiManager);
export default webPushApiManager;
