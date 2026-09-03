/*
 * tdesktop `Api::Authorizations::callsDisabledHere()`: the current session's
 * `call_requests_disabled`, read by the conference-invite ring gate. A failed
 * fetch counts as enabled — a network hiccup must not silence a call.
 */
import {describe, expect, it, vi} from 'vitest';

vi.mock('@lib/accounts/accountController', () => ({default: {}}));

import AppAccountManager from '@appManagers/appAccountManager';

function makeManager(result: Promise<unknown>) {
  const manager = new AppAccountManager();
  manager.getAuthorizations = vi.fn(() => result) as any;
  return manager;
}

const authorization = (current: boolean, disabled: boolean) => ({
  _: 'authorization',
  hash: current ? '1' : '2',
  pFlags: {
    ...(current ? {current: true} : {}),
    ...(disabled ? {call_requests_disabled: true} : {})
  }
});

describe('AppAccountManager.isCallRequestsDisabled', () => {
  it('reads the flag of the current session only', async() => {
    const disabledHere = makeManager(Promise.resolve({
      authorizations: [authorization(false, false), authorization(true, true)]
    }));
    const disabledElsewhere = makeManager(Promise.resolve({
      authorizations: [authorization(false, true), authorization(true, false)]
    }));

    await expect(disabledHere.isCallRequestsDisabled()).resolves.toBe(true);
    await expect(disabledElsewhere.isCallRequestsDisabled()).resolves.toBe(false);
  });

  it('counts a failed fetch as enabled', async() => {
    const manager = makeManager(Promise.reject(new Error('NETWORK_BAD_REQUEST')));

    await expect(manager.isCallRequestsDisabled()).resolves.toBe(false);
  });
});
