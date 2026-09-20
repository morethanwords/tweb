import {onMount} from 'solid-js';

import {putPreloader} from '@components/putPreloader';
import {STATE_INIT} from '@config/state';

import AuthCard from '@/pages/AuthCard';
import {CardSpec, useAuthFlow} from '@/pages/authFlow';
import styles from '@/pages/authFlow.module.scss';

if(import.meta.hot) import.meta.hot.accept();

type Spec = Extract<CardSpec, {name: 'signImport'}>;

/**
 * Card variant of the legacy `pageSignImport`. Shows a preloader while we try
 * `auth.importWebTokenAuthorization`; on success goes to IM, on
 * `SESSION_PASSWORD_NEEDED` jumps to the password card, on any other failure
 * falls back to the configured default auth state (signIn or signQR) and drops
 * the token server-side.
 */
export default function SignImportCard(props: {spec: Spec}) {
  const {managers, navigate, toIm} = useAuthFlow();

  let preloaderHostEl!: HTMLDivElement;

  onMount(() => {
    managers.appStateManager.pushToState('authState', {
      _: 'authStateSignImport',
      data: props.spec.payload
    });

    putPreloader(preloaderHostEl, true);
    importWebToken();
  });

  async function importWebToken() {
    const {dcId, token, tgAddr} = props.spec.payload;
    let nextNav: (() => void | Promise<void>) | undefined;

    try {
      const authorization = await managers.appAccountManager.importWebTokenAuthorization(token, dcId);

      if(authorization._ === 'auth.authorization') {
        nextNav = () => toIm();
      }
    } catch(err) {
      switch((err as ApiError).type) {
        case 'SESSION_PASSWORD_NEEDED': {
          nextNav = () => navigate({name: 'password'});
          break;
        }
        default: {
          console.error('authorization import error:', err);
          managers.appAccountManager.cancelWebTokenAuthorization(token, dcId);
          const defaultState = STATE_INIT.authState._;
          if(defaultState === 'authStateSignIn') nextNav = () => navigate({name: 'signIn'});
          else if(defaultState === 'authStateSignQr') nextNav = () => navigate({name: 'signQR'});
          break;
        }
      }
    }

    location.hash = tgAddr?.trim() ? '#?tgaddr=' + encodeURIComponent(tgAddr) : '';

    if(nextNav) {
      await nextNav();
    }
  }

  return (
    <AuthCard inputWrapper={false}>
      <div ref={preloaderHostEl}/>
    </AuthCard>
  );
}
