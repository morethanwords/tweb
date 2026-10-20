/*
 * A call belongs to the account it was placed or answered on: the tab may switch to another account
 * while it runs. The call is handed managers tied to its account for good (the tab's own follow whichever
 * account it shows), and while it lives what is said about it is taken from its own account only.
 */
import {describe, expect, it, vi} from 'vitest';

vi.mock('@lib/rootScope', () => ({default: {myId: 77}}));

import {captureCallAccount, getCallAccountOf, hasCallInTab, holdCall, holdEndedCall, takesCallEvent} from '@lib/calls/callAccount';
import bindManagersToAccount, {registerAccountBinder} from '@lib/accounts/bindManagersToAccount';
import {getCurrentAccount, setCurrentAccount} from '@lib/accounts/getCurrentAccount';

describe('callAccount', () => {
  it('ties the tab\'s managers to the account the tab shows when the call starts', () => {
    const followsTab = {name: 'follows the tab'};
    const tiedTo: number[] = [];
    registerAccountBinder(followsTab, {
      bind: (accountNumber) => {
        tiedTo.push(accountNumber);
        return {name: 'tied', accountNumber};
      },
      session: () => followsTab
    });

    const account = captureCallAccount(followsTab as any);

    expect(account).toEqual({
      accountNumber: getCurrentAccount(),
      managers: {name: 'tied', accountNumber: getCurrentAccount()},
      myId: 77
    });
    expect(tiedTo).toEqual([getCurrentAccount()]);
  });

  it('keeps managers already tied to an account, and a test\'s, as they are', () => {
    const managers = {name: 'already tied'};

    expect(bindManagersToAccount(managers, 2)).toBe(managers);
    expect(captureCallAccount(managers as any).managers).toBe(managers);
  });

  it('carries the account of a call over to the one that takes over from it', () => {
    const call = {accountNumber: 2, managers: {}, myId: 5, other: 'not an account'};

    expect(getCallAccountOf(call as any)).toEqual({accountNumber: 2, managers: call.managers, myId: 5});
  });

  it('takes what is said about a call living here from its own account only', () => {
    const shown = getCurrentAccount();
    const other = shown === 1 ? 2 : 1;
    const call = holdCall(other);
    call.setId('700');

    // * the account shown follows the same call - a member of its chat - and sees it otherwise
    expect(takesCallEvent('group_call_participant', [{groupCallId: '700'}], shown)).toBe(false);
    expect(takesCallEvent('group_call_participant', [{groupCallId: 700}], other)).toBe(true);
    expect(takesCallEvent('group_call_update', [{id: '700'}], other)).toBe(true);
    expect(takesCallEvent('group_call_chain_blocks', [{callId: '700'}], shown)).toBe(false);
    // * anything else is left to the usual rules
    expect(takesCallEvent('group_call_update', [{id: '701'}], other)).toBeUndefined();
    expect(takesCallEvent('history_append', [{peerId: 1}], other)).toBeUndefined();

    // * a P2P call learns its id once requested
    const p2p = holdCall(other);
    expect(takesCallEvent('call_update', [{id: '800'}], shown)).toBeUndefined();
    p2p.setId('800');
    expect(takesCallEvent('call_signaling', [{callId: '800'}], shown)).toBe(false);
    expect(takesCallEvent('call_update', [{id: '800'}], other)).toBe(true);

    call.release();
    p2p.release();
    expect(takesCallEvent('group_call_participant', [{groupCallId: '700'}], shown)).toBeUndefined();
  });

  it('knows a reload would end a call - or an invitation still ringing - living in the tab', () => {
    expect(hasCallInTab()).toBe(false);
    const invitation = holdCall(getCurrentAccount());
    expect(hasCallInTab()).toBe(true);
    invitation.release();
    expect(hasCallInTab()).toBe(false);
  });

  it('hears the last word on an ended call from its account, with nothing left in the tab', () => {
    const shown = getCurrentAccount();
    const other = shown === 1 ? 2 : 1;
    const release = holdEndedCall(other, '900');

    // * the discard that may ask for a rating comes from the call's account, not from the one shown
    expect(takesCallEvent('call_update', [{id: '900'}], other)).toBe(true);
    expect(takesCallEvent('call_update', [{id: '900'}], shown)).toBe(false);
    expect(hasCallInTab()).toBe(false);

    release();
    expect(takesCallEvent('call_update', [{id: '900'}], other)).toBeUndefined();
  });

  it('still names the call\'s account after the tab has switched away from it', () => {
    const shown = getCurrentAccount();
    const followsTab = {};
    registerAccountBinder(followsTab, {bind: (accountNumber) => ({accountNumber}), session: () => followsTab});

    try {
      const account = captureCallAccount(followsTab as any);
      setCurrentAccount(shown === 1 ? 2 : 1);

      expect(account.accountNumber).toBe(shown);
      expect(account.managers).toEqual({accountNumber: shown});
    } finally {
      setCurrentAccount(shown);
    }
  });
});
