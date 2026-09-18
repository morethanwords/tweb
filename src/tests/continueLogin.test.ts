import {describe, expect, it, vi} from 'vitest';

import {AuthSentCode, User} from '@layer';

import {continueLogin} from '@/pages/continueLogin';

vi.mock('@components/toast', () => ({toastNew: vi.fn()}));

const PHONE = '+99966 123456';

function makeFlow(overrides?: Partial<Parameters<typeof continueLogin>[1]>) {
  const setUser = vi.fn().mockResolvedValue(undefined);
  const flow = {
    managers: {apiManager: {setUser}} as any,
    navigate: vi.fn(),
    toIm: vi.fn(),
    phone_number: PHONE,
    ...overrides
  };

  return {flow, setUser};
}

const USER = {_: 'user', id: 1} as User.user;

describe('continueLogin', () => {
  it('routes an ordinary sent code to the card that owns it', async() => {
    const {flow} = makeFlow();
    const answer: AuthSentCode = {
      _: 'auth.sentCode',
      type: {_: 'auth.sentCodeTypeSms', length: 5},
      phone_code_hash: 'hash'
    };

    await continueLogin(answer, flow);

    expect(flow.navigate).toHaveBeenCalledWith({
      name: 'authCode',
      payload: expect.objectContaining({phone_code_hash: 'hash', phone_number: PHONE})
    });
  });

  it('lets the caller consume a sent code itself', async() => {
    // the code card applies a resent code in place instead of re-entering itself
    const onSentCode = vi.fn();
    const {flow} = makeFlow({onSentCode});

    await continueLogin({
      _: 'auth.sentCode',
      type: {_: 'auth.sentCodeTypeSms', length: 5},
      phone_code_hash: 'hash'
    }, flow);

    expect(onSentCode).toHaveBeenCalledWith(expect.objectContaining({phone_number: PHONE}));
    expect(flow.navigate).not.toHaveBeenCalled();
  });

  it('finishes a login that needed no code at all', async() => {
    const {flow, setUser} = makeFlow();

    await continueLogin({
      _: 'auth.sentCodeSuccess',
      authorization: {_: 'auth.authorization', pFlags: {}, user: USER}
    }, flow);

    expect(setUser).toHaveBeenCalledWith(USER);
    expect(flow.toIm).toHaveBeenCalled();
  });

  it('sends a codeless login that needs an account to sign-up', async() => {
    // auth.sentCodeSuccess carries no hash of its own — signing up needs the one
    // the request was made with
    const {flow} = makeFlow({phone_code_hash: 'hash'});

    await continueLogin({
      _: 'auth.sentCodeSuccess',
      authorization: {_: 'auth.authorizationSignUpRequired'}
    }, flow);

    expect(flow.navigate).toHaveBeenCalledWith({
      name: 'signUp',
      payload: {phone_number: PHONE, phone_code_hash: 'hash'}
    });
  });

  it('falls back to the phone number when there is no hash to sign up with', async() => {
    // the very first auth.sendCode has no previous hash, so there is nothing to
    // continue with — stranding the user on the card would be the alternative
    const {flow} = makeFlow();
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});

    await continueLogin({
      _: 'auth.sentCodeSuccess',
      authorization: {_: 'auth.authorizationSignUpRequired'}
    }, flow);

    expect(flow.navigate).toHaveBeenCalledWith({name: 'signIn'});
    expect(flow.toIm).not.toHaveBeenCalled();
    error.mockRestore();
  });
});
