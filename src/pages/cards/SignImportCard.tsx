/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import {onMount} from 'solid-js';

import {putPreloader} from '@components/putPreloader';
import App from '@config/app';
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
 * falls back to the configured default auth state (signIn or signQR).
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
      managers.apiManager.setBaseDcId(dcId);
      const authorization = await managers.apiManager.invokeApi('auth.importWebTokenAuthorization', {
        api_id: App.id,
        api_hash: App.hash,
        web_auth_token: token
      }, {dcId, ignoreErrors: true});

      if(authorization._ === 'auth.authorization') {
        await managers.apiManager.setUser(authorization.user);
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
    <AuthCard class={styles.pageSignImport} inputWrapper={false}>
      <div ref={preloaderHostEl}/>
    </AuthCard>
  );
}
