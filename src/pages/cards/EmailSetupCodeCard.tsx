import {onMount} from 'solid-js';

import {EnterCodeStep} from '@components/emailVerification';
import {toastNew} from '@components/toast';

import AuthCard from '@/pages/AuthCard';
import {CardSpec, useAuthFlow} from '@/pages/authFlow';
import {continueLogin} from '@/pages/continueLogin';
import {isPhoneLoginExpired} from '@/pages/sentCode';

if(import.meta.hot) import.meta.hot.accept();

type Spec = Extract<CardSpec, {name: 'emailSetupCode'}>;

/**
 * Confirms the address entered on the previous card, then hands the login back to
 * the phone code.
 *
 * `account.verifyEmail` with `emailVerifyPurposeLoginSetup` answers with
 * `account.emailVerifiedLogin`, and its `sent_code` is the *next* step of the
 * same sign-in (usually the code for the email that was just attached) — so it
 * routes through `sentCodeToCardSpec` exactly like `auth.sendCode` would, and
 * carries a fresh `phone_code_hash` with it.
 */
export default function EmailSetupCodeCard(props: {spec: Spec}) {
  const {managers, navigate, toIm} = useAuthFlow();
  const {phone_number, phone_code_hash, sentCode} = props.spec.payload;

  const backToEmail = () => navigate({name: 'emailSetup', payload: {phone_number, phone_code_hash}});

  onMount(() => {
    managers.appStateManager.pushToState('authState', {
      _: 'authStateEmailSetupCode',
      phone_number,
      phone_code_hash,
      sentCode
    });
  });

  return (
    <AuthCard inputWrapper={false}>
      <EnterCodeStep
        variant="card"
        purpose={{_: 'emailVerifyPurposeLoginSetup', phone_number, phone_code_hash}}
        sentCode={sentCode}
        onExpired={backToEmail}
        onError={(err) => {
          if(!isPhoneLoginExpired(err)) return false;
          toastNew({langPackKey: 'PHONE_CODE_EXPIRED'});
          navigate({name: 'signIn'});
          return true;
        }}
        onSuccess={async(result) => {
          if(result._ !== 'account.emailVerifiedLogin') {
            // only a login-setup purpose is verified here, so anything else means
            // the server and the client disagree about what is going on
            console.error('unexpected account.verifyEmail result', result);
            toastNew({langPackKey: 'Error.AnError'});
            return;
          }

          await continueLogin(result.sent_code, {
            managers,
            navigate,
            toIm,
            phone_number,
            phone_code_hash
          });
        }}
        // back to the address — which is where the way back to the phone lives
        secondaryAction={{text: 'Login.EditEmail', onClick: backToEmail}}
      />
    </AuthCard>
  );
}
