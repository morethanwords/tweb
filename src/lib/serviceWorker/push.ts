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

import {Database} from '../../config/databases';
import {AccountDatabase, getDatabaseState} from '../../config/databases/state';
import {NOTIFICATION_BADGE_PATH, NOTIFICATION_ICON_PATH} from '../../config/notifications';
import {IS_FIREFOX} from '../../environment/userAgent';
import deepEqual from '../../helpers/object/deepEqual';
import IDBStorage from '../files/idb';
import {log, serviceMessagePort} from './index.service';
import {ServicePushPingTaskPayload} from './serviceMessagePort';

const ctx = self as any as ServiceWorkerGlobalScope;
const defaultBaseUrl = location.protocol + '//' + location.hostname + location.pathname.split('/').slice(0, -1).join('/') + '/';

// as in webPushApiManager.ts
const PING_PUSH_TIMEOUT = 10000 + 1500;
let lastPingTime = 0;
let localNotificationsAvailable = true;

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
} & {
  action?: 'mute1d' | 'push_settings', // will be set before postMessage to main thread
};

class SomethingGetter<T extends Database<any>, Storage extends Record<string, any>> {
  private cache: Partial<Storage> = {};
  private storage: IDBStorage<T>;

  constructor(
    db: T,
    storeName: typeof db['stores'][number]['name'],
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
};

const defaults: PushStorage = {
  push_mute_until: 0,
  push_lang: {
    push_message_nopreview: 'You have a new message',
    push_action_mute1d: 'Mute for 24H',
    push_action_settings: 'Settings'
  },
  push_settings: {}
};

// Warning: Push API temporarily disabled
const getter = new SomethingGetter<AccountDatabase, PushStorage>(getDatabaseState(1), 'session', defaults);

// fill cache
for(const i in defaults) {
  getter.get(i as keyof PushStorage);
}

ctx.addEventListener('push', (event) => {
  const obj: PushNotificationObject = event.data.json();
  log('push', {...obj});

  try {
    const [muteUntil, settings, lang] = [
      getter.getCached('push_mute_until'),
      getter.getCached('push_settings'),
      getter.getCached('push_lang')
    ];

    const nowTime = Date.now();
    if(
      userInvisibleIsSupported() &&
      muteUntil &&
      nowTime < muteUntil
    ) {
      throw `supress notification because mute for ${Math.ceil((muteUntil - nowTime) / 60000)} min`;
    }

    const hasActiveWindows = (Date.now() - lastPingTime) <= PING_PUSH_TIMEOUT && localNotificationsAvailable;
    if(hasActiveWindows) {
      throw 'supress notification because some instance is alive';
    }

    const notificationPromise = fireNotification(obj, settings, lang);
    event.waitUntil(notificationPromise);
  } catch(err) {
    log(err);

    // const tag = 'fix';
    // const notificationPromise = ctx.registration.showNotification('Telegram', {tag});

    // notificationPromise.then(() => {
    //   closeAllNotifications(tag);
    // });

    // event.waitUntil(notificationPromise);
  }
});

ctx.addEventListener('notificationclick', (event) => {
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

  const promise = ctx.clients.matchAll({
    type: 'window'
  }).then((clientList) => {
    data.action = action;
    pendingNotification = data;
    for(let i = 0; i < clientList.length; ++i) {
      const client = clientList[i];
      if('focus' in client) {
        client.focus();
        serviceMessagePort.invokeVoid('pushClick', pendingNotification, client);
        pendingNotification = undefined;
        return;
      }
    }

    if(ctx.clients.openWindow) {
      return Promise.resolve(getter.get('push_settings')).then((settings) => {
        return ctx.clients.openWindow(settings.baseUrl || defaultBaseUrl);
      });
    }
  }).catch((error) => {
    log.error('Clients.matchAll error', error);
  })

  event.waitUntil(promise);
});

ctx.addEventListener('notificationclose', onCloseNotification);

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

function fireNotification(obj: PushNotificationObject, settings: PushStorage['push_settings'], lang: PushStorage['push_lang']) {
  let title = obj.title || 'Telegram';
  let body = obj.description || '';
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
  let tag = 'peer' + peerId;

  const messageKey = peerId + '_' + obj.custom.msg_id;
  if(ignoreMessages.has(messageKey)) {
    const error = 'ignoring push';
    log.warn(error, obj);
    ignoreMessages.delete(messageKey);
    throw error;
  }

  if(settings?.nopreview) {
    title = 'Telegram';
    body = lang.push_message_nopreview;
    tag = 'unknown_peer';
  }

  const actions: (Omit<NotificationAction, 'action'> & {action: PushNotificationObject['action']})[] = [{
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
    actions,
    badge: NOTIFICATION_BADGE_PATH,
    silent: obj.custom.silent === '1'
  };

  log('show notify', title, body, obj, notificationOptions);

  const notificationPromise = ctx.registration.showNotification(title, notificationOptions);

  return notificationPromise.catch((error) => {
    log.error('Show notification promise', error);
  });
}

export function onPing(payload: ServicePushPingTaskPayload, source?: MessageEventSource) {
  lastPingTime = Date.now();
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
