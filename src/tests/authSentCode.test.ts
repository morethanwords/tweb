import {describe, expect, it} from 'vitest';

import {AuthSentCode, AuthSentCodeType} from '@layer';

import {
  SentCode,
  beginsOk,
  getCodeBeginning,
  getCodeInputKind,
  getCodeLength,
  getResendLangKey,
  getResendPendingLangKey,
  getResendTimeout,
  isEmailCode,
  sentCodeToCardSpec,
  withPhoneNumber
} from '@/pages/sentCode';

const PHONE = '+99966 123456';

function sentCode(type: AuthSentCodeType, rest?: Partial<SentCode>): SentCode {
  return {
    _: 'auth.sentCode',
    type,
    phone_code_hash: 'hash',
    phone_number: PHONE,
    ...rest
  };
}

describe('auth sentCode routing', () => {
  it('sends a login-email requirement to the email-setup card', () => {
    // the login cannot continue until an address is attached, and the setup
    // purpose needs the pending phone login to tie it to
    const spec = sentCodeToCardSpec(sentCode({
      _: 'auth.sentCodeTypeSetUpEmailRequired',
      pFlags: {google_signin_allowed: true}
    }));

    expect(spec).toEqual({
      name: 'emailSetup',
      payload: {phone_number: PHONE, phone_code_hash: 'hash'}
    });
  });

  it('keeps every other type on the code card', () => {
    const types: AuthSentCodeType[] = [
      {_: 'auth.sentCodeTypeApp', length: 5},
      {_: 'auth.sentCodeTypeSms', length: 5},
      {_: 'auth.sentCodeTypeCall', length: 5},
      {_: 'auth.sentCodeTypeMissedCall', prefix: '+9996677', length: 4},
      {_: 'auth.sentCodeTypeFirebaseSms', length: 6},
      {_: 'auth.sentCodeTypeFragmentSms', url: 'https://fragment.com', length: 8},
      {_: 'auth.sentCodeTypeEmailCode', pFlags: {}, email_pattern: 'a**@b.com', length: 6},
      {_: 'auth.sentCodeTypeSmsWord', beginning: 'Tele'},
      {_: 'auth.sentCodeTypeSmsPhrase'}
    ];

    for(const type of types) {
      expect(sentCodeToCardSpec(sentCode(type)).name, type._).toBe('authCode');
    }
  });

  it('carries the phone number the server does not echo back', () => {
    const answer: AuthSentCode.authSentCode = {
      _: 'auth.sentCode',
      type: {_: 'auth.sentCodeTypeSms', length: 5},
      phone_code_hash: 'fresh'
    };

    expect(withPhoneNumber(answer, PHONE).phone_number).toBe(PHONE);
  });
});

describe('auth sentCode input shape', () => {
  it('asks for free text only for a word or a phrase', () => {
    expect(getCodeInputKind({_: 'auth.sentCodeTypeSmsWord'})).toBe('text');
    expect(getCodeInputKind({_: 'auth.sentCodeTypeSmsPhrase'})).toBe('text');
    expect(getCodeInputKind({_: 'auth.sentCodeTypeSms', length: 5})).toBe('digits');
    expect(getCodeInputKind({
      _: 'auth.sentCodeTypeEmailCode',
      pFlags: {},
      email_pattern: 'a**@b.com',
      length: 6
    })).toBe('digits');
  });

  it('takes the number of boxes from the type, or falls back', () => {
    expect(getCodeLength({_: 'auth.sentCodeTypeMissedCall', prefix: '+99', length: 4})).toBe(4);
    expect(getCodeLength({_: 'auth.sentCodeTypeSmsWord', beginning: 'Tele'})).toBe(5);
  });

  it('reads the disclosed beginning only off the word types', () => {
    expect(getCodeBeginning({_: 'auth.sentCodeTypeSmsWord', beginning: 'Tele'})).toBe('Tele');
    expect(getCodeBeginning({_: 'auth.sentCodeTypeSmsPhrase'})).toBeUndefined();
    expect(getCodeBeginning({_: 'auth.sentCodeTypeSms', length: 5})).toBeUndefined();
  });

  it('routes a login-email code through email_verification, nothing else', () => {
    expect(isEmailCode({
      _: 'auth.sentCodeTypeEmailCode',
      pFlags: {},
      email_pattern: 'a**@b.com',
      length: 6
    })).toBe(true);
    expect(isEmailCode({_: 'auth.sentCodeTypeSms', length: 5})).toBe(false);
  });
});

describe('secret word validation', () => {
  it('accepts anything when the server disclosed no beginning', () => {
    expect(beginsOk('whatever', undefined)).toBe(true);
  });

  it('accepts a prefix of the beginning, and the full word after it', () => {
    expect(beginsOk('', 'Telegram')).toBe(true);
    expect(beginsOk('Tel', 'Telegram')).toBe(true);
    expect(beginsOk('Telegram', 'Telegram')).toBe(true);
    // the beginning is only the start — the rest of the secret is unknown
    expect(beginsOk('Telegraphy', 'Telegr')).toBe(true);
  });

  it('ignores case and leading whitespace', () => {
    expect(beginsOk('  tELe', 'Telegram')).toBe(true);
  });

  it('rejects a word that starts differently', () => {
    expect(beginsOk('Wrong', 'Telegram')).toBe(false);
    expect(beginsOk('Tolegram', 'Telegram')).toBe(false);
  });
});

describe('resend labels', () => {
  it('names the method auth.resendCode will use', () => {
    expect(getResendLangKey({_: 'auth.codeTypeSms'})).toBe('Login.Code.ResendSms');
    expect(getResendLangKey({_: 'auth.codeTypeCall'})).toBe('Login.Code.ResendCall');
    expect(getResendLangKey({_: 'auth.codeTypeMissedCall'})).toBe('Login.Code.ResendCall');
    expect(getResendLangKey({_: 'auth.codeTypeFlashCall'})).toBe('Login.Code.ResendCall');
    expect(getResendLangKey({_: 'auth.codeTypeFragmentSms'})).toBe('Login.Code.ResendFragment');
  });

  it('offers nothing when the server named no next type', () => {
    // without a next_type there is nothing to resend — the row stays hidden
    expect(getResendLangKey(undefined)).toBeUndefined();
  });

  it('counts down in the wording of that method', () => {
    expect(getResendPendingLangKey({_: 'auth.codeTypeCall'})).toBe('Login.Code.CallAvailableIn');
    expect(getResendPendingLangKey({_: 'auth.codeTypeSms'})).toBe('Login.Code.SmsAvailableIn');
  });

  const app: AuthSentCodeType = {_: 'auth.sentCodeTypeApp', length: 5};

  it('waits out the server timeout, and not at all when there is none', () => {
    expect(getResendTimeout(sentCode(app, {next_type: {_: 'auth.codeTypeSms'}, timeout: 30}))).toBe(30);
    expect(getResendTimeout(sentCode(app, {next_type: {_: 'auth.codeTypeCall'}}))).toBe(0);
  });

  it('offers Fragment straight away, whatever the timeout', () => {
    expect(getResendTimeout(sentCode(app, {next_type: {_: 'auth.codeTypeFragmentSms'}, timeout: 120}))).toBe(0);
    expect(getResendTimeout(sentCode(app, {next_type: {_: 'auth.codeTypeFragmentSms'}}))).toBe(0);
  });
});
