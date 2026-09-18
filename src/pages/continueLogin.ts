import {toastNew} from '@components/toast';
import {AuthSentCode} from '@layer';
import type rootScope from '@lib/rootScope';

import type {CardSpec} from '@/pages/authFlow';
import {SentCode, sentCodeToCardSpec, withPhoneNumber} from '@/pages/sentCode';

/**
 * Takes the next step after the server answered the login.
 *
 * `auth.sendCode`, `auth.resendCode` and the `sent_code` inside
 * `account.emailVerifiedLogin` all answer with `auth.SentCode`, and all three of
 * them can come back as `auth.sentCodeSuccess` — the login finished without a
 * code at all. That variant carries an `auth.Authorization`, which is itself two
 * things: a real authorization, or `authorizationSignUpRequired` for a number
 * with no account yet. Every caller used to look only at the first one and drop
 * the rest on the floor, which stranded the card it was on.
 */
export type LoginContinuation = {
  managers: typeof rootScope.managers,
  navigate: (spec: CardSpec) => void,
  toIm: () => void | Promise<void>,
  phone_number: string,
  /**
   * The hash the answer was requested with. `auth.signUp` still needs one, and
   * `auth.sentCodeSuccess` carries none of its own — the very first
   * `auth.sendCode` therefore has nothing to pass here.
   */
  phone_code_hash?: string,
  /**
   * What to do with an ordinary `auth.sentCode`. The default navigates to
   * whichever card owns it; the code card overrides this to apply the new code
   * in place instead of re-entering itself.
   */
  onSentCode?: (sentCode: SentCode) => void
};

export async function continueLogin(answer: AuthSentCode, flow: LoginContinuation): Promise<void> {
  if(answer._ !== 'auth.sentCodeSuccess') {
    const sentCode = withPhoneNumber(answer, flow.phone_number);
    (flow.onSentCode ?? ((code) => flow.navigate(sentCodeToCardSpec(code))))(sentCode);
    return;
  }

  const {authorization} = answer;
  if(authorization._ === 'auth.authorization') {
    await flow.managers.apiManager.setUser(authorization.user);
    await flow.toIm();
    return;
  }

  if(flow.phone_code_hash) {
    flow.navigate({
      name: 'signUp',
      payload: {phone_number: flow.phone_number, phone_code_hash: flow.phone_code_hash}
    });
    return;
  }

  // Signing up needs a `phone_code_hash` and this answer never had one, so there
  // is no way forward — send the user back to the phone number rather than
  // leaving them on a card that can no longer do anything.
  console.error('auth: sign-up required, but no phone_code_hash to sign up with', answer);
  toastNew({langPackKey: 'Error.AnError'});
  flow.navigate({name: 'signIn'});
}
