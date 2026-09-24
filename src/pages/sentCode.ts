import type {AuthSentCode, AuthSentCodeType} from '@layer';
import type {LangPackKey} from '@lib/langPack';

import type {CardSpec} from '@/pages/authFlow';

/**
 * Everything the auth flow needs to know about an `auth.sentCode`, in one place.
 *
 * `auth.sendCode`, `auth.resendCode`, `auth.resetLoginEmail` and the `sent_code`
 * inside `account.emailVerifiedLogin` all answer with the same type, and each of
 * them can switch the login to a different kind of code mid-flow — so every one
 * of them routes through `sentCodeToCardSpec()` rather than assuming the code
 * card.
 */

export type SentCode = AuthSentCode.authSentCode & {
  phone_number?: string,
  /**
   * When `auth.resendCode` becomes available, in `tsNow(true)` seconds. Fixed the
   * first time the code is shown and stored with it, so a reload carries on with
   * the countdown instead of starting it over.
   */
  resend_deadline?: number
};

/** How the code is typed in: digit boxes, or a free-text field for a word/phrase. */
export type CodeInputKind = 'digits' | 'text';

/** Falls back to 5 the way the other clients do when the type carries no length. */
const DEFAULT_CODE_LENGTH = 5;

/** `auth.resendCode` keeps the phone number, which only the tab (not the server) knows. */
export function withPhoneNumber(sentCode: AuthSentCode, phone_number: string): SentCode {
  return Object.assign(sentCode as AuthSentCode.authSentCode, {phone_number});
}

export function getCodeInputKind(type: AuthSentCodeType): CodeInputKind {
  return type._ === 'auth.sentCodeTypeSmsWord' || type._ === 'auth.sentCodeTypeSmsPhrase' ?
    'text' :
    'digits';
}

export function getCodeLength(type: AuthSentCodeType): number {
  return (type as AuthSentCodeType.authSentCodeTypeApp).length ?? DEFAULT_CODE_LENGTH;
}

/**
 * The word/phrase types carry the start of the secret the SMS holds, so the
 * client can reject a typo before spending a server attempt.
 */
export function getCodeBeginning(type: AuthSentCodeType): string | undefined {
  return type._ === 'auth.sentCodeTypeSmsWord' || type._ === 'auth.sentCodeTypeSmsPhrase' ?
    type.beginning :
    undefined;
}

/** Whether what the user typed can still grow into the expected word/phrase. */
export function beginsOk(value: string, beginning: string | undefined): boolean {
  if(!beginning) return true;
  const typed = value.trimStart().toLowerCase();
  const expected = beginning.toLowerCase();
  const length = Math.min(typed.length, expected.length);
  if(length <= 0) return true;
  return typed.slice(0, length) === expected.slice(0, length);
}

/**
 * The code is sent as `phone_code` everywhere except for a login email, where it
 * proves the email instead and travels in `email_verification`.
 */
export function isEmailCode(type: AuthSentCodeType): boolean {
  return type._ === 'auth.sentCodeTypeEmailCode';
}

/**
 * The `phone_code_hash` the whole sign-in hangs on is dead, so there is nothing
 * left to continue — the flow has to start over from the phone number. Worth
 * checking wherever a step other than the code card spends that hash (adding a
 * login email can take longer than the code stays valid), because the auth cards
 * have no back button to get out of a dead end with.
 */
export function isPhoneLoginExpired(err: ApiError): boolean {
  return err.type === 'PHONE_CODE_EXPIRED' ||
    err.type === 'PHONE_CODE_EMPTY' ||
    err.type === 'PHONE_CODE_INVALID';
}

/** Which card continues the login for the code the server just sent. */
export function sentCodeToCardSpec(sentCode: SentCode): CardSpec {
  if(sentCode.type._ === 'auth.sentCodeTypeSetUpEmailRequired') {
    return {
      name: 'emailSetup',
      payload: {
        phone_number: sentCode.phone_number,
        phone_code_hash: sentCode.phone_code_hash
      }
    };
  }

  return {name: 'authCode', payload: sentCode};
}

/**
 * The label offering the next delivery method once the countdown runs out —
 * `next_type` says what `auth.resendCode` will send.
 */
export function getResendLangKey(nextType: AuthSentCode.authSentCode['next_type']): LangPackKey | undefined {
  switch(nextType?._) {
    case 'auth.codeTypeSms':
      return 'Login.Code.ResendSms';
    case 'auth.codeTypeCall':
    case 'auth.codeTypeMissedCall':
    case 'auth.codeTypeFlashCall':
      return 'Login.Code.ResendCall';
    case 'auth.codeTypeFragmentSms':
      return 'Login.Code.ResendFragment';
    default:
      return undefined;
  }
}

/** The countdown shown until that method becomes available. */
export function getResendPendingLangKey(nextType: AuthSentCode.authSentCode['next_type']): LangPackKey {
  return nextType?._ === 'auth.codeTypeCall' ||
    nextType?._ === 'auth.codeTypeMissedCall' ||
    nextType?._ === 'auth.codeTypeFlashCall' ?
    'Login.Code.CallAvailableIn' :
    'Login.Code.SmsAvailableIn';
}

/**
 * Seconds until the next method is offered: the server's `timeout`, and none at
 * all when it names none, the way iOS does it. A code via Fragment is there to
 * be picked up the moment it is asked for, so it is offered straight away even
 * with a timeout, the way Android does it.
 */
export function getResendTimeout(sentCode: SentCode): number {
  if(sentCode.next_type?._ === 'auth.codeTypeFragmentSms') return 0;
  return sentCode.timeout || 0;
}
