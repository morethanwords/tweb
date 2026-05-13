/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import {render} from 'solid-js/web';

import {AuthState} from '@types';

import AuthCardsHost from '@/pages/AuthCardsHost';
import {CardSpec, navigateAuth} from '@/pages/authFlow';

/**
 * Bootstrap the auth flow.
 *
 * Replaces the legacy `switch(authState._) { case 'authStateSignIn': pageSignIn.mount() … }`
 * block in `src/index.ts`. Maps the persisted `AuthState` to a `CardSpec`,
 * primes the router, then mounts `<AuthCardsHost>` to the DOM.
 *
 * Returns a `dispose` callback — call it from `pageIm`'s bootstrap to tear the
 * auth UI down once the user is signed in.
 *
 * ```ts
 * const disposeAuth = mountAuthFlow(authState);
 * // … later, on successful sign-in …
 * disposeAuth();
 * ```
 */
export type MountAuthFlowState = Exclude<AuthState, AuthState.signedIn>;

let activeDispose: (() => void) | null = (import.meta.hot?.data as any)?.activeDispose ?? null;

export function mountAuthFlow(authState: MountAuthFlowState): () => void {
  // Auth flow can only mount once at a time — clean up any previous instance.
  if(activeDispose) {
    activeDispose();
  }

  navigateAuth(authStateToCardSpec(authState));

  // Mount under a fresh container appended to body. `display: contents` lets
  // `#auth-pages` (rendered inside) inherit body's box for `.whole`'s 100%
  // height, while still giving us a single node to remove on dispose.
  const root = document.createElement('div');
  root.id = 'auth-flow-root';
  root.style.display = 'contents';
  document.body.appendChild(root);

  const dispose = render(() => <AuthCardsHost/>, root);

  activeDispose = () => {
    dispose();
    root.remove();
    activeDispose = null;
    if(import.meta.hot) (import.meta.hot.data as any).activeDispose = null;
  };

  if(import.meta.hot) (import.meta.hot.data as any).activeDispose = activeDispose;

  return activeDispose;
}

/**
 * Tear down the currently mounted `<AuthCardsHost>` if any. Called from
 * `bootstrapIm` once the IM page has taken over.
 */
export function disposeActiveAuthFlow(): void {
  activeDispose?.();
}

/* ------------------------------------------------------------------ */
/* Mapping helpers                                                    */
/* ------------------------------------------------------------------ */

function authStateToCardSpec(authState: MountAuthFlowState): CardSpec {
  switch(authState._) {
    case 'authStateSignIn':
      return {name: 'signIn'};
    case 'authStateSignQr':
      return {name: 'signQR'};
    case 'authStateAuthCode':
      return {name: 'authCode', payload: authState.sentCode};
    case 'authStatePassword':
      return {name: 'password'};
    case 'authStateSignUp':
      return {name: 'signUp', payload: authState.authCode};
    case 'authStateSignImport':
      return {name: 'signImport', payload: authState.data};
    default: {
      const exhaustive: never = authState;
      throw new Error(`Unknown auth state: ${JSON.stringify(exhaustive)}`);
    }
  }
}

if(import.meta.hot) import.meta.hot.accept();
