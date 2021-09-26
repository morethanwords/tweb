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

import type { UserAuth } from './mtproto_config';
import sessionStorage from '../sessionStorage';
import MTPNetworker, { MTMessage } from './networker';
import { isObject } from './bin_utils';
import networkerFactory from './networkerFactory';
//import { telegramMeWebService } from './mtproto';
import authorizer from './authorizer';
import dcConfigurator, { ConnectionType, DcConfigurator, TransportType } from './dcConfigurator';
import { logger } from '../logger';
import type { DcAuthKey, DcId, DcServerSalt, InvokeApiOptions } from '../../types';
import type { MethodDeclMap } from '../../layer';
import { CancellablePromise, deferredPromise } from '../../helpers/cancellablePromise';
import { bytesFromHex, bytesToHex } from '../../helpers/bytes';
//import { clamp } from '../../helpers/number';
import { IS_SAFARI } from '../../environment/userAgent';
import App from '../../config/app';
import { MOUNT_CLASS_TO } from '../../config/debug';
import IDBStorage from '../idb';
import CryptoWorker from "../crypto/cryptoworker";
import ctx from '../../environment/ctx';

/// #if !MTPROTO_WORKER
import rootScope from '../rootScope';
/// #endif

/* var networker = apiManager.cachedNetworkers.websocket.upload[2];
networker.wrapMtpMessage({
  _: 'msgs_state_req',
  msg_ids: ["6888292542796810828"]
}, {
  notContentRelated: true
}).then(res => {
  console.log('status', res);
}); */

//console.error('apiManager included!');
// TODO: если запрос словил флуд, нужно сохранять его параметры и возвращать тот же промис на новый такой же запрос, например - загрузка истории

export type ApiError = Partial<{
  code: number,
  type: string,
  description: string,
  originalError: any,
  stack: string,
  handled: boolean,
  input: string,
  message: ApiError
}>;

/* class RotatableArray<T> {
  public array: Array<T> = [];
  private lastIndex = -1;

  public get() {
    this.lastIndex = clamp(this.lastIndex + 1, 0, this.array.length - 1);
    return this.array[this.lastIndex];
  }
} */

export class ApiManager {
  private cachedNetworkers: {
    [transportType in TransportType]: {
      [connectionType in ConnectionType]: {
        [dcId: number]: MTPNetworker[]
      }
    }
  } = {} as any;
  
  private cachedExportPromise: {[x: number]: Promise<unknown>} = {};
  private gettingNetworkers: {[dcIdAndType: string]: Promise<MTPNetworker>} = {};
  private baseDcId: DcId = 0 as DcId;
  
  //public telegramMeNotified = false;

  private log: ReturnType<typeof logger> = logger('API');

  private afterMessageTempIds: {
    [tempId: string]: {
      messageId: string,
      promise: Promise<any>
    }
  } = {};

  //private lol = false;
  
  // constructor() {
    //MtpSingleInstanceService.start();
    
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

  public async getBaseDcId() {
    if(this.baseDcId) {
      return this.baseDcId;
    }

    const baseDcId = await sessionStorage.get('dc');
    if(!this.baseDcId) {
      if(!baseDcId) {
        this.setBaseDcId(App.baseDcId);
      } else {
        this.baseDcId = baseDcId;
      }
    }

    return this.baseDcId;
  }
  
  public async setUserAuth(userAuth: UserAuth) {
    if(!userAuth.dcID) {
      const baseDcId = await this.getBaseDcId();
      userAuth.dcID = baseDcId;
    }

    sessionStorage.set({
      user_auth: userAuth
    });
    
    //this.telegramMeNotify(true);

    /// #if !MTPROTO_WORKER
    rootScope.dispatchEvent('user_auth', userAuth);
    /// #endif
  }

  public setBaseDcId(dcId: DcId) {
    const wasDcId = this.baseDcId;
    if(wasDcId) { // if migrated set ondrain
      this.getNetworker(wasDcId).then(networker => {
        this.setOnDrainIfNeeded(networker);
      });
    }

    this.baseDcId = dcId;

    sessionStorage.set({
      dc: this.baseDcId
    });
  }
  
  public async logOut() {
    const storageKeys: Array<DcAuthKey> = [];
    
    const prefix = 'dc';
    for(let dcId = 1; dcId <= 5; dcId++) {
      storageKeys.push(prefix + dcId + '_auth_key' as any);
    }
    
    // WebPushApiManager.forceUnsubscribe(); // WARNING // moved to worker's master
    const storageResult = await Promise.all(storageKeys.map(key => sessionStorage.get(key)));
    
    const logoutPromises: Promise<any>[] = [];
    for(let i = 0; i < storageResult.length; i++) {
      if(storageResult[i]) {
        logoutPromises.push(this.invokeApi('auth.logOut', {}, {dcId: (i + 1) as DcId, ignoreErrors: true}));
      }
    }

    const clear = () => {
      //console.error('apiManager: logOut clear');
      
      this.baseDcId = undefined;
      //this.telegramMeNotify(false);
      IDBStorage.closeDatabases();
      self.postMessage({type: 'clear'});
    };

    setTimeout(clear, 1e3);

    //return;
    
    return Promise.all(logoutPromises).catch((error) => {
      error.handled = true;
    }).finally(clear)/* .then(() => {
      location.pathname = '/';
    }) */;
  }
  
  public getNetworker(dcId: DcId, options: InvokeApiOptions = {}): Promise<MTPNetworker> {
    const connectionType: ConnectionType = options.fileDownload ? 'download' : (options.fileUpload ? 'upload' : 'client');
    //const connectionType: ConnectionType = 'client';

    /// #if MTPROTO_HTTP_UPLOAD
    // @ts-ignore
    const transportType: TransportType = connectionType === 'upload' && IS_SAFARI ? 'https' : 'websocket';
    //const transportType: TransportType = connectionType !== 'client' ? 'https' : 'websocket';
    /// #else
    // @ts-ignore
    const transportType = 'websocket';
    /// #endif

    if(!this.cachedNetworkers.hasOwnProperty(transportType)) {
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
    const maxNetworkers = connectionType === 'client' || transportType === 'https' ? 1 : (connectionType === 'download' ? 3 : 3);
    if(networkers.length >= maxNetworkers) {
      let i = networkers.length - 1, found = false;
      for(; i >= 0; --i) {
        if(networkers[i].isOnline) {
          found = true;
          break;
        }
      }
      
      const networker = found ? networkers.splice(i, 1)[0] : networkers.pop();
      networkers.unshift(networker);
      return Promise.resolve(networker);
    }
    
    const getKey = [dcId, transportType, connectionType].join('-');
    if(this.gettingNetworkers[getKey]) {
      return this.gettingNetworkers[getKey];
    }

    const ak: DcAuthKey = `dc${dcId}_auth_key` as any;
    const ss: DcServerSalt = `dc${dcId}_server_salt` as any;
    
    return this.gettingNetworkers[getKey] = Promise.all([ak, ss].map(key => sessionStorage.get(key)))
    .then(async([authKeyHex, serverSaltHex]) => {
      const transport = dcConfigurator.chooseServer(dcId, connectionType, transportType, connectionType === 'client');
      let networker: MTPNetworker;
      if(authKeyHex && authKeyHex.length === 512) {
        if(!serverSaltHex || serverSaltHex.length !== 16) {
          serverSaltHex = 'AAAAAAAAAAAAAAAA';
        }
        
        const authKey = bytesFromHex(authKeyHex);
        const authKeyId = (await CryptoWorker.invokeCrypto('sha1-hash', authKey)).slice(-8);
        const serverSalt = bytesFromHex(serverSaltHex);
        
        networker = networkerFactory.getNetworker(dcId, authKey, authKeyId, serverSalt, transport, options);
      } else {
        try { // if no saved state
          const auth = await authorizer.auth(dcId);
  
          const storeObj = {
            [ak]: bytesToHex(auth.authKey),
            [ss]: bytesToHex(auth.serverSalt)
          };
          
          sessionStorage.set(storeObj);
          
          networker = networkerFactory.getNetworker(dcId, auth.authKey, auth.authKeyId, auth.serverSalt, transport, options);
        } catch(error) {
          this.log('Get networker error', error, (error as Error).stack);
          delete this.gettingNetworkers[getKey];
          throw error;
        }
      }

      /* networker.onConnectionStatusChange = (online) => {
        console.log('status:', online);
      }; */
      
      delete this.gettingNetworkers[getKey];
      networkers.unshift(networker);
      this.setOnDrainIfNeeded(networker);
      return networker;
    });
  }

  public setOnDrainIfNeeded(networker: MTPNetworker) {
    if(networker.onDrain) {
      return;
    }
    
    const checkPromise: Promise<boolean> = networker.isFileNetworker ? 
      Promise.resolve(true) : 
      this.getBaseDcId().then(baseDcId => networker.dcId !== baseDcId);
    checkPromise.then(canRelease => {
      if(networker.onDrain) {
        return;
      }
      
      if(canRelease) {
        networker.onDrain = () => {
          this.log('networker drain', networker.dcId);

          networker.onDrain = undefined;
          networker.destroy();
          networkerFactory.removeNetworker(networker);
          DcConfigurator.removeTransport(this.cachedNetworkers, networker);
          DcConfigurator.removeTransport(dcConfigurator.chosenServers, networker.transport);
        };

        networker.setDrainTimeout();
      }
    });
  }
  
  public invokeApi<T extends keyof MethodDeclMap>(method: T, params: MethodDeclMap[T]['req'] = {}, options: InvokeApiOptions = {}): CancellablePromise<MethodDeclMap[T]["res"]> {
    ///////this.log('Invoke api', method, params, options);

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
        //this.cachedUploadNetworkers[2].requestMessageStatus();
      }, 5e3);

      deferred.finally(() => {
        clearInterval(interval);
      });
    }

    const rejectPromise = (error: ApiError) => {
      if(!error) {
        error = {type: 'ERROR_EMPTY'};
      } else if(!isObject(error)) {
        error = {message: error};
      }
      
      deferred.reject(error);

      if((error.code === 401 && error.type === 'SESSION_REVOKED') || 
        (error.code === 406 && error.type === 'AUTH_KEY_DUPLICATED')) {
        this.logOut();
      }

      if(options.ignoreErrors) {
        return;
      }
      
      if(error.code === 406) {
        error.handled = true;
      }
      
      if(!options.noErrorBox) {
        error.input = method;
        error.stack = stack || (error.originalError && error.originalError.stack) || error.stack || (new Error()).stack;
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
    };
    
    let dcId: DcId;
    
    let cachedNetworker: MTPNetworker;
    let stack = (new Error()).stack || 'empty stack';
    const performRequest = (networker: MTPNetworker) => {
      if(afterMessageId) {
        const after = this.afterMessageTempIds[afterMessageId];
        if(after) {
          options.afterMessageId = after.messageId;
        }
      }

      const promise = (cachedNetworker = networker).wrapApiCall(method, params, options);

      if(prepareTempMessageId) {
        this.afterMessageTempIds[prepareTempMessageId] = {
          messageId: (options as MTMessage).messageId,
          promise: deferred
        };
      }

      return promise.then(deferred.resolve, (error: ApiError) => {
        //if(!options.ignoreErrors) {
        if(error.type !== 'FILE_REFERENCE_EXPIRED'/*  && error.type !== 'MSG_WAIT_FAILED' */) {
          this.log.error('Error', error.code, error.type, this.baseDcId, dcId, method, params);
        }
        
        if(error.code === 401 && this.baseDcId === dcId) {
          if(error.type !== 'SESSION_PASSWORD_NEEDED') {
            sessionStorage.delete('dc')
            sessionStorage.delete('user_auth'); // ! возможно тут вообще не нужно это делать, но нужно проверить случай с USER_DEACTIVATED (https://core.telegram.org/api/errors)
            //this.telegramMeNotify(false);
          }
          
          rejectPromise(error);
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
          
          this.cachedExportPromise[dcId].then(() => {
            //(cachedNetworker = networker).wrapApiCall(method, params, options).then(deferred.resolve, rejectPromise);
            this.invokeApi(method, params, options).then(deferred.resolve, rejectPromise);
          }, rejectPromise);
        } else if(error.code === 303) {
          const newDcId = +error.type.match(/^(PHONE_MIGRATE_|NETWORK_MIGRATE_|USER_MIGRATE_)(\d+)/)[2] as DcId;
          if(newDcId !== dcId) {
            if(options.dcId) {
              options.dcId = newDcId;
            } else {
              this.setBaseDcId(newDcId);
            }
            
            this.getNetworker(newDcId, options).then((networker) => {
              networker.wrapApiCall(method, params, options).then(deferred.resolve, rejectPromise);
            }, rejectPromise);
          }
        } else if(error.code === 400 && error.type.indexOf('FILE_MIGRATE') === 0) {
          const newDcId = +error.type.match(/^(FILE_MIGRATE_)(\d+)/)[2] as DcId;
          if(newDcId !== dcId) {
            this.getNetworker(newDcId, options).then((networker) => {
              networker.wrapApiCall(method, params, options).then(deferred.resolve, rejectPromise);
            }, rejectPromise);
          } else {
            rejectPromise(error);
          }
        } else if(!options.rawError && error.code === 420) {
          const waitTime = +error.type.match(/^FLOOD_WAIT_(\d+)/)[1] || 1;
          
          if(waitTime > (options.floodMaxTimeout !== undefined ? options.floodMaxTimeout : 60) && !options.prepareTempMessageId) {
            return rejectPromise(error);
          }
          
          setTimeout(() => {
            performRequest(cachedNetworker);
          }, waitTime/* (waitTime + 5) */ * 1000); // 03.02.2020
        } else if(!options.rawError && ['MSG_WAIT_FAILED', 'MSG_WAIT_TIMEOUT'].includes(error.type)) {
          const after = this.afterMessageTempIds[afterMessageId];

          afterMessageId = undefined;
          delete options.afterMessageId;

          if(after) after.promise.then(() => performRequest(cachedNetworker));
          else performRequest(cachedNetworker);
        } else if(!options.rawError && error.code === 500) {
          const now = Date.now();
          if(options.stopTime) {
            if(now >= options.stopTime) {
              return rejectPromise(error);
            }
          }
          
          options.waitTime = options.waitTime ? Math.min(60, options.waitTime * 1.5) : 1;
          setTimeout(() => {
            performRequest(cachedNetworker);
          }, options.waitTime * 1000);
        } else if(error.type === 'UNKNOWN') {
          setTimeout(() => {
            performRequest(cachedNetworker);
          }, 1000);
        } else {
          rejectPromise(error);
        }
      });
    }
    
    if(dcId = (options.dcId || this.baseDcId)) {
      this.getNetworker(dcId, options).then(performRequest, rejectPromise);
    } else {
      this.getBaseDcId().then(baseDcId => {
        this.getNetworker(dcId = baseDcId, options).then(performRequest, rejectPromise);
      });
    }

    return deferred;
  }
}

const apiManager = new ApiManager();
MOUNT_CLASS_TO.apiManager = apiManager;
export default apiManager;
