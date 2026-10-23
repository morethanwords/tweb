import {render} from 'solid-js/web';

import {AuthState} from '@types';

import AuthCardsHost from '@/pages/AuthCardsHost';
import {AuthFlowContextValue, CardSpec, navigateAuth} from '@/pages/authFlow';

/**
 * Bootstrap the auth flow.
 *
 * Replaces the legacy `switch(authState._) { case 'authStateSignIn': pageSignIn.mount() … }`
 * block in `src/index.ts`. Maps the persisted `AuthState` to a `CardSpec`,
 * primes the router, then mounts `<AuthCardsHost>` to the DOM.
 *
 * Returns the mounted host: its `dispose` tears the auth UI down once the user
 * is signed in (`pageIm`'s bootstrap does it through `disposeActiveAuthFlow`).
 *
 * ```ts
 * const authFlow = mountAuthFlow(authState, options);
 * // … later, on successful sign-in …
 * authFlow.dispose();
 * ```
 */
export type MountAuthFlowState = Exclude<AuthState, AuthState.signedIn>;

/** The mounted host, for whoever mounted it. */
export type AuthFlowHost = {
  /** Plays the host's way out; settles once it is out of sight. */
  leave: () => Promise<void>,
  /** What its back button does. */
  back: () => void
};

/**
 * Whose sign-in it is and what follows it. A page that boots signed out gives the tab's own account and
 * reloads or bootstraps the IM page; an account added over the app of the tab's one
 * (`@lib/accounts/addAccount`) gives its slot, and the app underneath takes over again.
 */
export type AuthFlowOptions = Pick<AuthFlowContextValue, 'accountNumber' | 'managers' | 'openAccount'> & {
  /** The back button, which there is none without: it hides the corner buttons and leaves the rest to this. */
  back?: (host: AuthFlowHost) => void | Promise<void>,
  /** Signed in: the IM page takes over. The corner buttons are hidden by then, so nothing goes back. */
  toIm: (host: AuthFlowHost) => void | Promise<void>,
  /** Stands over the app of the tab's account, which stays as it was underneath. */
  overApp?: boolean,
  /** Comes in from the screen it was opened on rather than being there at once. */
  animateEnter?: boolean
};

let activeDispose: (() => void) | null = (import.meta.hot?.data as any)?.activeDispose ?? null;

export function mountAuthFlow(authState: MountAuthFlowState, options: AuthFlowOptions): AuthFlowHost & {dispose: () => void} {
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

  let host: AuthFlowHost;
  const dispose = render(() => <AuthCardsHost {...options} ref={(value) => host = value}/>, root);

  let disposed = false;
  const disposeThis = activeDispose = () => {
    // * once: a host mounted after it disposes it too, and a delayed teardown may still come
    if(disposed) return;
    disposed = true;
    dispose();
    root.remove();
    // * one mounted after it is the active one by now
    if(activeDispose !== disposeThis) return;
    activeDispose = null;
    if(import.meta.hot) (import.meta.hot.data as any).activeDispose = null;
  };

  if(import.meta.hot) (import.meta.hot.data as any).activeDispose = activeDispose;

  return {...host, dispose: disposeThis};
}

/**
 * Tear down the currently mounted `<AuthCardsHost>` if any, after `delay` ms. Called
 * from `bootstrapIm` once the IM page has taken over. It is the host mounted now
 * that goes: one mounted in the meantime - an account added over the app the
 * moment it came up - is not the sign-in that led there.
 */
export function disposeActiveAuthFlow(delay = 0): void {
  const dispose = activeDispose;
  if(!dispose) return;
  if(delay) setTimeout(dispose, delay);
  else dispose();
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
    case 'authStateEmailSetup':
      return {
        name: 'emailSetup',
        payload: {
          phone_number: authState.phone_number,
          phone_code_hash: authState.phone_code_hash
        }
      };
    case 'authStateEmailSetupCode':
      return {
        name: 'emailSetupCode',
        payload: {
          phone_number: authState.phone_number,
          phone_code_hash: authState.phone_code_hash,
          sentCode: authState.sentCode
        }
      };
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
