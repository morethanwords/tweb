/*
 * updatePhoneCall routing between tabs. A ringing request goes to exactly one
 * tab (one popup, one ringtone); every later state of the call has to reach
 * ALL tabs of the account, because the CallInstance lives in whichever tab the
 * call started in. Routing those by idle time as well lost phoneCallDiscarded
 * and phoneCall the moment the user focused another tab mid-call.
 */
import {beforeEach, describe, expect, it, vi} from 'vitest';

const mocks = vi.hoisted(() => ({
  getTabs: vi.fn(),
  invokeVoid: vi.fn()
}));

vi.mock('@appManagers/appTabsManager', () => ({default: {getTabs: mocks.getTabs}}));
vi.mock('@lib/mainWorker/mainMessagePort', () => ({
  default: {getInstance: () => ({invokeVoid: mocks.invokeVoid})}
}));

import {AppCallsManager} from '@appManagers/appCallsManager';

const ACCOUNT = 1;
const CALL_ID = '900';

// A factory: saveCall keeps the first object it sees for a call id and
// safeReplaceObject mutates it in place on every later state.
const requested = () => ({
  _: 'phoneCallRequested',
  id: CALL_ID,
  access_hash: '1',
  admin_id: '5',
  participant_id: '77',
  date: 1,
  pFlags: {}
}) as any;

function makeManager() {
  const dispatchEvent = vi.fn();
  const manager = new AppCallsManager();
  Object.assign(manager as any, {
    calls: new Map(),
    rootScope: {dispatchEvent},
    getAccountNumber: () => ACCOUNT,
    log: Object.assign(vi.fn(), {warn: vi.fn(), error: vi.fn()})
  });
  return {dispatchEvent, manager};
}

const TABS = [
  {source: 'idle-tab', state: {accountNumber: ACCOUNT, idleStartTime: 1000}},
  {source: 'other-account', state: {accountNumber: 2, idleStartTime: 0}},
  {source: 'active-tab', state: {accountNumber: ACCOUNT, idleStartTime: 0}}
];

describe('AppCallsManager call_update routing', () => {
  beforeEach(() => {
    mocks.getTabs.mockReset();
    mocks.invokeVoid.mockReset();
  });

  it('rings exactly one tab: the least idle one of the account', () => {
    mocks.getTabs.mockReturnValue(TABS.map((tab) => ({...tab, state: {...tab.state}})));
    const {dispatchEvent, manager} = makeManager();

    manager.saveCall(requested());

    expect(mocks.invokeVoid).toHaveBeenCalledTimes(1);
    const [name, payload, target] = mocks.invokeVoid.mock.calls[0];
    expect(name).toBe('event');
    expect(payload).toMatchObject({name: 'call_update', accountNumber: ACCOUNT});
    expect(target).toBe('active-tab');
    expect(dispatchEvent).not.toHaveBeenCalled();
  });

  it('broadcasts every later state to all tabs of the account', () => {
    mocks.getTabs.mockReturnValue(TABS.map((tab) => ({...tab, state: {...tab.state}})));
    const {dispatchEvent, manager} = makeManager();
    manager.saveCall(requested());
    mocks.invokeVoid.mockClear();

    const later = [
      {_: 'phoneCallWaiting', id: CALL_ID},
      {_: 'phoneCallAccepted', id: CALL_ID},
      {_: 'phoneCall', id: CALL_ID},
      {_: 'phoneCallDiscarded', id: CALL_ID, reason: {_: 'phoneCallDiscardReasonHangup'}}
    ];
    for(const call of later) {
      manager.saveCall(call as any);
      expect(dispatchEvent).toHaveBeenLastCalledWith('call_update', expect.objectContaining({_: call._, id: CALL_ID}));
    }
    expect(dispatchEvent).toHaveBeenCalledTimes(later.length);
    expect(mocks.invokeVoid).not.toHaveBeenCalled();
    expect(manager.getCall(CALL_ID)).toBeUndefined();
  });

  it('falls back to a cross-account notification when no tab of the account is open', () => {
    mocks.getTabs.mockReturnValue([{source: 'other', state: {accountNumber: 2, idleStartTime: 0}}]);
    const {dispatchEvent, manager} = makeManager();

    manager.saveCall(requested());

    expect(mocks.invokeVoid).toHaveBeenCalledWith('callNotification', expect.objectContaining({
      callId: CALL_ID,
      accountNumber: ACCOUNT
    }));
    expect(dispatchEvent).not.toHaveBeenCalled();
  });
});
