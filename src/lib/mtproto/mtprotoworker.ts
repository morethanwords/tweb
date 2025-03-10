/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import type {Awaited} from '../../types';
import {type State} from '../../config/state';
import type {Chat, ChatPhoto, Message, MessagePeerReaction, PeerNotifySettings, User, UserProfilePhoto} from '../../layer';
import type {CryptoMethods} from '../crypto/crypto_methods';
import type {ThumbStorageMedia} from '../storages/thumbs';
import type ThumbsStorage from '../storages/thumbs';
import type {AppReactionsManager} from '../appManagers/appReactionsManager';
import type {MessagesStorageKey} from '../appManagers/appMessagesManager';
import type {AppAvatarsManager, PeerPhotoSize} from '../appManagers/appAvatarsManager';
import rootScope, {BroadcastEvents} from '../rootScope';
import webpWorkerController from '../webp/webpWorkerController';
import {MOUNT_CLASS_TO} from '../../config/debug';
import sessionStorage from '../sessionStorage';
import webPushApiManager from './webPushApiManager';
import appRuntimeManager from '../appManagers/appRuntimeManager';
import telegramMeWebManager from './telegramMeWebManager';
import pause from '../../helpers/schedulers/pause';
import ENVIRONMENT from '../../environment';
import loadStateForAllAccountsOnce from '../appManagers/utils/state/loadState';
import opusDecodeController from '../opusDecodeController';
import MTProtoMessagePort from './mtprotoMessagePort';
import cryptoMessagePort from '../crypto/cryptoMessagePort';
import SuperMessagePort from './superMessagePort';
import IS_SHARED_WORKER_SUPPORTED from '../../environment/sharedWorkerSupport';
import toggleStorages from '../../helpers/toggleStorages';
import idleController from '../../helpers/idleController';
import ServiceMessagePort from '../serviceWorker/serviceMessagePort';
import deferredPromise, {CancellablePromise} from '../../helpers/cancellablePromise';
import {makeWorkerURL} from '../../helpers/setWorkerProxy';
import ServiceWorkerURL from '../../../sw?worker&url';
import setDeepProperty, {joinDeepPath, splitDeepPath} from '../../helpers/object/setDeepProperty';
import getThumbKey from '../storages/utils/thumbs/getThumbKey';
import {NULL_PEER_ID, TEST_NO_STREAMING, THUMB_TYPE_FULL} from './mtproto_config';
import generateEmptyThumb from '../storages/utils/thumbs/generateEmptyThumb';
import getStickerThumbKey from '../storages/utils/thumbs/getStickerThumbKey';
import callbackify from '../../helpers/callbackify';
import isLegacyMessageId from '../appManagers/utils/messageId/isLegacyMessageId';
import {MTAppConfig} from './appConfig';
import {setAppStateSilent} from '../../stores/appState';
import getObjectKeysAndSort from '../../helpers/object/getObjectKeysAndSort';
import {reconcilePeer, reconcilePeers} from '../../stores/peers';
import {getCurrentAccount} from '../accounts/getCurrentAccount';
import {ActiveAccountNumber} from '../accounts/types';
import {createProxiedManagersForAccount} from '../appManagers/getProxiedManagers';
import noop from '../../helpers/noop';
import AccountController from '../accounts/accountController';
import getPeerTitle from '../../components/wrappers/getPeerTitle';
import I18n from '../langPack';
import {NOTIFICATION_BADGE_PATH} from '../../config/notifications';
import {createAppURLForAccount} from '../accounts/createAppURLForAccount';
import {appSettings, setAppSettingsSilent} from '../../stores/appSettings';
import {unwrap} from 'solid-js/store';
import createNotificationImage from '../../helpers/createNotificationImage';
import PasscodeLockScreenController from '../../components/passcodeLock/passcodeLockScreenController';
import EncryptionKeyStore from '../passcode/keyStore';
import DeferredIsUsingPasscode from '../passcode/deferredIsUsingPasscode';
import CacheStorageController from '../files/cacheStorage';


export type Mirrors = {
  state: State,
  thumbs: ThumbsStorage['thumbsCache'],
  stickerThumbs: ThumbsStorage['stickerCachedThumbs'],
  availableReactions: AppReactionsManager['availableReactions'] | Promise<AppReactionsManager['availableReactions']>,
  messages: {
    [type in string]: {
      [mid in number]: Message.message | Message.messageService
    }
  },
  groupedMessages: {
    [groupedId in string]: Map<number, Message.message | Message.messageService>
  },
  peers: {
    [peerId in PeerId]: Exclude<Chat, Chat.chatEmpty> | User.user
  },
  avatars: AppAvatarsManager['savedAvatarURLs']
};

export type MirrorTaskPayload<
  T extends keyof Mirrors = keyof Mirrors
  // K extends keyof Mirrors[T] = keyof Mirrors[T],
  // J extends Mirrors[T][K] = Mirrors[T][K]
> = {
  name: T,
  // key?: K,
  key?: string,
  value?: any,
  accountNumber: ActiveAccountNumber
};

export type NotificationBuildTaskPayload = {
  message: Message.message | Message.messageService,
  fwdCount?: number,
  peerReaction?: MessagePeerReaction,
  peerTypeNotifySettings?: PeerNotifySettings,
  accountNumber?: ActiveAccountNumber,
  isOtherTabActive?: boolean
};

export type TabState = {
  chatPeerIds: PeerId[],
  idleStartTime: number,
  accountNumber: number
};

class ApiManagerProxy extends MTProtoMessagePort {
  // private worker: /* Window */Worker;
  // private sockets: Map<number, Socket> = new Map();
  private mirrors: Mirrors;

  public newVersion: string;
  public oldVersion: string;

  private tabState: TabState;
  private allTabStates: TabState[];

  public share: ShareData;

  public serviceMessagePort: ServiceMessagePort<true>;
  private lastServiceWorker: ServiceWorker;

  private pingServiceWorkerPromise: CancellablePromise<void>;

  private processMirrorTaskMap: {
    [type in keyof Mirrors]?: (payload: MirrorTaskPayload) => void
  };

  private appConfig: MaybePromise<MTAppConfig>;

  private closeMTProtoWorker = noop;

  private intervals: Map<number, () => any>;

  private serviceWorkerRegistration: ServiceWorkerRegistration;

  constructor() {
    super();

    this.mirrors = {
      state: undefined,
      thumbs: {},
      stickerThumbs: {},
      availableReactions: undefined,
      messages: {},
      groupedMessages: {},
      peers: {},
      avatars: {}
    };

    this.processMirrorTaskMap = {
      messages: (payload) => {
        if(!payload.key) { // * mirroring all messages at once
          for(const key in payload.value) {
            for(const mid in payload.value[key]) {
              this.processMirrorTaskMap.messages({
                name: payload.name,
                accountNumber: payload.accountNumber,
                key: joinDeepPath(key, mid),
                value: payload.value[key][mid] as any
              });
            }
          }

          return;
        }

        const message = payload.value as Message.message | Message.messageService;
        let mid: number, groupedId: string;
        if(message) {
          mid = message.mid;
          groupedId = (message as Message.message).grouped_id;
        } else {
          const [key, _mid] = splitDeepPath(payload.key);
          mid = +_mid;
          const previousMessage = this.mirrors.messages[key]?.[mid];
          if(!previousMessage) {
            return;
          }

          groupedId = (previousMessage as Message.message).grouped_id;
        }

        if(!groupedId) {
          return;
        }

        const map = this.mirrors.groupedMessages[groupedId] ??= new Map();
        if(!message) {
          map.delete(mid);

          if(!map.size) {
            delete this.mirrors.groupedMessages[groupedId];
          }
        } else {
          map.set(mid, message);
        }
      },

      state: (payload) => {
        if(payload.key) {
          setAppStateSilent(payload.key, payload.value);
        } else {
          console.error(payload);
        }
      },

      peers: (payload) => {
        if(payload.key) {
          reconcilePeer(payload.key.toPeerId(), payload.value as any);
        } else {
          reconcilePeers(payload.value);
        }
      }
    };

    this.tabState = {
      accountNumber: getCurrentAccount(),
      chatPeerIds: [],
      idleStartTime: 0
    };

    this.intervals = new Map();

    this.log('constructor');

    if(!import.meta.env.VITE_MTPROTO_SW) {
      this.registerWorker();
    }

    this.registerServiceWorker();
    this.registerCryptoWorker();

    const commonEventNames = new Set<keyof BroadcastEvents>([
      'language_change',
      'settings_updated',
      'theme_changed',
      'theme_change',
      'background_change',
      'logging_out',
      'notification_count_update',
      'account_logged_in',
      'notification_cancel',
      'toggle_using_passcode',
      'toggle_locked'
    ]);

    // const perf = performance.now();
    this.addMultipleEventsListeners({
      convertWebp: ({fileName, bytes}) => {
        return webpWorkerController.convert(fileName, bytes);
      },

      convertOpus: ({fileName, bytes}) => {
        return opusDecodeController.pushDecodeTask(bytes, false).then((result) => result.bytes);
      },

      event: ({name, args, accountNumber}) => {
        const isDifferentAccount = accountNumber && accountNumber !== getCurrentAccount();
        if(!commonEventNames.has(name as keyof BroadcastEvents) && isDifferentAccount) return;
        // @ts-ignore
        rootScope.dispatchEventSingle(name, ...args);
      },

      localStorageProxy: (payload) => {
        return sessionStorage.localStorageProxy(payload.type, ...payload.args);
      },

      mirror: this.onMirrorTask,

      receivedServiceMessagePort: () => {
        this.log.warn('mtproto worker received service message port');
      },

      tabsUpdated: (payload) => {
        this.allTabStates = payload;
        rootScope.dispatchEvent('notification_count_update');
      },

      callNotification: async(payload) => {
        const {accountNumber} = payload;
        const managers = createProxiedManagersForAccount(accountNumber);
        const peerId = payload.callerId.toPeerId();
        const peer = await managers.appPeersManager.getPeer(peerId);
        const title = await getPeerTitle({peerId: peerId, managers, plainText: true, limitSymbols: 20, useManagers: true});

        const notification = new Notification(title, {
          body: I18n.format('Call.StatusCalling', true),
          icon: await createNotificationImage(managers, peerId, title),
          badge: NOTIFICATION_BADGE_PATH
        });
        notification.onclick = () => {
          const peerId = peer.id;
          const url = createAppURLForAccount(accountNumber, {
            p: '' + peerId.toPeerId(),
            call: '' + payload.callId
          });
          window.open(url, '_blank');
          notification.close();
        };
        setTimeout(() => {
          notification.close();
        }, 5_000);
      },

      log: (payload) => {
        console.log('[SharedWorker]', payload);
      },

      intervalCallback: (intervalId) => {
        const callback = this.intervals.get(intervalId);
        if(callback) {
          callback();
        }
      },

      saveEncryptionKey: (payload) => {
        EncryptionKeyStore.save(payload);
      },

      toggleLock: (isLocked) => {
        if(isLocked) {
          PasscodeLockScreenController.lock();
        } else {
          PasscodeLockScreenController.unlock();
        }
      },

      toggleCacheStorage: (enabled) => {
        CacheStorageController.temporarilyToggle(enabled);
      },

      toggleUsingPasscode: (payload) => {
        DeferredIsUsingPasscode.resolveDeferred(payload.isUsingPasscode);
        EncryptionKeyStore.save(payload.isUsingPasscode ? payload.encryptionKey : null);
      }

      // hello: () => {
      //   this.log.error('time hello', performance.now() - perf);
      // }
    });

    // this.addTaskListener('socketProxy', (task) => {
    //   const socketTask = task.payload;
    //   const id = socketTask.id;
    //   //console.log('socketProxy', socketTask, id);

    //   if(socketTask.type === 'send') {
    //     const socket = this.sockets.get(id);
    //     socket.send(socketTask.payload);
    //   } else if(socketTask.type === 'close') { // will remove from map in onClose
    //     const socket = this.sockets.get(id);
    //     socket.close();
    //   } else if(socketTask.type === 'setup') {
    //     const socket = new Socket(socketTask.payload.dcId, socketTask.payload.url, socketTask.payload.logSuffix);

    //     const onOpen = () => {
    //       //console.log('socketProxy onOpen');
    //       this.postMessage({
    //         type: 'socketProxy',
    //         payload: {
    //           type: 'open',
    //           id
    //         }
    //       });
    //     };
    //     const onClose = () => {
    //       this.postMessage({
    //         type: 'socketProxy',
    //         payload: {
    //           type: 'close',
    //           id
    //         }
    //       });

    //       socket.removeEventListener('open', onOpen);
    //       socket.removeEventListener('close', onClose);
    //       socket.removeEventListener('message', onMessage);
    //       this.sockets.delete(id);
    //     };
    //     const onMessage = (buffer: ArrayBuffer) => {
    //       this.postMessage({
    //         type: 'socketProxy',
    //         payload: {
    //           type: 'message',
    //           id,
    //           payload: buffer
    //         }
    //       });
    //     };

    //     socket.addEventListener('open', onOpen);
    //     socket.addEventListener('close', onClose);
    //     socket.addEventListener('message', onMessage);
    //     this.sockets.set(id, socket);
    //   }
    // });

    rootScope.addEventListener('language_change', (language) => {
      rootScope.managers.networkerFactory.setLanguage(language);
      rootScope.managers.appAttachMenuBotsManager.onLanguageChange();
    });

    window.addEventListener('online', () => {
      rootScope.managers.networkerFactory.forceReconnectTimeout();
    });

    rootScope.addEventListener('logging_out', ({accountNumber, migrateTo}) => {
      // const toClear: CacheStorageDbName[] = ['cachedFiles', 'cachedStreamChunks'];
      Promise.all([
        toggleStorages(false, true),
        Promise.race([
          // TODO: Check here
          telegramMeWebManager.setAuthorized(false),
          pause(3000)
        ]),
        webPushApiManager.forceUnsubscribe(),
        this.invokeVoid('terminate', undefined), // * terminate mtproto worker
        this.serviceWorkerRegistration?.unregister().catch(noop) // * release storages
      ]).finally(() => {
        let url = new URL(location.href);

        const currentAccount = getCurrentAccount();
        if(!accountNumber) {
          url.hash = '';
          url.search = '';
        } else if(currentAccount > accountNumber) {
          const newAccountNumber = currentAccount - 1;
          url = createAppURLForAccount(newAccountNumber as ActiveAccountNumber, undefined, true);
          //
        } else if(currentAccount === accountNumber) {
          if(migrateTo) url = createAppURLForAccount(migrateTo);
          else {
            url.hash = '';
            url.search = '';
          }
        }

        history.replaceState(null, '', url);

        // Make sure managers don't have any obsolete data
        this.closeMTProtoWorker(); // might be useless because of the above `this.invokeVoid('terminate', undefined)` ⬆️

        appRuntimeManager.reload();
      });
    });

    rootScope.addEventListener('settings_updated', ({key, settings}) => {
      setAppSettingsSilent(/* key,  */settings);
    });

    rootScope.addEventListener('toggle_using_passcode', (value) => {
      DeferredIsUsingPasscode.resolveDeferred(value);
    });

    idleController.addEventListener('change', (idle) => {
      this.updateTabStateIdle(idle);
    });
    this.updateTabStateIdle(idleController.isIdle);

    // this.sendState();
  }

  public sendEnvironment() {
    this.log('Passing environment:', ENVIRONMENT);
    this.invoke('environment', ENVIRONMENT);
  }

  public pingServiceWorkerWithIframe() {
    if(this.pingServiceWorkerPromise) {
      return this.pingServiceWorkerPromise;
    }

    const promise = this.pingServiceWorkerPromise = deferredPromise<void>();
    const iframe = document.createElement('iframe');
    iframe.hidden = true;
    const onFinish = () => {
      clearTimeout(timeout);
      setTimeout(() => { // ping once in 10 seconds
        this.pingServiceWorkerPromise = undefined;
      }, 10e3);

      iframe.removeEventListener('load', onLoad);
      iframe.removeEventListener('error', onError);
      iframe.remove();
    };
    const onLoad = () => {
      onFinish();
      promise.resolve();
    };
    const onError = () => {
      onFinish();
      promise.reject();
    };
    iframe.addEventListener('load', onLoad);
    iframe.addEventListener('error', onError);
    iframe.src = 'ping/' + (Math.random() * 0xFFFFFFFF | 0) + '.nocache';
    document.body.append(iframe);

    const timeout = window.setTimeout(onError, 1500);
    return promise;
  }

  private attachServiceWorker(serviceWorker: ServiceWorker) {
    if(this.lastServiceWorker === serviceWorker) {
      this.log.warn('trying to attach same service worker');
      return;
    }

    this.lastServiceWorker && this.serviceMessagePort.detachPort(this.lastServiceWorker);
    this.serviceMessagePort.attachSendPort(this.lastServiceWorker = serviceWorker);
    this.serviceMessagePort.invokeVoid('hello', undefined);
    this.serviceMessagePort.invokeVoid('environment', ENVIRONMENT);

    DeferredIsUsingPasscode.isUsingPasscode().then((value) => {
      if(!value) {
        // When value=true we'll send it and the encryption key after unlocking the screen
        this.serviceMessagePort.invokeVoid('toggleUsingPasscode', {isUsingPasscode: false});
      }
    });
  }

  private _registerServiceWorker() {
    // if(import.meta.env.DEV && IS_SAFARI) {
    //   return;
    // }

    navigator.serviceWorker.register(
      // * doesn't work
      // new URL('../../../sw.ts', import.meta.url),
      // '../../../sw',
      ServiceWorkerURL,
      {type: 'module', scope: './'}
    ).then((registration) => {
      if(TEST_NO_STREAMING) {
        throw 1;
      }

      this.log('SW registered', registration);
      this.serviceWorkerRegistration = registration;

      const url = new URL(window.location.href);
      const FIX_KEY = 'swfix';
      const swfix = +url.searchParams.get(FIX_KEY) || 0;
      if(registration.active && !navigator.serviceWorker.controller) {
        if(swfix >= 3) {
          throw new Error('no controller');
        }

        // ! doubtful fix for hard refresh
        return registration.unregister().then(() => {
          url.searchParams.set(FIX_KEY, '' + (swfix + 1));
          window.location.href = url.toString();
        });
      }

      if(swfix) {
        url.searchParams.delete(FIX_KEY);
        history.pushState(undefined, '', url);
      }

      const sw = registration.installing || registration.waiting || registration.active;
      sw.addEventListener('statechange', (e) => {
        this.log('SW statechange', e);
      });

      const controller = navigator.serviceWorker.controller || registration.installing || registration.waiting || registration.active;
      this.attachServiceWorker(controller);

      if(import.meta.env.VITE_MTPROTO_SW) {
        this.onWorkerFirstMessage(controller);
      }
    }).catch((err) => {
      this.log.error('SW registration failed!', err);

      this.invokeVoid('serviceWorkerOnline', false);
    });
  }

  private registerServiceWorker() {
    if(!('serviceWorker' in navigator)) return;

    this.serviceMessagePort = webPushApiManager.serviceMessagePort = new ServiceMessagePort<true>();

    // this.addMultipleEventsListeners({
    //   hello: () => {
    //     // this.serviceMessagePort.invokeVoid('port', undefined);
    //   }
    // });

    // ! I hate webpack - it won't load it by using worker.register, only navigator.serviceWorker will do it.
    const worker = navigator.serviceWorker;
    this._registerServiceWorker();

    // worker.startMessages();

    worker.addEventListener('controllerchange', () => {
      this.log.warn('controllerchange');

      const controller = worker.controller;
      this.attachServiceWorker(controller);

      controller.addEventListener('error', (e) => {
        this.log.error('controller error:', e);
      });
    });

    if(import.meta.env.VITE_MTPROTO_SW) {
      this.attachListenPort(worker);
    } else {
      this.serviceMessagePort.attachListenPort(worker);
      this.serviceMessagePort.addMultipleEventsListeners({
        port: (payload, source, event) => {
          this.log.warn('got service worker port');
          this.invokeVoid('serviceWorkerPort', undefined, undefined, [event.ports[0]]);
        },

        serviceCryptoPort: (_, __, event) => {
          cryptoMessagePort.sendToOnePort(event.ports[0]);
        },

        hello: (payload, source) => {
          this.log('got hello from service worker');
          this.serviceMessagePort.resendLockTask(source);
          this.serviceMessagePort.invokeVoid('environment', ENVIRONMENT);
        },

        share: (payload) => {
          this.log('will try to share something');
          this.share = payload;
        }
      });
    }

    worker.addEventListener('messageerror', (e) => {
      this.log.error('SW messageerror:', e);
    });
  }

  private async registerCryptoWorker() {
    const get = (url: string) => {
      return fetch(url).then((response) => response.text()).then((text) => {
        const pathnameSplitted = location.pathname.split('/');
        pathnameSplitted[pathnameSplitted.length - 1] = '';
        const pre = location.origin + pathnameSplitted.join('/');
        text = text.replace(/(import (?:.+? from )?['"])\//g, '$1' + pre);
        const blob = new Blob([text], {type: 'application/javascript'});
        return blob;
      });
    };

    const workerHandler = {
      construct(target: any, args: any): any {
        return {
          url: makeWorkerURL(args[0]).toString()
        };
      }
    };

    const originals = [
      Worker,
      typeof(SharedWorker) !== 'undefined' && SharedWorker
    ].filter(Boolean);
    originals.forEach((w) => window[w.name as any] = new Proxy(w, workerHandler));

    const worker: SharedWorker | Worker = new Worker(
      new URL('../crypto/crypto.worker.ts', import.meta.url),
      {type: 'module'}
    );

    originals.forEach((w) => window[w.name as any] = w as any);

    const originalUrl = (worker as any).url;

    const createWorker = (url: string) => new constructor(url, {type: 'module'});
    const attachWorkerToPort = (worker: SharedWorker | Worker) => this.attachWorkerToPort(worker, cryptoMessagePort, 'crypto');
    const constructor = IS_SHARED_WORKER_SUPPORTED ? SharedWorker : Worker;

    // let cryptoWorkers = workers.length;
    // cryptoMessagePort.addEventListener('servicePort', (payload, source, event) => {
    //   this.serviceMessagePort.invokeVoid('cryptoPort', undefined, undefined, [event.ports[0]]);
    // });
    cryptoMessagePort.addEventListener('port', (payload, source, event) => {
      this.invokeVoid('cryptoPort', undefined, undefined, [event.ports[0]]);

      // .then((attached) => {
      //   if(!attached && cryptoWorkers-- > 1) {
      //     this.log.error('terminating unneeded crypto worker');

      //     cryptoMessagePort.invokeVoid('terminate', undefined, source);
      //     const worker = workers.find((worker) => (worker as SharedWorker).port === source || (worker as any) === source);
      //     if((worker as SharedWorker).port) (worker as SharedWorker).port.close();
      //     else (worker as Worker).terminate();
      //     cryptoMessagePort.detachPort(source);
      //   }
      // });
    });

    const firstWorker = createWorker(originalUrl);
    attachWorkerToPort(firstWorker);

    const blob = await get(originalUrl);
    const urlsPromise = await this.invoke('createProxyWorkerURLs', {originalUrl, blob});
    const workers = urlsPromise.slice(1).map(createWorker);
    workers.forEach(attachWorkerToPort);
  }

  private registerWorker() {
    if(import.meta.env.VITE_MTPROTO_SW) {
      return;
    }

    let worker: SharedWorker | Worker;
    if(IS_SHARED_WORKER_SUPPORTED) {
      worker = new SharedWorker(
        new URL('./mtproto.worker.ts', import.meta.url),
        {type: 'module'}
      );
      this.closeMTProtoWorker = () => (worker as SharedWorker).port.close();
    } else {
      worker = new Worker(
        new URL('./mtproto.worker.ts', import.meta.url),
        {type: 'module'}
      );
      this.closeMTProtoWorker = () => (worker as Worker).terminate();
    }

    this.onWorkerFirstMessage(worker);
  }

  private attachWorkerToPort(worker: SharedWorker | Worker, messagePort: SuperMessagePort<any, any, any>, type: string) {
    const port: MessagePort = (worker as SharedWorker).port || worker as any;
    messagePort.attachPort(port);

    worker.addEventListener('error', (err) => {
      this.log.error(type, 'worker error', err);
    });
  }

  private onWorkerFirstMessage(worker: any) {
    this.log('set webWorker');

    // this.worker = worker;
    if(import.meta.env.VITE_MTPROTO_SW) {
      this.attachSendPort(worker);
    } else {
      this.attachWorkerToPort(worker, this, 'mtproto');
    }
  }

  public async loadAllStates() {
    const loadedStates = await loadStateForAllAccountsOnce();

    this.dispatchUserAuth();

    const stateForThisAccount = loadedStates[getCurrentAccount()];
    rootScope.settings = stateForThisAccount.common.settings;
    this.newVersion = stateForThisAccount.newVersion;
    this.oldVersion = stateForThisAccount.oldVersion;
    this.mirrors['state'] = stateForThisAccount.state;
    setAppStateSilent(stateForThisAccount.state);
    setAppSettingsSilent(stateForThisAccount.common.settings);

    Object.defineProperty(rootScope, 'settings', {
      get: () => {
        return unwrap(appSettings);
      }
    });

    return loadedStates;
  }

  private async dispatchUserAuth() {
    const accountData = await AccountController.get(getCurrentAccount());
    if(accountData?.userId) {
      rootScope.dispatchEvent('user_auth', {
        dcID: accountData.dcId || 0,
        date: accountData.date || (Date.now() / 1000 | 0),
        id: accountData.userId.toPeerId(false)
      });
    }
  }

  public hasTabOpenFor(accountNumber: ActiveAccountNumber) {
    return !!this.allTabStates.find((tab) => tab.accountNumber === accountNumber);
  }

  public getOpenTabsCount() {
    return this.allTabStates.length;
  }

  public sendAllStates(loadedStates: Awaited<ReturnType<ApiManagerProxy['loadAllStates']>>) {
    const promises: Promise<any>[] = [];
    for(let i = 1; i <= 4; i++) {
      const state = loadedStates[i as ActiveAccountNumber];
      const promise = this.invoke('state', {
        ...state,
        accountNumber: i as ActiveAccountNumber
      });

      promises.push(promise);
    }

    return Promise.all(promises);
  }

  public invokeCrypto<Method extends keyof CryptoMethods>(method: Method, ...args: Parameters<CryptoMethods[typeof method]>) {
    if(!import.meta.env.VITE_MTPROTO_WORKER) {
      return;
    }

    return cryptoMessagePort.invokeCrypto(method, ...args);
  }

  public async toggleStorages(enabled: boolean, clearWrite: boolean) {
    await toggleStorages(enabled, clearWrite);
    this.invoke('toggleStorages', {enabled, clearWrite});
    this.serviceMessagePort?.invokeVoid('toggleStorages', {enabled, clearWrite});
  }

  public async getMirror<T extends keyof Mirrors>(name: T) {
    const mirror = this.mirrors[name];
    return mirror;
  }

  public getState() {
    return this.getMirror('state');
  }

  public getAllTabStates() {
    return [...this.allTabStates];
  }

  public getCacheContext(
    media: ThumbStorageMedia,
    thumbSize: string = THUMB_TYPE_FULL,
    key = getThumbKey(media)
  ) {
    const cache = this.mirrors.thumbs[key];
    return cache?.[thumbSize] || generateEmptyThumb(thumbSize);
  }

  public getStickerCachedThumb(docId: DocId, toneIndex: string | number) {
    const key = getStickerThumbKey(docId, toneIndex);
    return this.mirrors.stickerThumbs[key];
  }

  public getAvailableReactions() {
    return this.mirrors.availableReactions ||= rootScope.managers.appReactionsManager.getAvailableReactions();
  }

  public getReaction(reaction: string) {
    return callbackify(this.getAvailableReactions(), (availableReactions) => {
      return availableReactions.find((availableReaction) => availableReaction.reaction === reaction);
    });
  }

  public getMessageFromStorage(key: MessagesStorageKey, mid: number) {
    // * use global storage instead
    if(key.endsWith('history') && isLegacyMessageId(mid)) {
      key = this.getGlobalHistoryMessagesStorage();
    }

    const cache = this.mirrors.messages[key];
    return cache?.[mid];
  }

  public getGroupsFirstMessage(message: Message.message) {
    if(!message?.grouped_id) return message;

    const storage = this.mirrors.groupedMessages[message.grouped_id];
    let minMid = Number.MAX_SAFE_INTEGER;
    for(const [mid, message] of storage) {
      if(message.mid < minMid) {
        minMid = message.mid;
      }
    }

    return storage.get(minMid);
  }

  public getMidsByGroupedId(groupedId: string, sort: 'asc' | 'desc' = 'asc') {
    return getObjectKeysAndSort(this.mirrors.groupedMessages[groupedId], sort);
  }

  public getMessagesByGroupedId(groupedId: string) {
    const mids = this.getMidsByGroupedId(groupedId, 'asc');
    const storage = this.mirrors.groupedMessages[groupedId];
    // return mids.map((mid) => this.getMessageFromStorage(storage, mid) as Message.message);
    return mids.map((mid) => storage.get(mid) as Message.message);
  }

  public getHistoryMessagesStorage(peerId: PeerId): MessagesStorageKey {
    return `${peerId}_history`;
  }

  public getGlobalHistoryMessagesStorage(): MessagesStorageKey {
    return this.getHistoryMessagesStorage(NULL_PEER_ID);
  }

  public getMessageById(messageId: number) {
    if(isLegacyMessageId(messageId)) {
      return this.getMessageFromStorage(this.getGlobalHistoryMessagesStorage(), messageId);
    }
  }

  public getMessageByPeer(peerId: PeerId, messageId: number) {
    if(!peerId) {
      return this.getMessageById(messageId);
    }

    return this.getMessageFromStorage(this.getHistoryMessagesStorage(peerId), messageId);
  }


  public getPeerForAccount(peerId: PeerId, accountNumber: ActiveAccountNumber) {
    const managers = createProxiedManagersForAccount(accountNumber);
    return managers.appPeersManager.getPeer(peerId);
  }

  public getPeer(peerId: PeerId) {
    return this.mirrors.peers[peerId];
  }

  public getUser(userId: UserId) {
    return this.mirrors.peers[userId.toPeerId(false)] as User.user;
  }

  public getChat(chatId: ChatId) {
    return this.mirrors.peers[chatId.toPeerId(true)] as Exclude<Chat, Chat.chatEmpty>;
  }

  public isForum(peerId: PeerId) {
    const peer = this.getPeer(peerId);
    return !!(peer as Chat.channel)?.pFlags?.forum;
  }

  public isAvatarCached(peerId: PeerId, size?: PeerPhotoSize) {
    const saved = this.mirrors.avatars[peerId];
    if(size === undefined) {
      return !!saved;
    }

    return !!(saved && saved[size] && !(saved[size] instanceof Promise));
  }

  public loadAvatar(peerId: PeerId, photo: UserProfilePhoto.userProfilePhoto | ChatPhoto.chatPhoto, size: PeerPhotoSize, accountNumber?: ActiveAccountNumber) {
    if(accountNumber && accountNumber !== getCurrentAccount()) {
      const managers = createProxiedManagersForAccount(accountNumber);
      return managers.appAvatarsManager.loadAvatar(peerId, photo, size);
    }

    const saved = this.mirrors.avatars[peerId] ??= {};
    return saved[size] ??= rootScope.managers.appAvatarsManager.loadAvatar(peerId, photo, size);
  }

  public getAppConfig(overwrite?: boolean) {
    if(overwrite) {
      this.appConfig = undefined;
    }

    if(!this.appConfig) {
      const promise = rootScope.managers.apiManager.getAppConfig().then((appConfig) => {
        if(this.appConfig === promise) {
          this.appConfig = appConfig;
        }

        return appConfig;
      });

      return this.appConfig = promise;
    }

    return this.appConfig;
  }

  public isPremiumFeaturesHidden(): MaybePromise<boolean> {
    return callbackify(this.isPremiumPurchaseBlocked(), (isPremiumPurchaseBlocked) => {
      return isPremiumPurchaseBlocked && !rootScope.premium;
    });
  }

  public isPremiumPurchaseBlocked(): MaybePromise<boolean> {
    return callbackify(this.getAppConfig(), (appConfig) => {
      return !!appConfig.premium_purchase_blocked;
    });
  }

  public async hasSomeonePremium() {
    const totalAccounts = await AccountController.getTotalAccounts();

    let hasSomeonePremium = false;
    for(let i = 1; i <= totalAccounts; i++) {
      const accountNumber = i as ActiveAccountNumber;
      const managers = createProxiedManagersForAccount(accountNumber);
      hasSomeonePremium ||= await managers.rootScope.getPremium();
      if(hasSomeonePremium) break;
    }

    return hasSomeonePremium;
  }

  public updateTabState<T extends keyof TabState>(key: T, value: TabState[T]) {
    this.tabState[key] = value;
    this.invokeVoid('tabState', this.tabState);
  }

  public updateTabStateIdle(idle: boolean) {
    this.updateTabState('idleStartTime', idle ? Date.now() : 0);
  }

  private onMirrorTask = (payload: MirrorTaskPayload) => {
    const {name, key, value, accountNumber} = payload;
    const isSettingsUpdate = name === 'state' && key === 'settings';
    if(!isSettingsUpdate && accountNumber !== getCurrentAccount()) return;

    this.processMirrorTaskMap[name]?.(payload);
    if(!payload.hasOwnProperty('key')) {
      this.mirrors[name] = value;
      return;
    }

    const mirror = this.mirrors[name] ??= {} as any;
    setDeepProperty(mirror, key, value, true);
  };

  public async setInterval(callback: () => void, ms: number) {
    const intervalId = await this.invoke('setInterval', ms);
    this.intervals.set(intervalId, callback);
    return intervalId;
  }

  public async clearInterval(intervalId: number) {
    this.intervals.delete(intervalId);
    await this.invoke('clearInterval', intervalId);
  }
}

interface ApiManagerProxy extends MTProtoMessagePort<true> {}

const apiManagerProxy = new ApiManagerProxy();
MOUNT_CLASS_TO.apiManagerProxy = apiManagerProxy;
export default apiManagerProxy;
