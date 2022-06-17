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

import { Database } from "../../config/databases";
import DATABASE_STATE from "../../config/databases/state";
import { IS_FIREFOX } from "../../environment/userAgent";
import deepEqual from "../../helpers/object/deepEqual";
import IDBStorage from "../idb";
import { log, ServiceWorkerPingTask, ServiceWorkerPushClickTask } from "./index.service";

const ctx = self as any as ServiceWorkerGlobalScope;
const defaultBaseUrl = location.protocol + '//' + location.hostname + location.pathname.split('/').slice(0, -1).join('/') + '/';

export type PushNotificationObject = {
  loc_key: string,
  loc_args: string[],
  //user_id: number, // should be number
  custom: {
    channel_id?: string, // should be number
    chat_id?: string, // should be number
    from_id?: string, // should be number
    msg_id: string,
    peerId?: string // should be number
  },
  sound?: string,
  random_id: number,
  badge?: string, // should be number
  description: string,
  mute: string, // should be number
  title: string,

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

  public async get<T extends keyof Storage>(key: T) {
    if(this.cache[key] !== undefined) {
      return this.cache[key];
    }

    let value: Storage[T];
    try {
      value = await this.storage.get(key as string);
    } catch(err) {

    }

    if(this.cache[key] !== undefined) {
      return this.cache[key];
    }

    if(value === undefined) {
      const callback = this.defaults[key];
      value = typeof(callback) === 'function' ? callback() : callback;
    }

    return this.cache[key] = value;
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
  push_lang: Partial<ServiceWorkerPingTask['payload']['lang']>
  push_settings: Partial<ServiceWorkerPingTask['payload']['settings']>
};

const getter = new SomethingGetter<typeof DATABASE_STATE, PushStorage>(DATABASE_STATE, 'session', {
  push_mute_until: 0,
  push_lang: {
    push_message_nopreview: 'You have a new message',
    push_action_mute1d: 'Mute for 24H',
    push_action_settings: 'Settings'
  },
  push_settings: {}
});

ctx.addEventListener('push', (event) => {
  const obj: PushNotificationObject = event.data.json();
  log('push', obj);

  let hasActiveWindows = false;
  const checksPromise = Promise.all([
    getter.get('push_mute_until'), 
    ctx.clients.matchAll({type: 'window'})
  ]).then((result) => {
    const [muteUntil, clientList] = result;
    
    log('matched clients', clientList);
    hasActiveWindows = clientList.length > 0;
    if(hasActiveWindows) {
      throw 'Supress notification because some instance is alive';
    }
    
    const nowTime = Date.now();
    if(userInvisibleIsSupported() &&
        muteUntil &&
        nowTime < muteUntil) {
      throw `Supress notification because mute for ${Math.ceil((muteUntil - nowTime) / 60000)} min`;
    }

    if(!obj.badge) {
      throw 'No badge?';
    }
  });

  checksPromise.catch((reason) => {
    log(reason);
  });

  const notificationPromise = checksPromise.then(() => {
    return Promise.all([getter.get('push_settings'), getter.get('push_lang')])
  }).then((result) => {
    return fireNotification(obj, result[0], result[1]);
  });

  const closePromise = notificationPromise.catch(() => {
    log('Closing all notifications on push', hasActiveWindows);
    if(userInvisibleIsSupported() || hasActiveWindows) {
      return closeAllNotifications();
    }

    return ctx.registration.showNotification('Telegram', {
      tag: 'unknown_peer'
    }).then(() => {
      if(hasActiveWindows) {
        return closeAllNotifications();
      }

      setTimeout(() => closeAllNotifications(), hasActiveWindows ? 0 : 100);
    }).catch((error) => {
      log.error('Show notification error', error);
    });
  });

  event.waitUntil(closePromise);
});

ctx.addEventListener('notificationclick', (event) => {
  const notification = event.notification;
  log('On notification click: ', notification.tag);
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
    pendingNotification = {type: 'push_click', payload: data};
    for(let i = 0; i < clientList.length; i++) {
      const client = clientList[i];
      if('focus' in client) {
        client.focus();
        client.postMessage(pendingNotification);
        pendingNotification = undefined;
        return;
      }
    }

    if(ctx.clients.openWindow) {
      return getter.get('push_settings').then((settings) => {
        return ctx.clients.openWindow(settings.baseUrl || defaultBaseUrl);
      });
    }
  }).catch((error) => {
    log.error('Clients.matchAll error', error);
  })

  event.waitUntil(promise);
});

ctx.addEventListener('notificationclose', onCloseNotification);

let notifications: Set<Notification> = new Set();
let pendingNotification: ServiceWorkerPushClickTask;
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

export function closeAllNotifications() {
  for(const notification of notifications) {
    try {
      notification.close();
    } catch(e) {}
  }

  let promise: Promise<void>;
  if('getNotifications' in ctx.registration) {
    promise = ctx.registration.getNotifications({}).then((notifications) => {
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

  notifications.clear();

  return promise;
}

function userInvisibleIsSupported() {
  return IS_FIREFOX;
}

function fireNotification(obj: PushNotificationObject, settings: PushStorage['push_settings'], lang: PushStorage['push_lang']) {
  const icon = 'assets/img/logo_filled_rounded.png';
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

  if(settings && settings.nopreview) {
    title = 'Telegram';
    body = lang.push_message_nopreview;
    tag = 'unknown_peer';
  }

  log('show notify', title, body, icon, obj);

  const actions: (Omit<NotificationAction, 'action'> & {action: PushNotificationObject['action']})[] = [{
    action: 'mute1d',
    title: lang.push_action_mute1d
  }/* , {
    action: 'push_settings',
    title: lang.push_action_settings || 'Settings'
  } */];

  const notificationPromise = ctx.registration.showNotification(title, {
    body,
    icon,
    tag,
    data: obj,
    actions
  });

  return notificationPromise.then((event) => {
    // @ts-ignore
    if(event && event.notification) {
      // @ts-ignore
      pushToNotifications(event.notification);
    }
  }).catch((error) => {
    log.error('Show notification promise', error);
  });
}

export function onPing(task: ServiceWorkerPingTask, event: ExtendableMessageEvent) {
  const client = event.ports && event.ports[0] || event.source;
  const payload = task.payload;

  if(pendingNotification &&
      client &&
      'postMessage' in client) {
    client.postMessage(pendingNotification, []);
    pendingNotification = undefined;
  }

  if(payload.lang) {
    getter.set('push_lang', payload.lang);
  }

  if(payload.settings) {
    getter.set('push_settings', payload.settings);
  }
}
