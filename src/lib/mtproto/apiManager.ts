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

import type {UserAuth} from './mtproto_config';
import type {DcAuthKey, DcId, DcServerSalt, InvokeApiOptions, TrueDcId} from '../../types';
import type {MethodDeclMap} from '../../layer';
import type TcpObfuscated from './transports/tcpObfuscated';
import sessionStorage from '../sessionStorage';
import MTPNetworker, {MTMessage} from './networker';
import {ConnectionType, constructTelegramWebSocketUrl, DcConfigurator, TransportType} from './dcConfigurator';
import {logger} from '../logger';
import deferredPromise, {CancellablePromise} from '../../helpers/cancellablePromise';
import App from '../../config/app';
import {MOUNT_CLASS_TO} from '../../config/debug';
import {IDB} from '../files/idb';
import CryptoWorker from '../crypto/cryptoMessagePort';
import ctx from '../../environment/ctx';
import noop from '../../helpers/noop';
import Modes from '../../config/modes';
import bytesFromHex from '../../helpers/bytes/bytesFromHex';
import bytesToHex from '../../helpers/bytes/bytesToHex';
import isObject from '../../helpers/object/isObject';
import pause from '../../helpers/schedulers/pause';
import ApiManagerMethods from './api_methods';
import {getEnvironment} from '../../environment/utils';
import tsNow from '../../helpers/tsNow';
import transportController from './transports/controller';
import MTTransport from './transports/transport';
import AccountController from '../accounts/accountController';
import {AppStoragesManager} from '../appManagers/appStoragesManager';
import commonStateStorage from '../commonStateStorage';
import CacheStorageController from '../files/cacheStorage';
import {ActiveAccountNumber} from '../accounts/types';
import makeError from '../../helpers/makeError';
import EncryptedStorageLayer from '../encryptedStorageLayer';
import {getCommonDatabaseState} from '../../config/databases/state';
import EncryptionKeyStore from '../passcode/keyStore';
import DeferredIsUsingPasscode from '../passcode/deferredIsUsingPasscode';
/**
 * To not be used in an ApiManager instance as there is no account number attached to it
 */
import globalRootScope from '../rootScope';

/* class RotatableArray<T> {
  public array: Array<T> = [];
  private lastIndex = -1;

  public get() {
    this.lastIndex = clamp(this.lastIndex + 1, 0, this.array.length - 1);
    return this.array[this.lastIndex];
  }
} */

const PREMIUM_FILE_NETWORKERS_COUNT = 6;
const REGULAR_FILE_NETWORKERS_COUNT = 3;
const DESTROY_NETWORKERS = true;

export class ApiManager extends ApiManagerMethods {
  private cachedNetworkers: {
    [transportType in TransportType]: {
      [connectionType in ConnectionType]: {
        [dcId: DcId]: MTPNetworker[]
      }
    }
  };

  private cachedExportPromise: {[x: number]: Promise<unknown>};
  private gettingNetworkers: {[dcIdAndType: string]: Promise<MTPNetworker>};
  private baseDcId: DcId;

  // public telegramMeNotified = false;

  private log: ReturnType<typeof logger>;

  private afterMessageTempIds: {
    [tempId: string]: {
      messageId: string,
      promise: Promise<any>
    }
  };

  private transportType: TransportType;

  private updatesProcessor: (obj: any) => void;

  private loggingOut: boolean;

  constructor() {
    super();
    this.log = logger('API');

    this.cachedNetworkers = {} as any;
    this.cachedExportPromise = {};
    this.gettingNetworkers = {};
    this.baseDcId = 0;
    this.afterMessageTempIds = {};

    this.transportType = Modes.transport;

    if(import.meta.env.VITE_MTPROTO_AUTO && Modes.multipleTransports) {
      transportController.addEventListener('transport', (transportType) => {
        this.changeTransportType(transportType);
      });
    }

    // * Make sure that the used autologin_token is no more than 10000 seconds old
    // * https://core.telegram.org/api/url-authorization
    const REFRESH_CONFIG_INTERVAL = (10000 - 30) * 1000;
    setInterval(() => {
      this.getConfig(true);
    }, REFRESH_CONFIG_INTERVAL);
  }

  protected after() {
    const result = super.after();

    this.apiUpdatesManager.addMultipleEventsListeners({
      updateConfig: () => {
        this.getConfig(true);
        this.getAppConfig(true);
      }
    });

    this.rootScope.addEventListener('user_auth', () => {
      if(this.config) { // refresh configs if had a config during authorization
        this.apiUpdatesManager.processLocalUpdate({_: 'updateConfig'});
      }
    });

    this.rootScope.addEventListener('premium_toggle', (isPremium) => {
      this.iterateNetworkers(({networker, connectionType, dcId, transportType}) => {
        if(connectionType === 'client' || transportType !== 'websocket') {
          return;
        }

        const transport = networker.transport;
        if(!transport) {
          this.log.error('wow what, no transport?', networker);
          return;
        }

        if((transport as TcpObfuscated).connection) {
          const url = constructTelegramWebSocketUrl(dcId, connectionType, isPremium);
          (transport as TcpObfuscated).changeUrl(url);
        }
      });
    });

    return result;
  }

  // private lol = false;

  // constructor() {
  // MtpSingleInstanceService.start();

  /* AppStorage.get<number>('dc').then((dcId) => {
      if(dcId) {
        this.baseDcId = dcId;
      }
    }); */
  // }

  /* public telegramMeNotify(newValue: boolean) {
    if(this.telegramMeNotified !== newValue) {
      this.telegramMeNotified = newValue;
      //telegramMeWebService.setAuthorized(this.telegramMeNotified);
    }
  } */

  private getTransportType(connectionType: ConnectionType) {
    let transportType: TransportType;
    if(import.meta.env.VITE_MTPROTO_HTTP_UPLOAD) {
      transportType = connectionType === 'upload' && getEnvironment().IS_SAFARI ? 'https' : 'websocket';
      // const transportType: TransportType = connectionType !== 'client' ? 'https' : 'websocket';
    } else {
      transportType = this.transportType;
    }

    return transportType;
  }

  private iterateNetworkers(callback: (o: {networker: MTPNetworker, dcId: DcId, connectionType: ConnectionType, transportType: TransportType, index: number, array: MTPNetworker[]}) => void) {
    for(const transportType in this.cachedNetworkers) {
      const connections = this.cachedNetworkers[transportType as TransportType];
      for(const connectionType in connections) {
        const dcs = connections[connectionType as ConnectionType];
        for(const dcId in dcs) {
          const networkers = dcs[dcId as any as DcId];
          networkers.forEach((networker, idx, arr) => {
            callback({
              networker,
              dcId: +dcId as DcId,
              connectionType: connectionType as ConnectionType,
              transportType: transportType as TransportType,
              index: idx,
              array: arr
            });
          });
        }
      }
    }
  }

  private chooseServer(dcId: DcId, connectionType: ConnectionType, transportType: TransportType) {
    return this.dcConfigurator.chooseServer(dcId, connectionType, transportType, connectionType === 'client', this.rootScope.premium);
  }

  public changeTransportType(transportType: TransportType) {
    const oldTransportType = this.transportType;
    if(oldTransportType === transportType) {
      return;
    }

    this.log('changing transport from', oldTransportType, 'to', transportType);

    const oldObject = this.cachedNetworkers[oldTransportType];
    const newObject = this.cachedNetworkers[transportType];
    this.cachedNetworkers[transportType] = oldObject;
    this.cachedNetworkers[oldTransportType] = newObject;

    this.transportType = transportType;

    for(const oldGetKey in this.gettingNetworkers) {
      const promise = this.gettingNetworkers[oldGetKey];
      delete this.gettingNetworkers[oldGetKey];

      const newGetKey = oldGetKey.replace(oldTransportType, transportType);
      this.gettingNetworkers[newGetKey] = promise;

      this.log('changed networker getKey from', oldGetKey, 'to', newGetKey)
    }

    this.iterateNetworkers((info) => {
      const transportType = this.getTransportType(info.connectionType);
      const transport = this.chooseServer(info.dcId, info.connectionType, transportType);
      this.changeNetworkerTransport(info.networker, transport);
    });
  }

  public async getBaseDcId() {
    if(this.baseDcId) {
      return this.baseDcId;
    }

    const accountData = await AccountController.get(this.getAccountNumber());
    const baseDcId = accountData?.dcId;
    if(!this.baseDcId) {
      if(!baseDcId) {
        this.setBaseDcId(App.baseDcId);
      } else {
        this.baseDcId = baseDcId;
      }
    }

    return this.baseDcId;
  }

  public async setUserAuth(userAuth: UserAuth | UserId) {
    if(typeof(userAuth) === 'string' || typeof(userAuth) === 'number') {
      userAuth = {dcID: 0, date: tsNow(true), id: userAuth.toPeerId(false)};
    }

    this.rootScope.dispatchEvent('user_auth', userAuth);

    if(!userAuth.dcID) {
      const baseDcId = await this.getBaseDcId();
      userAuth.dcID = baseDcId;
    }

    AccountController.update(this.getAccountNumber(), {
      date:  (userAuth as UserAuth).date,
      userId: (userAuth as UserAuth).id,
      dcId: (userAuth as UserAuth).dcID as TrueDcId
    });

    // this.telegramMeNotify(true);
  }

  public setBaseDcId(dcId: DcId) {
    const wasDcId = this.baseDcId;
    if(wasDcId) { // if migrated set ondrain
      this.getNetworker(wasDcId).then((networker) => {
        this.setOnDrainIfNeeded(networker);
      });
    }

    this.baseDcId = dcId;

    AccountController.update(this.getAccountNumber(), {
      dcId: this.baseDcId as TrueDcId
    });
  }

  public async logOut(migrateAccountTo?: ActiveAccountNumber) {
    if(this.loggingOut) {
      return;
    }

    this.loggingOut = true;

    const totalAccounts = await AccountController.getTotalAccounts();
    const accountNumber = this.getAccountNumber();
    const accountData = await AccountController.get(accountNumber);

    const logoutPromises: Promise<any>[] = [];

    for(let dcId = 1; dcId <= 5; dcId++) {
      const key = `dc${dcId as TrueDcId}_auth_key` as const;
      if(accountData?.[key]) {
        logoutPromises.push(this.invokeApi('auth.logOut', {}, {dcId, ignoreErrors: true}));
      }
    }

    let wasCleared = false; // Prevent double logout 2 accounts in a row
    const clear = async() => {
      if(wasCleared) return;
      wasCleared = true;

      this.baseDcId = undefined;
      // this.telegramMeNotify(false);
      if(totalAccounts === 1 && accountNumber === 1 && !migrateAccountTo) {
        await Promise.all([
          (async() => {
            const keys: Parameters<typeof sessionStorage['delete']>[0][] = [
              'account1',
              'dc',
              'server_time_offset',
              'xt_instance',
              'user_auth',
              // 'state_id',
              'k_build',
              'auth_key_fingerprint'
            ];
            for(let i = 1; i <= 5; ++i) {
              keys.push(`dc${i as TrueDcId}_server_salt`);
              keys.push(`dc${i as TrueDcId}_auth_key`);
              keys.push(`dc${i as TrueDcId}_hash`); // only for WebA
            }

            return Promise.all(keys.map((key) => sessionStorage.delete(key)));
          })(),
          AppStoragesManager.clearAllStoresForAccount(1),
          AppStoragesManager.clearSessionStores(),
          commonStateStorage.clear(),
          EncryptedStorageLayer.getInstance(getCommonDatabaseState(), 'localStorage__encrypted').clear(),
          CacheStorageController.deleteAllStorages()
        ]);
      } else {
        await AccountController.shiftAccounts(accountNumber);
        await AppStoragesManager.shiftStorages(accountNumber);

        if(await DeferredIsUsingPasscode.isUsingPasscode()) {
          // Keep the screen unlocked even if the user logs out
          await sessionStorage.set({
            encryption_key: await EncryptionKeyStore.getAsBase64()
          });
        }
      }
      IDB.closeDatabases();
      this.rootScope.dispatchEvent('logging_out', {accountNumber, migrateTo: migrateAccountTo});
    };

    setTimeout(clear, 1e3);

    // return;

    return Promise.all(logoutPromises).catch((error) => {
      error.handled = true;
    }).finally(clear)/* .then(() => {
      location.pathname = '/';
    }) */;
  }

  public static async forceLogOutAll() {
    const clearAllStoresPromises = ([1, 2, 3, 4] as ActiveAccountNumber[])
    .map(accountNumber => AppStoragesManager.clearAllStoresForAccount(accountNumber));

    await Promise.all([
      sessionStorage.localStorageProxy('clear'),
      commonStateStorage.clear(),
      EncryptedStorageLayer.getInstance(getCommonDatabaseState(), 'localStorage__encrypted').clear(),
      ...clearAllStoresPromises,
      CacheStorageController.deleteAllStorages()
    ]);

    IDB.closeDatabases();
    globalRootScope.dispatchEvent('logging_out', {});
  }

  private generateNetworkerGetKey(dcId: DcId, transportType: TransportType, connectionType: ConnectionType) {
    return [dcId, transportType, connectionType].join('-');
  }

  public getNetworker(dcId: DcId, options: InvokeApiOptions = {}): Promise<MTPNetworker> {
    const connectionType: ConnectionType = options.fileDownload ? 'download' : (options.fileUpload ? 'upload' : 'client');
    // const connectionType: ConnectionType = 'client';

    const transportType = this.getTransportType(connectionType);
    if(!this.cachedNetworkers[transportType]) {
      this.cachedNetworkers[transportType] = {
        client: {},
        download: {},
        upload: {}
      };
    }

    const cache = this.cachedNetworkers[transportType][connectionType];
    if(!(dcId in cache)) {
      cache[dcId] = [];
    }

    const networkers = cache[dcId];
    // @ts-ignore
    const maxNetworkers = connectionType === 'client' || transportType === 'https' ? 1 : (this.rootScope.premium ? PREMIUM_FILE_NETWORKERS_COUNT : REGULAR_FILE_NETWORKERS_COUNT);
    if(networkers.length >= maxNetworkers) {
      let networker = networkers[0];
      if(maxNetworkers > 1) {
        let foundRequests = Infinity, foundNetworker: MTPNetworker, foundIndex: number;
        for(let i = maxNetworkers - 1; i >= 0; --i) {
          const networker = networkers[i];
          const {activeRequests, isOnline} = networker;
          if(activeRequests < foundRequests && isOnline) {
            foundRequests = foundRequests;
            foundNetworker = networker;
            foundIndex = i;
          }
        }

        if(foundNetworker) {
          networker = foundNetworker;
        } else {
          foundIndex = maxNetworkers - 1;
        }

        if(foundIndex) {
          networkers.unshift(networker = networkers.splice(foundIndex, 1)[0]);
        }
      }

      return Promise.resolve(networker);
    }

    let getKey = this.generateNetworkerGetKey(dcId, transportType, connectionType);
    if(this.gettingNetworkers[getKey]) {
      return this.gettingNetworkers[getKey];
    }

    const ak: DcAuthKey = `dc${dcId}_auth_key` as any;
    const ss: DcServerSalt = `dc${dcId}_server_salt` as any;

    let transport = this.chooseServer(dcId, connectionType, transportType);
    return this.gettingNetworkers[getKey] = AccountController.get(this.getAccountNumber()).then((accountData) => [accountData?.[ak], accountData?.[ss]] as const)
    .then(async([authKeyHex, serverSaltHex]) => {
      let networker: MTPNetworker, error: any;
      if(authKeyHex?.length === 512) {
        if(serverSaltHex?.length !== 16) {
          serverSaltHex = 'AAAAAAAAAAAAAAAA';
        }

        const authKey = bytesFromHex(authKeyHex);
        const authKeyId = (await CryptoWorker.invokeCrypto('sha1', authKey)).slice(-8);
        const serverSalt = bytesFromHex(serverSaltHex);

        networker = this.networkerFactory.getNetworker(dcId, authKey, authKeyId, serverSalt, options);
      } else {
        try { // if no saved state
          const auth = await this.authorizer.auth(dcId);

          authKeyHex = bytesToHex(auth.authKey);
          serverSaltHex = bytesToHex(auth.serverSalt);

          AccountController.update(this.getAccountNumber(), {
            [ak]: authKeyHex,
            [ss]: serverSaltHex
          });

          networker = this.networkerFactory.getNetworker(dcId, auth.authKey, auth.authKeyId, auth.serverSalt, options);
        } catch(_error) {
          error = _error;
        }
      }

      // ! cannot get it before this promise because simultaneous changeTransport will change nothing
      const newTransportType = this.getTransportType(connectionType);
      if(newTransportType !== transportType) {
        getKey = this.generateNetworkerGetKey(dcId, newTransportType, connectionType);
        transport.destroy();
        DcConfigurator.removeTransport(this.dcConfigurator.chosenServers, transport);

        if(networker) {
          transport = this.chooseServer(dcId, connectionType, newTransportType);
        }

        this.log('transport has been changed during authorization from', transportType, 'to', newTransportType);
      }

      /* networker.onConnectionStatusChange = (online) => {
        console.log('status:', online);
      }; */

      delete this.gettingNetworkers[getKey];

      if(error) {
        this.log('get networker error', error, (error as Error).stack);
        throw error;
      }

      this.changeNetworkerTransport(networker, transport);
      networkers.unshift(networker);
      this.setOnDrainIfNeeded(networker);
      return networker;
    });
  }

  public getNetworkerVoid(dcId: DcId) {
    return this.getNetworker(dcId).then(noop, noop);
  }

  private changeNetworkerTransport(networker: MTPNetworker, transport?: MTTransport) {
    const oldTransport = networker.transport;
    if(oldTransport) {
      DcConfigurator.removeTransport(this.dcConfigurator.chosenServers, oldTransport);
    }

    networker.changeTransport(transport);
  }

  private onNetworkerDrain(networker: MTPNetworker) {
    this.log('networker drain', networker.dcId);
    networker.onDrain = undefined;
    this.changeNetworkerTransport(networker);
    networker.destroy();
    this.networkerFactory.removeNetworker(networker);
    DcConfigurator.removeTransport(this.cachedNetworkers, networker);
  }

  public setOnDrainIfNeeded(networker: MTPNetworker) {
    if(!DESTROY_NETWORKERS || networker.onDrain) {
      return;
    }

    const checkPromise: Promise<boolean> = networker.isFileNetworker ?
      Promise.resolve(true) :
      this.getBaseDcId().then((baseDcId) => networker.dcId !== baseDcId);
    checkPromise.then((canRelease) => {
      if(networker.onDrain) {
        return;
      }

      if(canRelease) {
        networker.onDrain = () => this.onNetworkerDrain(networker);
        networker.setDrainTimeout();
      }
    });
  }

  public setUpdatesProcessor(callback: (obj: any) => void) {
    this.updatesProcessor = callback;
    this.networkerFactory.setUpdatesProcessor(callback);
  }

  public invokeApi<T extends keyof MethodDeclMap>(method: T, params: MethodDeclMap[T]['req'] = {}, options: InvokeApiOptions = {}): CancellablePromise<MethodDeclMap[T]['res']> {
    // /////this.log('Invoke api', method, params, options);

    /* if(!this.lol) {
      networkerFactory.updatesProcessor({_: 'new_session_created'}, true);
      this.lol = true;
    } */

    const deferred = deferredPromise<MethodDeclMap[T]['res']>();

    let {afterMessageId, prepareTempMessageId} = options;
    if(prepareTempMessageId) {
      deferred.then(() => {
        delete this.afterMessageTempIds[prepareTempMessageId];
      });
    }

    if(MOUNT_CLASS_TO) {
      const startTime = Date.now();
      const interval = ctx.setInterval(() => {
        if(!cachedNetworker || !cachedNetworker.isStopped()) {
          this.log.error('Request is still processing:', method, params, options, 'time:', (Date.now() - startTime) / 1000);
        }
        // this.cachedUploadNetworkers[2].requestMessageStatus();
      }, 5e3);

      deferred.catch(noop).finally(() => {
        clearInterval(interval);
      });
    }

    const rejectPromise = async(error: ApiError) => {
      if(!error) {
        error = makeError('ERROR_EMPTY');
      } else if(!isObject(error)) {
        error = makeError(undefined, error);
      }

      if((error.code === 401 && error.type === 'SESSION_REVOKED') ||
        (error.code === 406 && error.type === 'AUTH_KEY_DUPLICATED')) {
        this.logOut();
      }

      if(options.ignoreErrors) {
        throw error;
      }

      if(error.code === 406) {
        error.handled = true;
      }

      if(!options.noErrorBox) {
        // error.stack = stack || (error.originalError && error.originalError.stack) || error.stack || (new Error()).stack;
        setTimeout(() => {
          if(!error.handled) {
            if(error.code === 401) {
              this.logOut();
            } else {
              // ErrorService.show({error: error}); // WARNING
            }

            error.handled = true;
          }
        }, 100);
      }

      throw error;
    };

    let dcId: DcId;

    let cachedNetworker: MTPNetworker;
    // const stack = (new Error()).stack || 'empty stack';
    const performRequest = (): Promise<any> => {
      if(afterMessageId) {
        const after = this.afterMessageTempIds[afterMessageId];
        if(after) {
          options.afterMessageId = after.messageId;
        }
      }

      const promise = cachedNetworker.wrapApiCall(method, params, options);

      if(prepareTempMessageId) {
        this.afterMessageTempIds[prepareTempMessageId] = {
          messageId: (options as MTMessage).messageId,
          promise: deferred
        };
      }

      return promise.catch((error: ApiError) => {
        // if(!options.ignoreErrors) {
        if(error.type !== 'FILE_REFERENCE_EXPIRED' && error.type !== 'FILE_REFERENCE_INVALID'/*  && error.type !== 'MSG_WAIT_FAILED' */) {
          this.log.error('Error', error.code, error.type, this.baseDcId, dcId, method, params);
        }

        if(error.code === 401 && this.baseDcId === dcId) {
          if(error.type !== 'SESSION_PASSWORD_NEEDED') {
            AccountController.update(this.getAccountNumber(), {
              dcId: undefined
            });
          }
          throw error;
        } else if(error.code === 401 && this.baseDcId && dcId !== this.baseDcId) {
          if(this.cachedExportPromise[dcId] === undefined) {
            const promise = new Promise((exportResolve, exportReject) => {
              this.invokeApi('auth.exportAuthorization', {dc_id: dcId}, {noErrorBox: true}).then((exportedAuth) => {
                this.invokeApi('auth.importAuthorization', {
                  id: exportedAuth.id,
                  bytes: exportedAuth.bytes
                }, {dcId, noErrorBox: true}).then(exportResolve, exportReject);
              }, exportReject);
            });

            this.cachedExportPromise[dcId] = promise;
          }

          return this.cachedExportPromise[dcId].then(() => performRequest());
        } else if(error.code === 303) {
          const newDcId = +error.type.match(/^(PHONE_MIGRATE_|NETWORK_MIGRATE_|USER_MIGRATE_|STATS_MIGRATE_)(\d+)/)[2] as DcId;
          if(newDcId !== dcId) {
            if(options.dcId) {
              options.dcId = newDcId;
            } else {
              this.setBaseDcId(newDcId);
            }

            return this.invokeApi(method, params, options);
          }
        } else if(error.code === 400 && error.type.indexOf('FILE_MIGRATE') === 0) {
          const newDcId = +error.type.match(/^(FILE_MIGRATE_)(\d+)/)[2] as DcId;
          if(newDcId !== dcId) {
            options.dcId = newDcId;
            return this.invokeApi(method, params, options);
          } else {
            throw error;
          }
        } else if(error.code === 400 && error.type === 'CONNECTION_NOT_INITED') {
          this.networkerFactory.unsetConnectionInited();
          return performRequest();
        } else if(!options.rawError && error.code === 420 && !error.type.includes('SLOWMODE_WAIT')) {
          const match = error.type.match(/^FLOOD_WAIT_(\d+)/) || error.type.match(/_(\d+)_?/);
          let waitTime: number;
          if(match) {
            waitTime = +match[1];
          }

          if(error.type.includes('FLOOD_PREMIUM_WAIT')) {
            Promise.all([
              this.getAppConfig(),
              this.appStateManager.getState()
            ]).then(([appConfig, state]) => {
              const timestamp = tsNow(true);
              const shouldShowToast = (timestamp - (state.shownUploadSpeedTimestamp || 0)) >= appConfig.upload_premium_speedup_notify_period;
              if(!shouldShowToast) {
                return;
              }

              this.appStateManager.pushToState('shownUploadSpeedTimestamp', timestamp);
              this.rootScope.dispatchEvent('file_speed_limited', {
                increaseTimes: (options.fileUpload ? appConfig.upload_premium_speedup_upload : appConfig.upload_premium_speedup_download) || 10,
                isUpload: !!options.fileUpload
              });
            });
          }

          waitTime ||= 1;

          if(waitTime > (options.floodMaxTimeout ?? 60) && !options.prepareTempMessageId) {
            throw error;
          }

          return pause(waitTime/* (waitTime + 5) */ * 1000).then(() => performRequest());
        } else if(!options.rawError && ['MSG_WAIT_FAILED', 'MSG_WAIT_TIMEOUT'].includes(error.type)) {
          const after = this.afterMessageTempIds[afterMessageId];

          afterMessageId = undefined;
          delete options.afterMessageId;

          if(after) return after.promise.then(() => performRequest());
          else return performRequest();
        } else if(!options.rawError && error.code === 500) {
          const now = Date.now();
          if(options.stopTime) {
            if(now >= options.stopTime) {
              throw error;
            }
          }

          options.waitTime = options.waitTime ? Math.min(60, options.waitTime * 1.5) : 1;
          return pause(options.waitTime * 1000).then(() => performRequest());
        } else if(error.type === 'UNKNOWN' || error.type === 'MTPROTO_CLUSTER_INVALID') { // cluster invalid - request from regular user to premium endpoint
          return pause(1000).then(() => performRequest());
        } else {
          throw error;
        }
      });
    }

    let p: Promise<MTPNetworker>;
    if(dcId = (options.dcId || this.baseDcId)) {
      p = this.getNetworker(dcId, options);
    } else {
      p = this.getBaseDcId().then((baseDcId) => this.getNetworker(dcId = baseDcId, options));
    }

    p.then((networker) => {
      cachedNetworker = networker;
      const promise = performRequest();
      cachedNetworker.attachPromise(deferred, options as MTMessage);
      return promise;
    })
    .then(deferred.resolve.bind(deferred))
    .catch(rejectPromise)
    .catch(deferred.reject.bind(deferred));

    return deferred;
  }
}
