import {createSignal, JSX, onMount} from 'solid-js';

import IS_WEB_AUTHN_SUPPORTED from '@environment/webAuthn';
import {AuthPasskeyLoginOptions, InputPasskeyResponse} from '@layer';
import AccountController from '@lib/accounts/accountController';
import {changeAccount} from '@lib/accounts/changeAccount';
import {ActiveAccountNumber} from '@lib/accounts/types';
import {getInputPasskeyCredential} from '@appManagers/utils/account/getInputPasskeyResponse';
import {GrowHeightReveal} from '@helpers/solid/animations';
import rootScope from '@lib/rootScope';
import {TrueDcId} from '@types';
import Button from '@components/buttonTsx';
import {toastNew} from '@components/toast';

let _fetchPasskeyOptionPromise: Promise<[TrueDcId, AuthPasskeyLoginOptions]>;

export default function PasskeyLoginButton(props: {
  disabled?: boolean
} = {}): JSX.Element {
  if(!IS_WEB_AUTHN_SUPPORTED) return null;

  const [visible, setVisible] = createSignal(false);
  const [submitting, setSubmitting] = createSignal(false);

  let passkeyOptionJSON: string;
  let passkeyInitDcId: TrueDcId;

  const fetchPasskeyOption = (overwrite?: boolean) => {
    if(overwrite) {
      _fetchPasskeyOptionPromise = undefined;
    }

    _fetchPasskeyOptionPromise ||= Promise.all([
      rootScope.managers.apiManager.getBaseDcId(),
      rootScope.managers.appAccountManager.initPasskeyLogin()
    ]);

    return _fetchPasskeyOptionPromise.then(([dcId, passkeyLoginOptions]) => {
      passkeyInitDcId = (dcId || undefined) as TrueDcId;
      passkeyOptionJSON = passkeyLoginOptions.options.data;
      setVisible(true);
    });
  };

  const onClick = async() => {
    setSubmitting(true);
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
      import('../pages/bootstrapIm').then((m) => m.bootstrapIm());
    } catch(err) {
      if((err as ApiError).type === 'SESSION_PASSWORD_NEEDED') {
        import('../pages/authFlow').then(({navigateAuth}) => navigateAuth({name: 'password'}));
        return;
      } else if((err as ApiError).type === 'PASSKEY_CREDENTIAL_NOT_FOUND') {
        toastNew({langPackKey: 'Login.Passkey.Error.NotFound'});
      } else {
        toastNew({langPackKey: 'Login.Passkey.Error'});
      }

      await fetchPasskeyOption(true);
      setSubmitting(false);
    }
  };

  onMount(() => {
    fetchPasskeyOption();
  });

  return (
    <GrowHeightReveal when={visible()}>
      <Button
        class="btn-primary btn-secondary btn-primary-transparent primary"
        disabled={submitting() || props.disabled}
        onClick={onClick}
        text="Login.Passkey"
      />
    </GrowHeightReveal>
  );
}
