import AppStorage from '../storage';

import { MTPNetworker } from './networker';
import { bytesFromHex, bytesToHex, isObject } from '../bin_utils';
import networkerFactory from './networkerFactory';
//import { telegramMeWebService } from './mtproto';
import authorizer from './authorizer';
import {App, Modes, MOUNT_CLASS_TO} from './mtproto_config';
import dcConfigurator from './dcConfigurator';
import { logger } from '../logger';
import type { InvokeApiOptions } from '../../types';
import type { MethodDeclMap } from '../../layer';
import { CancellablePromise, deferredPromise } from '../../helpers/cancellablePromise';

/// #if MTPROTO_HTTP
import HTTP from './transports/http';
/// #endif

/// #if !MTPROTO_WORKER
import $rootScope from '../rootScope';
/// #endif

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

export class ApiManager {
  public cachedNetworkers: {[x: number]: MTPNetworker} = {};
  public cachedUploadNetworkers: {[x: number]: MTPNetworker} = {};
  public cachedExportPromise: {[x: number]: Promise<unknown>} = {};
  private gettingNetworkers: {[dcIDAndType: string]: Promise<MTPNetworker>} = {};
  public baseDcID = 0;
  
  public telegramMeNotified = false;

  private log: ReturnType<typeof logger> = logger('API');
  
  constructor() {
    //MtpSingleInstanceService.start();
    
    /* AppStorage.get<number>('dc').then((dcID) => {
      if(dcID) {
        this.baseDcID = dcID;
      }
    }); */
  }
  
  public telegramMeNotify(newValue: boolean) {
    if(this.telegramMeNotified !== newValue) {
      this.telegramMeNotified = newValue;
      //telegramMeWebService.setAuthorized(this.telegramMeNotified);
    }
  }
  
  // mtpSetUserAuth
  public setUserAuth(userAuth: {id: number}) {
    var fullUserAuth = Object.assign({dcID: this.baseDcID}, userAuth);
    AppStorage.set({
      dc: this.baseDcID,
      user_auth: fullUserAuth
    });
    
    this.telegramMeNotify(true);

    /// #if !MTPROTO_WORKER
    $rootScope.$broadcast('user_auth', fullUserAuth);
    /// #endif
  }

  public setBaseDcID(dcID: number) {
    this.baseDcID = dcID;
  }
  
  // mtpLogOut
  public async logOut() {
    let storageKeys: Array<string> = [];
    
    let prefix = Modes.test ? 't_dc' : 'dc';
    
    for(let dcID = 1; dcID <= 5; dcID++) {
      storageKeys.push(prefix + dcID + '_auth_key');
      //storageKeys.push(prefix + dcID + '_auth_keyID');
    }
    
    // WebPushApiManager.forceUnsubscribe(); // WARNING
    let storageResult = await AppStorage.get<string[]|boolean[]>(storageKeys);
    
    let logoutPromises = [];
    for(let i = 0; i < storageResult.length; i++) {
      if(storageResult[i]) {
        logoutPromises.push(this.invokeApi('auth.logOut', {}, {dcID: i + 1, ignoreErrors: true}));
      }
    }
    
    return Promise.all(logoutPromises).then(() => {
    }, (error) => {
      error.handled = true;
    }).finally(() => {
      this.baseDcID = 0;
      this.telegramMeNotify(false);
      AppStorage.clear();
    })/* .then(() => {
      location.pathname = '/';
    }) */;
  }
  
  // mtpGetNetworker
  public async getNetworker(dcID: number, options: InvokeApiOptions = {}): Promise<MTPNetworker> {
    /// #if MTPROTO_HTTP
    // @ts-ignore
    const upload = (options.fileUpload || options.fileDownload);
    /// #else 
    // @ts-ignore
    const upload = (options.fileUpload || options.fileDownload) && Modes.multipleConnections;
    /// #endif
    
    const transport = dcConfigurator.chooseServer(dcID, upload);
    const cache = upload ? this.cachedUploadNetworkers : this.cachedNetworkers;
    
    if(!dcID) {
      throw new Error('get Networker without dcID');
    }
    
    if(cache[dcID] !== undefined) {
      return cache[dcID];
    }
    
    const getKey = dcID + '-' + +upload;
    if(this.gettingNetworkers[getKey]) {
      return this.gettingNetworkers[getKey];
    }

    const ak = 'dc' + dcID + '_auth_key';
    const akID = 'dc' + dcID + '_auth_keyID';
    const ss = 'dc' + dcID + '_server_salt';
    
    return this.gettingNetworkers[getKey] = AppStorage.get<string[]/* |boolean[] */>([ak, akID, ss])
    .then(async([authKeyHex, authKeyIDHex, serverSaltHex]) => {
      /* if(authKeyHex && !authKeyIDHex && serverSaltHex) {
        this.log.warn('Updating to new version (+akID)');
        await AppStorage.remove(ak, akID, ss);
        authKeyHex = serverSaltHex = '';
      } */
      
      let networker: MTPNetworker;
      if(authKeyHex && authKeyHex.length == 512) {
        if(!serverSaltHex || serverSaltHex.length != 16) {
          serverSaltHex = 'AAAAAAAAAAAAAAAA';
        }
        
        const authKey = bytesFromHex(authKeyHex);
        const authKeyID = new Uint8Array(bytesFromHex(authKeyIDHex));
        const serverSalt = bytesFromHex(serverSaltHex);
        
        networker = networkerFactory.getNetworker(dcID, authKey, authKeyID, serverSalt, options);
      } else {
        try { // if no saved state
          const auth = await authorizer.auth(dcID);
  
          const storeObj = {
            [ak]: bytesToHex(auth.authKey),
            [akID]: auth.authKeyID.hex,
            [ss]: bytesToHex(auth.serverSalt)
          };
          
          AppStorage.set(storeObj);
          
          networker = networkerFactory.getNetworker(dcID, auth.authKey, auth.authKeyID, auth.serverSalt, options);
        } catch(error) {
          this.log('Get networker error', error, error.stack);
          delete this.gettingNetworkers[getKey];
          throw error;
        }
      }

      delete this.gettingNetworkers[getKey];
      return cache[dcID] = networker;
    });
  }
  
  // mtpInvokeApi
  public invokeApi<T extends keyof MethodDeclMap>(method: T, params: MethodDeclMap[T]['req'] = {}, options: InvokeApiOptions = {}): CancellablePromise<MethodDeclMap[T]["res"]> {
    ///////this.log('Invoke api', method, params, options);

    const deferred = deferredPromise<MethodDeclMap[T]['res']>();

    if(MOUNT_CLASS_TO) {
      deferred.finally(() => {
        clearInterval(interval);
      });
  
      const startTime = Date.now();
      const interval = MOUNT_CLASS_TO.setInterval(() => {
        this.log.error('Request is still processing:', method, params, options, 'time:', (Date.now() - startTime) / 1000);
        //this.cachedUploadNetworkers[2].requestMessageStatus();
      }, 30e3);
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
    
    var dcID: number;
    
    var cachedNetworker: MTPNetworker;
    var stack = (new Error()).stack || 'empty stack';
    var performRequest = (networker: MTPNetworker) => {
      return (cachedNetworker = networker)
      .wrapApiCall(method, params, options)
      .then(deferred.resolve, (error: ApiError) => {
        //if(!options.ignoreErrors) {
        if(error.type != 'FILE_REFERENCE_EXPIRED') {
          this.log.error('Error', error.code, error.type, this.baseDcID, dcID, method, params);
        }
        
        if(error.code == 401 && this.baseDcID == dcID) {
          AppStorage.remove('dc', 'user_auth');
          this.telegramMeNotify(false);
          rejectPromise(error);
        } else if(error.code == 401 && this.baseDcID && dcID != this.baseDcID) {
          if(this.cachedExportPromise[dcID] === undefined) {
            let promise = new Promise((exportResolve, exportReject) => {
              this.invokeApi('auth.exportAuthorization', {dc_id: dcID}, {noErrorBox: true}).then((exportedAuth) => {
                this.invokeApi('auth.importAuthorization', {
                  id: exportedAuth.id,
                  bytes: exportedAuth.bytes
                }, {dcID: dcID, noErrorBox: true}).then(exportResolve, exportReject);
              }, exportReject);
            });
            
            this.cachedExportPromise[dcID] = promise;
          }
          
          this.cachedExportPromise[dcID].then(() => {
            //(cachedNetworker = networker).wrapApiCall(method, params, options).then(deferred.resolve, rejectPromise);
            this.invokeApi(method, params, options).then(deferred.resolve, rejectPromise);
          }, rejectPromise);
        } else if(error.code == 303) {
          var newDcID = +error.type.match(/^(PHONE_MIGRATE_|NETWORK_MIGRATE_|USER_MIGRATE_)(\d+)/)[2];
          if(newDcID != dcID) {
            if(options.dcID) {
              options.dcID = newDcID;
            } else {
              AppStorage.set({dc: this.baseDcID = newDcID});
            }
            
            this.getNetworker(newDcID, options).then((networker) => {
              networker.wrapApiCall(method, params, options).then(deferred.resolve, rejectPromise);
            }, rejectPromise);
          }
        } else if(!options.rawError && error.code == 420) {
          var waitTime = +error.type.match(/^FLOOD_WAIT_(\d+)/)[1] || 10;
          
          if(waitTime > (options.floodMaxTimeout !== undefined ? options.floodMaxTimeout : 60)) {
            return rejectPromise(error);
          }
          
          setTimeout(() => {
            performRequest(cachedNetworker);
          }, waitTime/* (waitTime + 5) */ * 1000); // 03.02.2020
        } else if(!options.rawError && (error.code == 500 || error.type == 'MSG_WAIT_FAILED')) {
          var now = Date.now();
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
    
    if(dcID = (options.dcID || this.baseDcID)) {
      this.getNetworker(dcID, options).then(performRequest, rejectPromise);
    } else {
      AppStorage.get<number>('dc').then((baseDcID) => {
        this.getNetworker(this.baseDcID = dcID = baseDcID || App.baseDcID, options).then(performRequest, rejectPromise);
      });
    }

    return deferred;
  }
}

const apiManager = new ApiManager();
MOUNT_CLASS_TO && (MOUNT_CLASS_TO.apiManager = apiManager);
export default apiManager;
