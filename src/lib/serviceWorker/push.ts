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

import type {ActiveAccountNumber} from '../accounts/types';
import {Database} from '../../config/databases';
import {CommonDatabase, getCommonDatabaseState} from '../../config/databases/state';
import {NOTIFICATION_BADGE_PATH, NOTIFICATION_ICON_PATH} from '../../config/notifications';
import {IS_FIREFOX} from '../../environment/userAgent';
import deepEqual from '../../helpers/object/deepEqual';
import IDBStorage from '../files/idb';
import {log, serviceMessagePort} from './index.service';
import {ServicePushPingTaskPayload} from './serviceMessagePort';
import {CURRENT_ACCOUNT_QUERY_PARAM} from '../accounts/constants';
import DeferredIsUsingPasscode from '../passcode/deferredIsUsingPasscode';
import EncryptionKeyStore from '../passcode/keyStore';
import pause from '../../helpers/schedulers/pause';
import {getWindowClients} from '../../helpers/context';

const ctx = self as any as ServiceWorkerGlobalScope;
const defaultBaseUrl = location.protocol + '//' + location.hostname + location.pathname.split('/').slice(0, -1).join('/') + '/';
let localNotificationsAvailable = true;

export type EncryptedPushNotificationObject = {
  p: string | false
};

export type PushNotificationObject = {
  loc_key: string,
  loc_args: string[],
  // user_id: number, // should be number
  custom: {
    channel_id?: string, // should be number
    chat_id?: string, // should be number
    from_id?: string, // should be number
    msg_id: string,
    peerId?: string, // should be number
    silent?: string // can be '1'
  },
  sound?: string,
  random_id: number,
  badge?: string, // should be number
  description: string,
  mute: string, // should be number
  title: string,
  message?: string,
  user_id?: number // receiver user id
} & { // will be set before postMessage to main thread
  action?: 'mute1d' | 'push_settings',
  accountNumber: ActiveAccountNumber,
  p?: string,
  keyIdBase64?: string
};

class SomethingGetter<T extends Database<any>, Storage extends Record<string, any>> {
  private cache: Partial<Storage> = {};
  private storage: IDBStorage<T>;

  constructor(
    db: T,
    storeName: T['stores'][number]['name'],
    private defaults: {
      [Property in keyof Storage]: ((value: Storage[Property]) => Storage[Property]) | Storage[Property]
    }
  ) {
    this.storage = new IDBStorage<T>(db, storeName);
  }

  private getDefault<T extends keyof Storage>(key: T) {
    const callback = this.defaults[key];
    return typeof(callback) === 'function' ? callback() : callback;
  }

  public get<T extends keyof Storage>(key: T) {
    if(this.cache.hasOwnProperty(key)) {
      return this.cache[key];
    }

    const promise = this.storage.get(key as string) as Promise<Storage[T]>;
    return promise.then((value) => value, () => undefined as Storage[T]).then((value) => {
      if(this.cache.hasOwnProperty(key)) {
        return this.cache[key];
      }

      value ??= this.getDefault(key);

      return this.cache[key] = value;
    });
  }

  public getCached<T extends keyof Storage>(key: T) {
    const value = this.get(key);
    if(value instanceof Promise) {
      throw 'no property';
    }

    return value;
  }

  public async set<T extends keyof Storage>(key: T, value: Storage[T]) {
    const cached = this.cache[key] ?? this.defaults[key];
    if(deepEqual(cached, value)) {
      return;
    }

    this.cache[key] = value;

    try {
      this.storage.save(key as string, value);
    } catch(err) {

    }
  }
}

type PushStorage = {
  push_mute_until: number,
  push_lang: Partial<ServicePushPingTaskPayload['lang']>
  push_settings: Partial<ServicePushPingTaskPayload['settings']>
  push_accounts: ServicePushPingTaskPayload['accounts'],
  push_keys_ids_base64: string[]
};

const defaults: PushStorage = {
  push_mute_until: 0,
  push_lang: {
    push_message_nopreview: 'You have a new message',
    push_message_error: 'Telegram is syncing in the background...',
    push_action_mute1d: 'Mute for 24H',
    push_action_settings: 'Settings'
  },
  push_settings: {},
  push_accounts: {},
  push_keys_ids_base64: []
};

const getter = new SomethingGetter<CommonDatabase, PushStorage>(getCommonDatabaseState(), 'session', defaults);

// fill cache
for(const i in defaults) {
  getter.get(i as keyof PushStorage);
}

async function handlePushNotificationObject(obj: PushNotificationObject) {
  const copy = JSON.parse(JSON.stringify(obj));
  log('push', copy);

  let noFix = false,
    _lang: PushStorage['push_lang'];
  try {
    // * this should never happen, but just in case
    if(obj.mute === '1') {
      throw `supress push notification because obj.mute is 1`;
    }

    const [muteUntil, settings, lang, windowClients] = await Promise.all([
      getter.get('push_mute_until'),
      getter.get('push_settings'),
      getter.get('push_lang'),
      getWindowClients()
    ]);
    _lang = lang;

    const nowTime = Date.now();
    if(
      userInvisibleIsSupported() &&
      muteUntil &&
      nowTime < muteUntil
    ) {
      throw `supress push notification because mute for ${Math.ceil((muteUntil - nowTime) / 60000)} min`;
    }

    const hasActiveWindow = windowClients.length && localNotificationsAvailable;
    if(hasActiveWindow) {
      noFix = windowClients.some((windowClient) => windowClient.focused);
      throw 'supress push notification because some instance is alive';
    }

    const notificationPromise = fireNotification(obj, settings, lang);
    await notificationPromise.catch((err) => {
      log.error('push notification error', err, copy);
      throw err;
    });
  } catch(err) {
    log(err);

    if(noFix) {
      return;
    }

    const tag = 'fix';
    const notificationPromise = ctx.registration.showNotification('Telegram Web', {
      body: _lang.push_message_error,
      icon: NOTIFICATION_ICON_PATH,
      tag,
      badge: NOTIFICATION_BADGE_PATH,
      silent: true
    });

    notificationPromise.then(() => {
      setTimeout(() => {
        closeAllNotifications(tag);
      }, 2000);
    });

    return notificationPromise;
  }
}

(ctx as any).handlePushNotificationObject = handlePushNotificationObject;

function onPushEvent(event: PushEvent) {
  const obj: EncryptedPushNotificationObject | PushNotificationObject = event.data.json();
  if(!('p' in obj)) {
    event.waitUntil(handlePushNotificationObject(obj));
    return;
  }

  const emptyNotification: PushNotificationObject = {
    loc_key: '',
    loc_args: [],
    custom: {
      msg_id: ''
    },
    random_id: 0,
    description: '',
    title: '',
    mute: '0',
    user_id: 0,
    accountNumber: 1
  };

  log('encrypted push', obj);

  const {p} = obj;
  if(!p) {
    log('no p');
    event.waitUntil(handlePushNotificationObject(emptyNotification));
    return;
  }

  const keysIdsBase64 = getter.getCached('push_keys_ids_base64');
  const keyIndex = keysIdsBase64?.findIndex((key) => p.startsWith(key)) ?? -1;
  if(keyIndex === -1) {
    log('no key');
    event.waitUntil(handlePushNotificationObject(emptyNotification));
    return;
  }

  const keyIdBase64 = keysIdsBase64[keyIndex];
  emptyNotification.accountNumber = keyIndex + 1 as ActiveAccountNumber;
  emptyNotification.p = p;
  emptyNotification.keyIdBase64 = keyIdBase64;
  event.waitUntil(
    serviceMessagePort.invoke('decryptPush', {p, keyIdBase64}, undefined, undefined, undefined, 1000)
    .catch((err) => {
      log.error('decryptPush error', err);
      return emptyNotification;
    })
    .then(handlePushNotificationObject)
  );
}

async function isPasscodeLocked() {
  return Promise.race([
    pause(1000).then(() => undefined as boolean),
    Promise.all([
      DeferredIsUsingPasscode.isUsingPasscode(),
      EncryptionKeyStore.get()
    ]).then(([isUsingPasscode, encryptionKey]) => {
      return isUsingPasscode && !encryptionKey;
    })
  ]);
}

function onNotificationClick(event: NotificationEvent) {
  const notification = event.notification;
  log('on notification click', notification);
  notification.close();

  const action = event.action as PushNotificationObject['action'];
  if(action === 'mute1d' && userInvisibleIsSupported()) {
    log('[SW] mute for 1d');
    getter.set('push_mute_until', Date.now() + 86400e3);
    return;
  }

  const data: PushNotificationObject = notification.data;
  if(!data) {
    return;
  }

  const promise = Promise.all([
    ctx.clients.matchAll({type: 'window'}),
    getter.get('push_settings'),
    getter.get('push_accounts'),
    isPasscodeLocked()
  ]).then(([clientList, settings, accounts, isLocked]) => {
    data.action = action;
    for(const _accountNumber in accounts) { // * find correct account number for this notification
      const accountNumber = +_accountNumber as ActiveAccountNumber;
      if(accounts[accountNumber] === data.user_id) {
        data.accountNumber = accountNumber;
        break;
      }
    }

    pendingNotification = data;
    for(let i = 0; i < clientList.length; ++i) {
      const client = clientList[i];
      if(!('focus' in client)) {
        continue;
      }

      // * verify account number
      const url = new URL(client.url);
      if((+url.searchParams.get(CURRENT_ACCOUNT_QUERY_PARAM) || 1) !== data.accountNumber) {
        continue;
      }

      client.focus();
      if(isLocked) { // * wait until app is unlocked
        return;
      }

      serviceMessagePort.invokeVoid('pushClick', pendingNotification, client);
      pendingNotification = undefined;
      return;
    }

    if(ctx.clients.openWindow) {
      const url = new URL(settings.baseUrl || defaultBaseUrl);
      if(data.accountNumber && data.accountNumber > 1) { // * set account number
        url.searchParams.set(CURRENT_ACCOUNT_QUERY_PARAM, data.accountNumber + '');
      }

      return ctx.clients.openWindow(url);
    }
  }).catch((error) => {
    log.error('Clients.matchAll error', error);
  })

  event.waitUntil(promise);
}

const notifications: Set<Notification> = new Set();
let pendingNotification: PushNotificationObject;
function pushToNotifications(notification: Notification) {
  if(!notifications.has(notification)) {
    notifications.add(notification);
    // @ts-ignore
    notification.onclose = onCloseNotification;
  }
}

function onCloseNotification(event: NotificationEvent) {
  removeFromNotifications(event.notification)
}

function removeFromNotifications(notification: Notification) {
  notifications.delete(notification);
}

export function closeAllNotifications(tag?: string) {
  for(const notification of notifications) {
    try {
      if(tag && notification.tag !== tag) {
        continue;
      }

      notification.close();
      notifications.delete(notification);
    } catch(e) {}
  }

  let promise: Promise<void>;
  if('getNotifications' in ctx.registration) {
    promise = ctx.registration.getNotifications({tag}).then((notifications) => {
      for(let i = 0, len = notifications.length; i < len; ++i) {
        try {
          notifications[i].close();
        } catch(e) {}
      }
    }).catch((error) => {
      log.error('Offline register SW error', error);
    });
  } else {
    promise = Promise.resolve();
  }

  return promise;
}

function userInvisibleIsSupported() {
  return IS_FIREFOX;
}

export function fillPushObject(obj: PushNotificationObject) {
  let peerId: string;

  if(obj.custom) {
    if(obj.custom.channel_id) {
      peerId = '' + -obj.custom.channel_id;
    } else if(obj.custom.chat_id) {
      peerId = '' + -obj.custom.chat_id;
    } else {
      peerId = obj.custom.from_id || '';
    }
  }

  obj.custom.peerId = '' + peerId;
  return obj;
}

function fireNotification(
  obj: PushNotificationObject,
  settings: PushStorage['push_settings'],
  lang: PushStorage['push_lang']
) {
  obj = fillPushObject(obj);
  const peerId = obj.custom.peerId;
  let title = obj.title || 'Telegram';
  let body = obj.description || '';
  let tag = 'peer' + peerId;

  const messageKey = peerId + '_' + obj.custom.msg_id;
  if(ignoreMessages.has(messageKey)) {
    const error = 'ignoring push';
    log.warn(error, obj);
    ignoreMessages.delete(messageKey);
    throw error;
  }

  if(settings?.nopreview || !obj.loc_key) {
    title = 'Telegram';
    body = lang.push_message_nopreview;
    tag = 'unknown_peer';
  }

  const actions: (Omit<NotificationAction, 'action'> & {action: PushNotificationObject['action']})[] = [
    userInvisibleIsSupported() && {
      action: 'mute1d',
      title: lang.push_action_mute1d
    }/* , {
    action: 'push_settings',
    title: lang.push_action_settings || 'Settings'
  } */];

  const notificationOptions: NotificationOptions = {
    body,
    icon: NOTIFICATION_ICON_PATH,
    tag,
    data: obj,
    actions: actions.filter(Boolean),
    badge: NOTIFICATION_BADGE_PATH,
    silent: obj.custom.silent === '1'
  };

  log('show notify', title, body, obj, notificationOptions);

  const notificationPromise = ctx.registration.showNotification(title, notificationOptions);
  return notificationPromise.catch((error) => {
    log.error('show notification promise error', error);
    throw error;
  });
}

export async function canSaveAccounts() {
  const [isUsingPasscode/* , encryptionKey */] = await Promise.all([
    DeferredIsUsingPasscode.isUsingPasscode()/* ,
    EncryptionKeyStore.get() */
  ]);
  // * if no passcode or app is unlocked
  return !isUsingPasscode/*  || !!encryptionKey */;
}

export async function onPing(payload: ServicePushPingTaskPayload, source?: MessageEventSource) {
  localNotificationsAvailable = payload.localNotifications;

  if(pendingNotification && source) {
    serviceMessagePort.invokeVoid('pushClick', pendingNotification, source);
    pendingNotification = undefined;
  }

  if(payload.lang) {
    getter.set('push_lang', payload.lang);
  }

  if(payload.settings) {
    getter.set('push_settings', payload.settings);
  }

  const canSave = await canSaveAccounts();
  getter.set('push_accounts', (canSave && payload.accounts) || defaults.push_accounts);
  getter.set('push_keys_ids_base64', payload.keysIdsBase64 || defaults.push_keys_ids_base64);
}

export function resetPushAccounts() {
  getter.set('push_accounts', defaults.push_accounts);
}

const ignoreMessages: Map<string, number> = new Map();
export function onShownNotification(payload: string) {
  ignoreMessages.set(payload, Date.now());
}

setInterval(() => {
  const time = Date.now();
  ignoreMessages.forEach((_time, key) => {
    if((time - _time) > 30e3) {
      ignoreMessages.delete(key);
    }
  });
}, 30 * 60e3);

ctx.addEventListener('notificationclick', onNotificationClick);
ctx.addEventListener('notificationclose', onCloseNotification);
ctx.addEventListener('push', onPushEvent);
