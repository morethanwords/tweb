/*
 * The sign-in cards.
 *
 * Not popups: the auth flow owns the whole screen, so these mount it the way the app does
 * (`mountAuthFlow`, the same entry `src/index.ts` uses) and hand back its dispose. The sandbox panel
 * stays on top of it, so a click walks straight from one code type to the next — which is the point,
 * since the server picks the type and no account can ask it for a secret word on demand.
 *
 * Every one is `fixtureOnly`: the payloads are hand-built `auth.sentCode`s, and the cards write the
 * auth state as they mount — against the real managers that would knock a signed-in session back to
 * the login screen.
 */

import type {AuthSentCodeType} from '@layer';
import type {AuthState} from '@types';

import {defineStories} from '../registry';
import type {ManagerHandlers} from '../mockManagers';

const PHONE = '+99966 1234567';
const HASH = 'sandbox-phone-code-hash';
const EMAIL_PATTERN = 'jo**@gm***.com';

/**
 * Enough for the email flow to actually walk end to end offline: an address is accepted, its code
 * verifies, and the login continues into the phone code the server would send next. Everything the
 * cards send afterwards is refused the way a wrong code is, so the error states are reachable too.
 */
const managers: ManagerHandlers = {
  appStateManager: {
    // the cards persist their step; in the sandbox there is nothing to come back to
    pushToState: () => undefined
  },
  appAccountManager: {
    sendVerifyEmailCode: (_purpose: any, email: string) => ({
      _: 'account.sentEmailCode',
      email_pattern: email,
      length: 6
    }),
    verifyEmail: () => ({
      _: 'account.emailVerifiedLogin',
      email: 'someone@example.com',
      sent_code: {
        _: 'auth.sentCode',
        type: {_: 'auth.sentCodeTypeSms', length: 5},
        phone_code_hash: 'sandbox-verified-hash',
        next_type: {_: 'auth.codeTypeCall'},
        timeout: 20
      }
    })
  },
  apiManager: {
    invokeApi: (method: string) => {
      throw {type: method === 'auth.signIn' ? 'PHONE_CODE_INVALID' : 'FLOOD_WAIT_60'};
    }
  }
};

async function mount(authState: Exclude<AuthState, AuthState.signedIn>) {
  // imported here rather than at the top: the auth flow pulls in the whole card graph
  const {mountAuthFlow} = await import('@/pages/mountAuthFlow');
  return mountAuthFlow(authState);
}

function code(type: AuthSentCodeType, rest?: {next_type?: any, timeout?: number}) {
  return () => mount({
    _: 'authStateAuthCode',
    sentCode: {
      _: 'auth.sentCode',
      type,
      phone_code_hash: HASH,
      phone_number: PHONE,
      ...rest
    } as AuthState.authCode['sentCode']
  });
}

const surface = '#auth-pages';

defineStories('SIGN IN', [
  {
    id: 'auth/emailSetup',
    title: 'Add a login email',
    surface,
    fixtureOnly: true,
    managers,
    open: () => mount({_: 'authStateEmailSetup', phone_number: PHONE, phone_code_hash: HASH})
  },
  {
    id: 'auth/emailSetupCode',
    title: 'Confirm the login email',
    surface,
    fixtureOnly: true,
    managers,
    open: () => mount({
      _: 'authStateEmailSetupCode',
      phone_number: PHONE,
      phone_code_hash: HASH,
      sentCode: {_: 'account.sentEmailCode', email_pattern: 'someone@example.com', length: 6}
    })
  },
  {
    id: 'auth/codeApp',
    title: 'Code sent in Telegram',
    surface,
    fixtureOnly: true,
    managers,
    open: code({_: 'auth.sentCodeTypeApp', length: 5}, {next_type: {_: 'auth.codeTypeSms'}, timeout: 20})
  },
  {
    id: 'auth/codeSms',
    title: 'Code sent by SMS',
    surface,
    fixtureOnly: true,
    managers,
    open: code({_: 'auth.sentCodeTypeSms', length: 5}, {next_type: {_: 'auth.codeTypeCall'}, timeout: 20})
  },
  {
    id: 'auth/codeWord',
    title: 'Secret word from an SMS',
    surface,
    fixtureOnly: true,
    managers,
    // `beginning` is what the field validates against before spending a server attempt
    open: code({_: 'auth.sentCodeTypeSmsWord', beginning: 'Tele'}, {next_type: {_: 'auth.codeTypeSms'}, timeout: 10})
  },
  {
    id: 'auth/codePhrase',
    title: 'Secret phrase from an SMS',
    surface,
    fixtureOnly: true,
    managers,
    open: code({_: 'auth.sentCodeTypeSmsPhrase'})
  },
  {
    id: 'auth/codeMissedCall',
    title: 'Last digits of a missed call',
    surface,
    fixtureOnly: true,
    managers,
    open: code({_: 'auth.sentCodeTypeMissedCall', prefix: '+99966 77', length: 4})
  },
  {
    id: 'auth/codeFragment',
    title: 'Code on Fragment',
    surface,
    fixtureOnly: true,
    managers,
    open: code({_: 'auth.sentCodeTypeFragmentSms', url: 'https://fragment.com', length: 8})
  },
  {
    id: 'auth/codeEmail',
    title: 'Code sent to the login email',
    surface,
    fixtureOnly: true,
    managers,
    open: code({
      _: 'auth.sentCodeTypeEmailCode',
      pFlags: {},
      email_pattern: EMAIL_PATTERN,
      length: 6,
      reset_available_period: 86400
    })
  },
  {
    id: 'auth/codeEmailResetPending',
    title: 'Login email being reset',
    surface,
    fixtureOnly: true,
    managers,
    open: code({
      _: 'auth.sentCodeTypeEmailCode',
      pFlags: {},
      email_pattern: EMAIL_PATTERN,
      length: 6,
      reset_pending_date: Math.floor(Date.now() / 1000) + 3600
    })
  }
]);
