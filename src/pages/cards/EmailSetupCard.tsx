import {onMount} from 'solid-js';

import {EnterEmailStep} from '@components/emailVerification';
import {toastNew} from '@components/toast';

import AuthCard from '@/pages/AuthCard';
import {CardSpec, useAuthFlow} from '@/pages/authFlow';
import {isPhoneLoginExpired} from '@/pages/sentCode';

if(import.meta.hot) import.meta.hot.accept();

type Spec = Extract<CardSpec, {name: 'emailSetup'}>;

/**
 * `auth.sentCodeTypeSetUpEmailRequired` — the account cannot be signed into until
 * a login email is attached, so the login pauses here and asks for one.
 *
 * The step itself is the very same component the "Add Email" popup and the
 * Settings → Login Email tab render; only the `purpose` differs —
 * `emailVerifyPurposeLoginSetup` carries the pending phone login, so the server
 * ties the address to this sign-in attempt.
 */
export default function EmailSetupCard(props: {spec: Spec}) {
  const {managers, navigate} = useAuthFlow();
  const {phone_number, phone_code_hash} = props.spec.payload;

  onMount(() => {
    managers.appStateManager.pushToState('authState', {
      _: 'authStateEmailSetup',
      phone_number,
      phone_code_hash
    });
  });

  return (
    <AuthCard inputWrapper={false}>
      <EnterEmailStep
        isInitialSetup
        variant="card"
        purpose={{_: 'emailVerifyPurposeLoginSetup', phone_number, phone_code_hash}}
        onCodeSent={(sentCode) => navigate({
          name: 'emailSetupCode',
          payload: {phone_number, phone_code_hash, sentCode}
        })}
        onError={(err) => {
          if(!isPhoneLoginExpired(err)) return false;
          toastNew({langPackKey: 'PHONE_CODE_EXPIRED'});
          navigate({name: 'signIn'});
          return true;
        }}
        // the login pauses here, so this is the only way back to a mistyped
        // number — the host's corner button belongs to account switching, and a
        // reload restores this very card
        secondaryAction={{text: 'Login.EditPhone', onClick: () => navigate({name: 'signIn'})}}
      />
    </AuthCard>
  );
}
