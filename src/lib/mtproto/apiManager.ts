import AppStorage from '../storage';

import MTPNetworker, { MTMessage } from './networker';
import { isObject } from './bin_utils';
import networkerFactory from './networkerFactory';
//import { telegramMeWebService } from './mtproto';
import authorizer from './authorizer';
import {App, Modes, MOUNT_CLASS_TO} from './mtproto_config';
import dcConfigurator, { ConnectionType, TransportType } from './dcConfigurator';
import { logger } from '../logger';
import type { InvokeApiOptions } from '../../types';
import type { MethodDeclMap } from '../../layer';
import { CancellablePromise, deferredPromise } from '../../helpers/cancellablePromise';
import { bytesFromHex, bytesToHex } from '../../helpers/bytes';
//import { clamp } from '../../helpers/number';

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
  public cachedNetworkers: {
    [transportType in TransportType]: {
      [connectionType in ConnectionType]: {
        [dcId: number]: MTPNetworker[]
      }
    }
  } = {} as any;
  
  public cachedExportPromise: {[x: number]: Promise<unknown>} = {};
  private gettingNetworkers: {[dcIdAndType: string]: Promise<MTPNetworker>} = {};
  public baseDcId = 0;
  
  //public telegramMeNotified = false;

  private log: ReturnType<typeof logger> = logger('API');

  private afterMessageTempIds: {[tempId: string]: string} = {};

  //private lol = false;
  
  constructor() {
    //MtpSingleInstanceService.start();
    
    /* AppStorage.get<number>('dc').then((dcId) => {
      if(dcId) {
        this.baseDcId = dcId;
      }
    }); */
  }
  
  /* public telegramMeNotify(newValue: boolean) {
    if(this.telegramMeNotified !== newValue) {
      this.telegramMeNotified = newValue;
      //telegramMeWebService.setAuthorized(this.telegramMeNotified);
    }
  } */
  
  // mtpSetUserAuth
  public setUserAuth(userId: number) {
    AppStorage.set({
      user_auth: userId
    });
    
    //this.telegramMeNotify(true);

    /// #if !MTPROTO_WORKER
    rootScope.broadcast('user_auth', userId);
    /// #endif
  }

  public setBaseDcId(dcId: number) {
    this.baseDcId = dcId;

    AppStorage.set({
      dc: this.baseDcId
    });
  }
  
  // mtpLogOut
  public async logOut() {
    let storageKeys: Array<string> = [];
    
    let prefix = Modes.test ? 't_dc' : 'dc';
    
    for(let dcId = 1; dcId <= 5; dcId++) {
      storageKeys.push(prefix + dcId + '_auth_key');
      //storageKeys.push(prefix + dcId + '_auth_keyId');
    }
    
    // WebPushApiManager.forceUnsubscribe(); // WARNING
    let storageResult = await AppStorage.get<string[]|boolean[]>(...storageKeys);
    
    let logoutPromises = [];
    for(let i = 0; i < storageResult.length; i++) {
      if(storageResult[i]) {
        logoutPromises.push(this.invokeApi('auth.logOut', {}, {dcId: i + 1, ignoreErrors: true}));
      }
    }

    const clear = () => {
      //console.error('apiManager: logOut clear');
      
      this.baseDcId = 0;
      //this.telegramMeNotify(false);
      const promise = AppStorage.clear();
      promise.finally(() => {
        self.postMessage({type: 'reload'});
      });
    };

    setTimeout(clear, 1e3);

    //return;
    
    return Promise.all(logoutPromises).then(() => {
    }, (error) => {
      error.handled = true;
    }).finally(clear)/* .then(() => {
      location.pathname = '/';
    }) */;
  }
  
  // mtpGetNetworker
  public getNetworker(dcId: number, options: InvokeApiOptions = {}): Promise<MTPNetworker> {
    const connectionType: ConnectionType = options.fileDownload ? 'download' : (options.fileUpload ? 'upload' : 'client');
    //const connectionType: ConnectionType = 'client';

    /// #if MTPROTO_HTTP_UPLOAD
    // @ts-ignore
    const transportType: TransportType = connectionType == 'upload' ? 'https' : 'websocket';
    //const transportType: TransportType = connectionType != 'client' ? 'https' : 'websocket';
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
    if(networkers.length >= /* 1 */(connectionType !== 'download' ? 1 : 3)) {
      const networker = networkers.pop();
      networkers.unshift(networker);
      return Promise.resolve(networker);
    }
    
    const getKey = [dcId, transportType, connectionType].join('-');
    if(this.gettingNetworkers[getKey]) {
      return this.gettingNetworkers[getKey];
    }

    const ak = 'dc' + dcId + '_auth_key';
    const akId = 'dc' + dcId + '_auth_keyId';
    const ss = 'dc' + dcId + '_server_salt';
    
    return this.gettingNetworkers[getKey] = AppStorage.get<string[]>(ak, akId, ss)
    .then(async([authKeyHex, authKeyIdHex, serverSaltHex]) => {
      const transport = dcConfigurator.chooseServer(dcId, connectionType, transportType, false);
      let networker: MTPNetworker;
      if(authKeyHex && authKeyHex.length == 512) {
        if(!serverSaltHex || serverSaltHex.length != 16) {
          serverSaltHex = 'AAAAAAAAAAAAAAAA';
        }
        
        const authKey = bytesFromHex(authKeyHex);
        const authKeyId = new Uint8Array(bytesFromHex(authKeyIdHex));
        const serverSalt = bytesFromHex(serverSaltHex);
        
        networker = networkerFactory.getNetworker(dcId, authKey, authKeyId, serverSalt, transport, options);
      } else {
        try { // if no saved state
          const auth = await authorizer.auth(dcId);
  
          const storeObj = {
            [ak]: bytesToHex(auth.authKey),
            [akId]: auth.authKeyId.hex,
            [ss]: bytesToHex(auth.serverSalt)
          };
          
          AppStorage.set(storeObj);
          
          networker = networkerFactory.getNetworker(dcId, auth.authKey, auth.authKeyId, auth.serverSalt, transport, options);
        } catch(error) {
          this.log('Get networker error', error, error.stack);
          delete this.gettingNetworkers[getKey];
          throw error;
        }
      }

      /* networker.onConnectionStatusChange = (online) => {
        console.log('status:', online);
      }; */

      delete this.gettingNetworkers[getKey];
      networkers.unshift(networker);
      return networker;
    });
  }
  
  // mtpInvokeApi
  public invokeApi<T extends keyof MethodDeclMap>(method: T, params: MethodDeclMap[T]['req'] = {}, options: InvokeApiOptions = {}): CancellablePromise<MethodDeclMap[T]["res"]> {
    ///////this.log('Invoke api', method, params, options);

    /* if(!this.lol) {
      networkerFactory.updatesProcessor({_: 'new_session_created'}, true);
      this.lol = true;
    } */

    const deferred = deferredPromise<MethodDeclMap[T]['res']>();

    let afterMessageIdTemp = options.afterMessageId;
    if(afterMessageIdTemp) {
      deferred.finally(() => {
        delete this.afterMessageTempIds[afterMessageIdTemp];
      });
    }

    if(MOUNT_CLASS_TO) {
      deferred.finally(() => {
        clearInterval(interval);
      });
  
      const startTime = Date.now();
      const interval = MOUNT_CLASS_TO.setInterval(() => {
        this.log.error('Request is still processing:', method, params, options, 'time:', (Date.now() - startTime) / 1000);
        //this.cachedUploadNetworkers[2].requestMessageStatus();
      }, 5e3);
    }

    const rejectPromise = (error: ApiError) => {
      if(!error) {
        error = {type: 'ERROR_EMPTY'};
      } else if(!isObject(error)) {
        error = {message: error};
      }
      
      deferred.reject(error);

      if(error.code == 401 && error.type == 'SESSION_REVOKED') {
        this.logOut();
      }

      if(options.ignoreErrors) {
        return;
      }
      
      if(error.code == 406) {
        error.handled = true;
      }
      
      if(!options.noErrorBox) {
        error.input = method;
        error.stack = stack || (error.originalError && error.originalError.stack) || error.stack || (new Error()).stack;
        setTimeout(() => {
          if(!error.handled) {
            if(error.code == 401) {
              this.logOut();
            } else {
              // ErrorService.show({error: error}); // WARNING
            }
            
            error.handled = true;
          }
        }, 100);
      }
    };
    
    let dcId: number;
    
    let cachedNetworker: MTPNetworker;
    let stack = (new Error()).stack || 'empty stack';
    const performRequest = (networker: MTPNetworker) => {
      if(afterMessageIdTemp) {
        options.afterMessageId = this.afterMessageTempIds[afterMessageIdTemp];
      }
      const promise = (cachedNetworker = networker).wrapApiCall(method, params, options);
      if(options.prepareTempMessageId) {
        this.afterMessageTempIds[options.prepareTempMessageId] = (options as MTMessage).messageId;
      }

      return promise.then(deferred.resolve, (error: ApiError) => {
        //if(!options.ignoreErrors) {
        if(error.type != 'FILE_REFERENCE_EXPIRED' && error.type !== 'MSG_WAIT_FAILED') {
          this.log.error('Error', error.code, error.type, this.baseDcId, dcId, method, params);
        }
        
        if(error.code == 401 && this.baseDcId == dcId) {
          if(error.type != 'SESSION_PASSWORD_NEEDED') {
            AppStorage.remove('dc', 'user_auth'); // ! возможно тут вообще не нужно это делать, но нужно проверить случай с USER_DEACTIVATED (https://core.telegram.org/api/errors)
            //this.telegramMeNotify(false);
          }
          
          rejectPromise(error);
        } else if(error.code == 401 && this.baseDcId && dcId != this.baseDcId) {
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
        } else if(error.code == 303) {
          const newDcId = +error.type.match(/^(PHONE_MIGRATE_|NETWORK_MIGRATE_|USER_MIGRATE_)(\d+)/)[2];
          if(newDcId != dcId) {
            if(options.dcId) {
              options.dcId = newDcId;
            } else {
              this.setBaseDcId(newDcId);
            }
            
            this.getNetworker(newDcId, options).then((networker) => {
              networker.wrapApiCall(method, params, options).then(deferred.resolve, rejectPromise);
            }, rejectPromise);
          }
        } else if(!options.rawError && error.code == 420) {
          const waitTime = +error.type.match(/^FLOOD_WAIT_(\d+)/)[1] || 10;
          
          if(waitTime > (options.floodMaxTimeout !== undefined ? options.floodMaxTimeout : 60)) {
            return rejectPromise(error);
          }
          
          setTimeout(() => {
            performRequest(cachedNetworker);
          }, waitTime/* (waitTime + 5) */ * 1000); // 03.02.2020
        } else if(!options.rawError && error.code == 500) {
          if(error.type === 'MSG_WAIT_FAILED') {
            afterMessageIdTemp = undefined;
            delete options.afterMessageId;
            delete this.afterMessageTempIds[options.prepareTempMessageId];
            performRequest(cachedNetworker);
            return;
          }

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
        } else {
          rejectPromise(error);
        }
      });
    }
    
    if(dcId = (options.dcId || this.baseDcId)) {
      this.getNetworker(dcId, options).then(performRequest, rejectPromise);
    } else {
      AppStorage.get<number>('dc').then((baseDcId) => {
        this.getNetworker(this.baseDcId = dcId = baseDcId || App.baseDcId, options).then(performRequest, rejectPromise);
      });
    }

    return deferred;
  }
}

const apiManager = new ApiManager();
MOUNT_CLASS_TO && (MOUNT_CLASS_TO.apiManager = apiManager);
export default apiManager;
