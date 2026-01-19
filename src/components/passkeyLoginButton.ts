import IS_WEB_AUTHN_SUPPORTED from '@environment/webAuthn';
import toggleDisability from '@helpers/dom/toggleDisability';
import {InputPasskeyResponse} from '@layer';
import AccountController from '@lib/accounts/accountController';
import {changeAccount} from '@lib/accounts/changeAccount';
import {ActiveAccountNumber} from '@lib/accounts/types';
import {getInputPasskeyCredential} from '@appManagers/utils/account/getInputPasskeyResponse';
import rootScope from '@lib/rootScope';
import {TrueDcId} from '@types';
import Button from '@components/button';
import {toastNew} from '@components/toast';

const PasskeyLoginButton = () => {
  if(!IS_WEB_AUTHN_SUPPORTED) return;
  let passkeyOptionJSON: string, passkeyInitDcId: TrueDcId;
  const btnPasskey = Button('btn-primary btn-secondary btn-primary-transparent primary hide', {text: 'Login.Passkey'});
  const fetchPasskeyOption = () => {
    return Promise.all([
      rootScope.managers.apiManager.getBaseDcId(),
      rootScope.managers.appAccountManager.initPasskeyLogin()
    ]).then(([dcId, passkeyLoginOptions]) => {
      passkeyInitDcId = (dcId || undefined) as TrueDcId;
      passkeyOptionJSON = passkeyLoginOptions.options.data;
      btnPasskey.classList.remove('hide');
    });
  };

  btnPasskey.addEventListener('click', async() => {
    const toggle = toggleDisability(btnPasskey, true);
    try {
      const userIds = await AccountController.getUserIds();
      const credential = await navigator.credentials.get({
        publicKey: PublicKeyCredential.parseRequestOptionsFromJSON(JSON.parse(passkeyOptionJSON).publicKey)
      });
      const inputPasskeyCredential = getInputPasskeyCredential(credential as PublicKeyCredential);
      const [dcId, userId] = (inputPasskeyCredential.response as InputPasskeyResponse.inputPasskeyResponseLogin).user_handle
      .split(':').map((n) => parseInt(n));

      const existingIndex = userIds.indexOf(userId);
      if(existingIndex !== -1) {
        changeAccount(existingIndex + 1 as ActiveAccountNumber);
        return;
      }

      await rootScope.managers.apiManager.setBaseDcId(dcId);
      await rootScope.managers.appAccountManager.finishPasskeyLogin(
        inputPasskeyCredential,
        passkeyInitDcId === dcId ? undefined : passkeyInitDcId
      );
      import('../pages/pageIm').then((m) => m.default.mount());
    } catch(err) {
      if((err as ApiError).type === 'SESSION_PASSWORD_NEEDED') {
        import('../pages/pagePassword').then((m) => m.default.mount());
        return;
      } else if((err as ApiError).type === 'PASSKEY_CREDENTIAL_NOT_FOUND') {
        toastNew({langPackKey: 'Login.Passkey.Error.NotFound'});
      } else {
        toastNew({langPackKey: 'Login.Passkey.Error'});
      }

      await fetchPasskeyOption();
      toggle();
      throw err;
    }
  });

  return {button: btnPasskey, fetch: fetchPasskeyOption};
};

export default PasskeyLoginButton;
