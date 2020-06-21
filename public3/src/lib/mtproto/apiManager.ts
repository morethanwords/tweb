import AppStorage from '../storage';

import { MTPNetworker } from './networker';
import { bytesFromHex, bytesToHex, isObject } from '../bin_utils';
import networkerFactory from './networkerFactory';
import { telegramMeWebService } from './mtproto';
import authorizer from './authorizer';
import {App, Modes} from './mtproto_config';
import dcConfigurator from './dcConfigurator';
import HTTP from './transports/http';
import { logger } from '../logger';
import passwordManager from './passwordManager';

/// #if !MTPROTO_WORKER
import { $rootScope } from '../utils';
import { InvokeApiOptions } from '../../types';
/// #endif

//console.error('apiManager included!');

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
      telegramMeWebService.setAuthorized(this.telegramMeNotified);
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
      AppStorage.remove('dc', 'user_auth', 'stickerSets');
      this.baseDcID = 0;
      this.telegramMeNotify(false);
      this.mtpClearStorage();
    }, (error) => {
      storageKeys.push('dc', 'user_auth', 'stickerSets');
      AppStorage.remove(storageKeys);
      this.baseDcID = 0;
      error.handled = true;
      this.telegramMeNotify(false);
      this.mtpClearStorage();
    })/* .then(() => {
      location.pathname = '/';
    }) */;
  }
  
  public mtpClearStorage() {
    var saveKeys = ['user_auth', 't_user_auth', 'dc', 't_dc'];
    
    for(var dcID = 1; dcID <= 5; dcID++) {
      saveKeys.push('dc' + dcID + '_auth_key');
      saveKeys.push('dc' + dcID + '_auth_keyID');
      saveKeys.push('dc' + dcID + '_server_salt'); // new
      saveKeys.push('t_dc' + dcID + '_auth_key');
      saveKeys.push('t_dc' + dcID + '_auth_keyID');
      saveKeys.push('t_dc' + dcID + '_server_salt'); // new
    }
    
    AppStorage.noPrefix();
    AppStorage.get<string[]|boolean[]>(saveKeys).then((values) => {
      AppStorage.clear().then(() => {
        var restoreObj: any = {};
        
        saveKeys.forEach((key, i) => {
          var value = values[i];
          if(value !== false && value !== undefined) {
            restoreObj[key] = value;
          }
        });
        
        AppStorage.noPrefix();
        return AppStorage.set(restoreObj);
      });
    });
  }
  
  // mtpGetNetworker
  public async getNetworker(dcID: number, options: InvokeApiOptions): Promise<MTPNetworker> {
    const upload = (options.fileUpload || options.fileDownload) 
      && (dcConfigurator.chooseServer(dcID, true) instanceof HTTP || Modes.multipleConnections);
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
  public invokeApi(method: string, params: any = {}, options: InvokeApiOptions = {}) {
    ///////this.log('Invoke api', method, params, options);
    
    return new Promise((resolve, reject) => {
      let rejectPromise = (error: any) => {
        if(!error) {
          error = {type: 'ERROR_EMPTY'};
        } else if (!isObject(error)) {
          error = {message: error};
        }
        
        reject(error);
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
        .then(resolve, (error: any) => {
          this.log.error('Error', error.code, error.type, this.baseDcID, dcID);
          
          if(error.code == 401 && this.baseDcID == dcID) {
            AppStorage.remove('dc', 'user_auth');
            this.telegramMeNotify(false);
            rejectPromise(error);
          } else if(error.code == 401 && this.baseDcID && dcID != this.baseDcID) {
            if(this.cachedExportPromise[dcID] === undefined) {
              let promise = new Promise((exportResolve, exportReject) => {
                this.invokeApi('auth.exportAuthorization', {dc_id: dcID}, {noErrorBox: true}).then((exportedAuth: any) => {
                  this.invokeApi('auth.importAuthorization', {
                    id: exportedAuth.id,
                    bytes: exportedAuth.bytes
                  }, {dcID: dcID, noErrorBox: true}).then(exportResolve, exportReject);
                }, exportReject);
              });
              
              this.cachedExportPromise[dcID] = promise;
            }
            
            this.cachedExportPromise[dcID].then(() => {
              (cachedNetworker = networker).wrapApiCall(method, params, options).then(resolve, rejectPromise);
            }, rejectPromise);
          } else if(error.code == 303) {
            var newDcID = error.type.match(/^(PHONE_MIGRATE_|NETWORK_MIGRATE_|USER_MIGRATE_)(\d+)/)[2];
            if(newDcID != dcID) {
              if(options.dcID) {
                options.dcID = newDcID;
              } else {
                AppStorage.set({dc: this.baseDcID = newDcID});
              }
              
              this.getNetworker(newDcID, options).then((networker) => {
                networker.wrapApiCall(method, params, options).then(resolve, rejectPromise);
              }, rejectPromise);
            }
          } else if(!options.rawError && error.code == 420) {
            var waitTime = error.type.match(/^FLOOD_WAIT_(\d+)/)[1] || 10;
            
            if(waitTime > (options.timeout !== undefined ? options.timeout : 60)) {
              return rejectPromise(error);
            }
            
            setTimeout(() => {
              performRequest(cachedNetworker);
            }, (waitTime + 5) * 1000); // 03.02.2020
          } else if(!options.rawError && (error.code == 500 || error.type == 'MSG_WAIT_FAILED')) {
            var now = Date.now();
            if(options.stopTime) {
              if(now >= options.stopTime) {
                return rejectPromise(error);
              }
            } else {
              options.stopTime = now + (options.timeout !== undefined ? options.timeout : 10) * 1000;
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
    });
  }
  
  // mtpGetUserID
  public getUserID(): Promise<number> {
    return AppStorage.get<any>('user_auth').then((auth) => {
      this.telegramMeNotify(auth && auth.id > 0 || false);
      return auth.id || 0;
    });
  }

  public checkPassword(value: string): Promise<any> {
    return passwordManager.getState()
    .then(state => {
      return passwordManager.check(state, value);
    });
  }
}

export default new ApiManager();
