import type { AccountPassword, AccountPasswordInputSettings, AccountUpdatePasswordSettings, InputCheckPasswordSRP, PasswordKdfAlgo } from '../../layer';
import type CryptoWorkerMethods from '../crypto/crypto_methods';
import { MOUNT_CLASS_TO } from '../../config/debug';
import appUsersManager from '../appManagers/appUsersManager';
import apiManager from './mtprotoworker';
//import { computeCheck } from "../crypto/srp";

export class PasswordManager {
  public getState(): Promise<AccountPassword> {
    return apiManager.invokeApi('account.getPassword').then((result) => {
      return result;
    });
  }

  public updateSettings(settings: {
    hint?: string,
    email?: string,
    newPassword?: string,
    currentPassword?: string
  } = {}) {
    //state = Object.assign({}, state);
    //state.new_algo = Object.assign({}, state.new_algo);

    this.getState().then(state => {
      let currentHashPromise: ReturnType<CryptoWorkerMethods['computeSRP']>;
      let newHashPromise: Promise<Uint8Array>;
      const params: AccountUpdatePasswordSettings = {
        password: null,
        new_settings: {
          _: 'account.passwordInputSettings',
          hint: settings.hint,
          email: settings.email
        }
      };
  
      if(settings.currentPassword) {
        currentHashPromise = apiManager.computeSRP(settings.currentPassword, state);
      } else {
        currentHashPromise = Promise.resolve({
          _: 'inputCheckPasswordEmpty'
        });
      }
  
      // * https://core.telegram.org/api/srp#setting-a-new-2fa-password, but still there is a mistake, TDesktop passes 'new_algo' everytime
      const newAlgo = state.new_algo as PasswordKdfAlgo.passwordKdfAlgoSHA256SHA256PBKDF2HMACSHA512iter100000SHA256ModPow;
      const salt1 = new Uint8Array(newAlgo.salt1.length + 32);
      salt1.randomize();
      salt1.set(newAlgo.salt1, 0);
      newAlgo.salt1 = salt1;
  
      if(settings.newPassword) {
        newHashPromise = Promise.resolve(new Uint8Array());
      } else {
        newHashPromise = Promise.resolve(new Uint8Array());
      }
  
      return Promise.all([currentHashPromise, newHashPromise]).then((hashes) => {
        params.password = hashes[0];
        params.new_settings.new_algo = newAlgo;
        params.new_settings.new_password_hash = hashes[1];
  
        return apiManager.invokeApi('account.updatePasswordSettings', params);
      });
    });
  }

  public check(password: string, state: AccountPassword, options: any = {}) {
    return apiManager.computeSRP(password, state).then((inputCheckPassword) => {
      //console.log('SRP', inputCheckPassword);
      return apiManager.invokeApi('auth.checkPassword', {
        password: inputCheckPassword
      }, options).then(auth => {
        if(auth._ === 'auth.authorization') {
          appUsersManager.saveApiUser(auth.user);
          apiManager.setUserAuth(auth.user.id);
        }

        return auth;
      });
    });
  }

  /* public requestRecovery(options: any = {}) {
    return apiManager.invokeApi('auth.requestPasswordRecovery', {}, options);
  }

  public recover(code: any, options: any = {}) {
    return apiManager.invokeApi('auth.recoverPassword', {
      code
    }, options);
  } */
}

const passwordManager = new PasswordManager();
MOUNT_CLASS_TO && (MOUNT_CLASS_TO.passwordManager = passwordManager);
export default passwordManager;
