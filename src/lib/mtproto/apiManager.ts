import AppStorage from '../storage';

import { MTPNetworker } from './networker';
import { bytesFromHex, bytesToHex } from '../bin_utils';
import networkerFactory from './networkerFactory';
import { telegramMeWebService } from './mtproto';
import authorizer from './authorizer';
import { isObject, tsNow, $rootScope } from '../utils';
import * as Config from '../config';
import dcConfigurator from './dcConfigurator';
import HTTP from './transports/http';
import { logger } from '../polyfill';

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
    $rootScope.$broadcast('user_auth', fullUserAuth);
  }
  
  // mtpLogOut
  public async logOut() {
    let storageKeys: Array<string> = [];
    
    let prefix = Config.Modes.test ? 't_dc' : 'dc';
    
    for(let dcID = 1; dcID <= 5; dcID++) {
      storageKeys.push(prefix + dcID + '_auth_key');
      //storageKeys.push('dc' + dcID + '_auth_keyID');
      //storageKeys.push('t_dc' + dcID + '_auth_key');
      //storageKeys.push('t_dc' + dcID + '_auth_keyID');
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
    }).then(() => {
      location.pathname = '/';
    });
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
  public async getNetworker(dcID: number, options: any = {}): Promise<MTPNetworker> {
    let upload = (options.fileUpload || options.fileDownload) 
      && (dcConfigurator.chooseServer(dcID, true) instanceof HTTP || Config.Modes.multipleConnections);
    let cache = upload ? this.cachedUploadNetworkers : this.cachedNetworkers;
    
    if(!dcID) {
      throw new Error('get Networker without dcID');
    }
    
    if(cache[dcID] !== undefined) {
      return cache[dcID];
    }
    
    let getKey = dcID + '-' + +upload;
    if(this.gettingNetworkers[getKey]) {
      return this.gettingNetworkers[getKey];
    }
    
    return this.gettingNetworkers[getKey] = new Promise(async(resolve, reject) => {
      var ak = 'dc' + dcID + '_auth_key';
      var akID = 'dc' + dcID + '_auth_keyID';
      var ss = 'dc' + dcID + '_server_salt';
      
      let result = await AppStorage.get<string[]/* |boolean[] */>([ak, akID, ss]);
      
      let [authKeyHex, authKeyIDHex, serverSaltHex] = result;
      if(authKeyHex && !authKeyIDHex && serverSaltHex) {
        this.log.warn('Updating to new version (+akID)');
        await AppStorage.remove(ak, akID, ss);
        authKeyHex = serverSaltHex = '';
      }
      
      if(authKeyHex && authKeyHex.length == 512) {
        if(!serverSaltHex || serverSaltHex.length != 16) {
          serverSaltHex = 'AAAAAAAAAAAAAAAA';
        }
        
        var authKey = bytesFromHex(authKeyHex);
        var authKeyID = new Uint8Array(bytesFromHex(authKeyIDHex));
        var serverSalt = bytesFromHex(serverSaltHex);
        
        resolve(cache[dcID] = networkerFactory.getNetworker(dcID, authKey, authKeyID, serverSalt, options));
      } else try {
        let auth = await authorizer.auth(dcID);
        
        let storeObj = {
          [ak]: bytesToHex(auth.authKey),
          [akID]: auth.authKeyID.hex,
          [ss]: bytesToHex(auth.serverSalt)
        };
        
        AppStorage.set(storeObj);
        
        resolve(cache[dcID] = networkerFactory.getNetworker(dcID, auth.authKey, auth.authKeyID, auth.serverSalt, options));
      } catch(error) {
        this.log('Get networker error', error, error.stack);
        reject(error);
      }

      delete this.gettingNetworkers[getKey];
    });
  }
  
  // mtpInvokeApi
  public invokeApi(method: string, params: any = {}, options: {
    dcID?: number,
    timeout?: number,
    noErrorBox?: boolean,
    fileUpload?: boolean,
    ignoreErrors?: boolean,
    fileDownload?: boolean,
    createNetworker?: boolean,
    singleInRequest?: boolean,
    startMaxLength?: number,
    
    waitTime?: number,
    stopTime?: number,
    rawError?: any
  } = {}) {
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
            
            if(waitTime > (options.timeout || 60)) {
              return rejectPromise(error);
            }
            
            setTimeout(() => {
              performRequest(cachedNetworker);
            }, (waitTime + 5) * 1000); // 03.02.2020
          } else if(!options.rawError && (error.code == 500 || error.type == 'MSG_WAIT_FAILED')) {
            var now = tsNow();
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
          this.getNetworker(this.baseDcID = dcID = baseDcID || Config.App.baseDcID, options).then(performRequest, rejectPromise);
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
}

export default new ApiManager();
