/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

/// #if MTPROTO_SW
import '../mtproto/mtproto.worker';
/// #endif
//import CacheStorageController from '../cacheStorage';
import type { Modify, WorkerTaskTemplate, WorkerTaskVoidTemplate } from '../../types';
import type { InputFileLocation, InputWebFileLocation, UploadFile } from '../../layer';
import type { WebPushApiManager } from '../mtproto/webPushApiManager';
import type { PushNotificationObject } from './push';
import type { ToggleStorageTask } from '../mtproto/mtprotoworker';
import type { MyUploadFile } from '../mtproto/apiFileManager';
import { logger, LogTypes } from '../logger';
import { CancellablePromise } from '../../helpers/cancellablePromise';
import { CACHE_ASSETS_NAME, requestCache } from './cache';
import onStreamFetch from './stream';
import { closeAllNotifications, onPing } from './push';
import CacheStorageController from '../cacheStorage';
import { IS_SAFARI } from '../../environment/userAgent';

export const log = logger('SW', LogTypes.Error | LogTypes.Debug | LogTypes.Log | LogTypes.Warn);
const ctx = self as any as ServiceWorkerGlobalScope;
export const deferredPromises: Map<WindowClient['id'], {[taskId: string]: CancellablePromise<any>}> = new Map();

export interface RequestFilePartTask extends Modify<WorkerTaskTemplate, {id: string}> {
  type: 'requestFilePart',
  payload: [number, InputFileLocation | InputWebFileLocation, number, number]
};

export interface RequestFilePartTaskResponse extends Modify<WorkerTaskTemplate, {id: string}> {
  type: 'requestFilePart',
  payload?: MyUploadFile,
  originalPayload?: RequestFilePartTask['payload']
};

export interface ServiceWorkerPingTask extends WorkerTaskVoidTemplate {
  type: 'ping',
  payload: {
    localNotifications: boolean,
    lang: {
      push_action_mute1d: string
      push_action_settings: string
      push_message_nopreview: string
    },
    settings: WebPushApiManager['settings']
  }
};

export interface ServiceWorkerNotificationsClearTask extends WorkerTaskVoidTemplate {
  type: 'notifications_clear'
};

export interface ServiceWorkerPushClickTask extends WorkerTaskVoidTemplate {
  type: 'push_click',
  payload: PushNotificationObject
};

export type ServiceWorkerTask = RequestFilePartTaskResponse | ServiceWorkerPingTask | ServiceWorkerNotificationsClearTask | ToggleStorageTask;

/// #if !MTPROTO_SW
const taskListeners: {
  [type in ServiceWorkerTask['type']]: (task: any, event: ExtendableMessageEvent) => void
} = {
  notifications_clear: () => {
    closeAllNotifications();
  },
  ping: (task: ServiceWorkerPingTask, event) => {
    onPing(task, event);
  },
  requestFilePart: (task: RequestFilePartTaskResponse, e: ExtendableMessageEvent) => {
    const windowClient = e.source as WindowClient;
    const promises = deferredPromises.get(windowClient.id);
    if(!promises) {
      return;
    }

    const promise = promises[task.id];
    if(promise) {
      if(task.error) {
        promise.reject(task.error);
      } else {
        promise.resolve(task.payload);
      }
  
      delete promises[task.id];
    }
  },
  toggleStorage: (task: ToggleStorageTask) => {
    CacheStorageController.toggleStorage(task.payload);
  }
};
ctx.addEventListener('message', (e) => {
  const task = e.data as ServiceWorkerTask;
  const callback = taskListeners[task.type];
  if(callback) {
    callback(task, e);
  }
});
/// #endif

//const cacheStorage = new CacheStorageController('cachedAssets');
/* let taskId = 0;

export function getTaskId() {
  return taskId;
}

export function incrementTaskId() {
  return taskId++;
} */

const onFetch = (event: FetchEvent): void => {
  if(event.request.url.indexOf(location.origin + '/') === 0 
    && event.request.url.match(/\.(js|css|jpe?g|json|wasm|png|mp3|svg|tgs|ico|woff2?|ttf|webmanifest?)(?:\?.*)?$/)
    && !IS_SAFARI) {
    return event.respondWith(requestCache(event));
  }

  try {
    const [, url, scope, params] = /http[:s]+\/\/.*?(\/(.*?)(?:$|\/(.*)$))/.exec(event.request.url) || [];

    //log.debug('[fetch]:', event);
  
    switch(scope) {
      case 'stream': {
        onStreamFetch(event, params);
        break;
      }
    }
  } catch(err) {
    event.respondWith(new Response('', {
      status: 500,
      statusText: 'Internal Server Error',
    }));
  }
};

const onChangeState = () => {
  ctx.onfetch = onFetch;
};

ctx.addEventListener('install', (event) => {
  log('installing');
  event.waitUntil(ctx.skipWaiting()); // Activate worker immediately
});

ctx.addEventListener('activate', (event) => {
  log('activating', ctx);
  event.waitUntil(ctx.caches.delete(CACHE_ASSETS_NAME));
  event.waitUntil(ctx.clients.claim());
});

ctx.onerror = (error) => {
  log.error('error:', error);
};

ctx.onunhandledrejection = (error) => {
  log.error('onunhandledrejection:', error);
};

ctx.onoffline = ctx.ononline = onChangeState;

onChangeState();
