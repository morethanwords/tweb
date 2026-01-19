import App from '@config/app';
import {bigIntFromBytes} from '@helpers/bigInt/bigIntConversion';
import {EmailVerification, EmailVerifyPurpose, InputCheckPasswordSRP, InputPasskeyCredential} from '@layer';
import {DcId, TrueDcId} from '@types';
import AccountController from '@lib/accounts/accountController';
import {AppManager} from '@appManagers/manager';

export default class AppAccountManager extends AppManager {
  public initPasskeyRegistration() {
    return this.apiManager.invokeApi('account.initPasskeyRegistration');
  }

  public registerPasskey(credential: InputPasskeyCredential) {
    return this.apiManager.invokeApi('account.registerPasskey', {credential});
  }

  public getPasskeys() {
    return this.apiManager.invokeApi('account.getPasskeys');
  }

  public deletePasskey(id: string) {
    return this.apiManager.invokeApiSingle('account.deletePasskey', {id});
  }

  public initPasskeyLogin() {
    return this.apiManager.invokeApi('auth.initPasskeyLogin', {
      api_hash: App.hash,
      api_id: App.id
    });
  }

  public async finishPasskeyLogin(credential: InputPasskeyCredential, fromDcId?: TrueDcId) {
    const fromAuthKey = fromDcId ? await this.apiManager.getAuthKeyFromHex((await AccountController.get(this.getAccountNumber()))[`dc${fromDcId as TrueDcId}_auth_key`]) : undefined;
    return this.apiManager.invokeApi('auth.finishPasskeyLogin', {
      credential,
      ...(fromDcId ? {
        from_dc_id: fromDcId,
        from_auth_key_id: bigIntFromBytes(fromAuthKey.id.reverse()).toString()
      } : {})
    }, {ignoreErrors: true}).then((authorization) => {
      if(authorization._ === 'auth.authorization') {
        this.apiManager.setUser(authorization.user);
      }

      return authorization;
    });
  }

  public sendVerifyEmailCode(purpose: EmailVerifyPurpose, email: string) {
    return this.apiManager.invokeApi('account.sendVerifyEmailCode', {purpose, email});
  }

  public verifyEmail(purpose: EmailVerifyPurpose, verification: EmailVerification) {
    return this.apiManager.invokeApi('account.verifyEmail', {purpose, verification});
  }

  public getAuthorizations() {
    return this.apiManager.invokeApi('account.getAuthorizations');
  }

  public resetAuthorization(hash: string) {
    return this.apiManager.invokeApi('account.resetAuthorization', {hash});
  }

  public deleteAccount(reason: string) {
    return this.apiManager.invokeApi('account.deleteAccount', {reason});
  }
}
