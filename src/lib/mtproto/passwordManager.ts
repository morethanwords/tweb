import apiManager from "./apiManager";
import { computeCheck } from "../crypto/srp";

export class PasswordManager {
  public getState(options: any = {}) {
    return apiManager.invokeApi('account.getPassword', {}, options).then((result) => {
      return result;
    });
  }

  /* public updateSettings(state: any, settings: any) {
    var currentHashPromise;
    var newHashPromise;
    var params: any = {
      new_settings: {
        _: 'account.passwordInputSettings',
        flags: 0,
        hint: settings.hint || ''
      }
    };

    if(typeof settings.cur_password === 'string' &&
      settings.cur_password.length > 0) {
      currentHashPromise = this.makePasswordHash(state.current_salt, settings.cur_password);
    } else {
      currentHashPromise = Promise.resolve([]);
    }

    if (typeof settings.new_password === 'string' &&
      settings.new_password.length > 0) {
      var saltRandom = new Array(8);
      var newSalt = bufferConcat(state.new_salt, saltRandom);
      secureRandom.nextBytes(saltRandom);
      newHashPromise = this.makePasswordHash(newSalt, settings.new_password);
      params.new_settings.new_salt = newSalt;
      params.new_settings.flags |= 1;
    } else {
      if(typeof settings.new_password === 'string') {
        params.new_settings.flags |= 1;
        params.new_settings.new_salt = [];
      }
      newHashPromise = Promise.resolve([]);
    }

    if(typeof settings.email === 'string') {
      params.new_settings.flags |= 2;
      params.new_settings.email = settings.email || '';
    }

    return Promise.all([currentHashPromise, newHashPromise]).then((hashes) => {
      params.current_password_hash = hashes[0];
      params.new_settings.new_password_hash = hashes[1];

      return apiManager.invokeApi('account.updatePasswordSettings', params);
    });
  } */

  public check(state: any, password: string, options: any = {}) {
    return computeCheck(password, state).then((inputCheckPassword) => {
      return apiManager.invokeApi('auth.checkPassword', {
        password: inputCheckPassword
      }, options);
    });
  }

  public requestRecovery(options: any = {}) {
    return apiManager.invokeApi('auth.requestPasswordRecovery', {}, options);
  }

  public recover(code: any, options: any = {}) {
    return apiManager.invokeApi('auth.recoverPassword', {
      code: code
    }, options);
  }
}

const passwordManager = new PasswordManager();
// @ts-ignore
if(process.env.NODE_ENV != 'production') {
  (self as any).passwordManager = passwordManager;
}
export default passwordManager;
