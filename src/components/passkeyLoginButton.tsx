import {createSignal, JSX, onCleanup, onMount} from 'solid-js';

import IS_WEB_AUTHN_SUPPORTED from '@environment/webAuthn';
import {AuthPasskeyLoginOptions, InputPasskeyResponse} from '@layer';
import AccountController from '@lib/accounts/accountController';
import {getInputPasskeyCredential} from '@appManagers/utils/account/getInputPasskeyResponse';
import {GrowHeightReveal} from '@helpers/solid/animations';
import {TrueDcId} from '@types';
import Button from '@components/buttonTsx';
import {toastNew} from '@components/toast';
import {useAuthFlow} from '@/pages/authFlow';

// * the options asked for last, and by whose managers: the login is finished by the session that began it,
// * so a sign-in of another account over the app asks its own
let fetchedPasskeyOption: {
  managers: object,
  promise: Promise<[TrueDcId, AuthPasskeyLoginOptions]>
};

export default function PasskeyLoginButton(props: {
  disabled?: boolean
} = {}): JSX.Element {
  if(!IS_WEB_AUTHN_SUPPORTED) return null;

  // * of the account being signed in to, which the tab need not show
  const {managers, navigate, toIm, openAccount, isLeaving} = useAuthFlow();
  const [visible, setVisible] = createSignal(false);
  const [submitting, setSubmitting] = createSignal(false);

  let passkeyOptionJSON: string;
  let passkeyInitDcId: TrueDcId;

  const fetchPasskeyOption = (overwrite?: boolean) => {
    if(overwrite || fetchedPasskeyOption?.managers !== managers) {
      fetchedPasskeyOption = {
        managers,
        promise: Promise.all([
          managers.apiManager.getBaseDcId(),
          managers.appAccountManager.initPasskeyLogin()
        ])
      };
    }

    return fetchedPasskeyOption.promise.then(([dcId, passkeyLoginOptions]) => {
      passkeyInitDcId = (dcId || undefined) as TrueDcId;
      passkeyOptionJSON = passkeyLoginOptions.options.data;
      setVisible(true);
    });
  };

  // * the browser's passkey prompt can outlive the button - the sign-in over the app closed under it: it is
  // * taken down with it, and nothing of its answer, nor of a failure, comes over what is there now
  let gone = false;
  const isGone = () => gone || isLeaving();
  let credentialRequest: AbortController;
  onCleanup(() => {
    gone = true;
    credentialRequest?.abort();
  });

  const onClick = async() => {
    setSubmitting(true);
    credentialRequest = new AbortController();
    try {
      const signedInAccounts = await AccountController.getAccounts();
      const credential = await navigator.credentials.get({
        publicKey: PublicKeyCredential.parseRequestOptionsFromJSON(JSON.parse(passkeyOptionJSON).publicKey),
        signal: credentialRequest.signal
      });
      if(isGone()) {
        return;
      }

      const inputPasskeyCredential = getInputPasskeyCredential(credential as PublicKeyCredential);
      const [dcId, userId] = (inputPasskeyCredential.response as InputPasskeyResponse.inputPasskeyResponseLogin).user_handle
      .split(':').map((n) => parseInt(n));

      const existing = signedInAccounts.find(([, accountData]) => accountData.userId === userId);
      if(existing) {
        openAccount(existing[0]);
        return;
      }

      await managers.apiManager.setBaseDcId(dcId);
      await managers.appAccountManager.finishPasskeyLogin(
        inputPasskeyCredential,
        passkeyInitDcId === dcId ? undefined : passkeyInitDcId
      );
      toIm();
    } catch(err) {
      if(isGone()) {
        return;
      }

      if((err as ApiError).type === 'SESSION_PASSWORD_NEEDED') {
        navigate({name: 'password'});
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
