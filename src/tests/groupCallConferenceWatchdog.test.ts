/*
 * Conference-sync watchdog (GroupCallInstance) + the manager signal it keys off.
 *
 * Background: a TdE2E conference whose cached `groupCall` goes missing/discarded
 * makes BOTH pollers (pollE2eChain, refreshConferenceParticipants) bail SILENTLY
 * — media keeps flowing but unmutes/joins stop being learned, so a participant
 * who unmutes is seen but not heard (their audio SSRC never enters the e2e recv
 * map). Observed live as a ~19-minute stall that only cleared on manual re-join.
 *
 * The watchdog detects that stall (a poller hasn't reached the server in a
 * while) and forces recovery; these tests pin the wiring deterministically so we
 * don't have to wait for the bug in the wild.
 */

import {beforeEach, describe, expect, it, vi} from 'vitest';

// Stub the e2e worker host so importing GroupCallInstance (→ groupCallsController
// → encryptWorkerHost → `?worker`) doesn't try to spawn a real Web Worker.
vi.mock('@lib/calls/e2e/encryptWorkerHost', () => {
  class EncryptWorkerHost {
    public async terminate(): Promise<void> {}
  }
  return {EncryptWorkerHost};
});

import GroupCallInstance from '@lib/calls/groupCallInstance';
import {AppGroupCallsManager} from '@lib/appManagers/appGroupCallsManager';

const FAKE_CALL = {_: 'groupCall', id: '777', access_hash: '888'} as any;

function makeInstance() {
  const getGroupCallFull = vi.fn(async() => FAKE_CALL);
  const saveGroupCall = vi.fn(async() => {});
  const managers: any = {
    appGroupCallsManager: {getGroupCallFull, saveGroupCall, refreshConferenceParticipants: vi.fn(async() => false)},
    appCallsManager: {},
    apiUpdatesManager: {processUpdateMessage: () => {}}
  };
  const instance = new GroupCallInstance({id: '777' as any, chatId: 0 as any, managers});
  // connectionState getter reads connections.main.connection.iceConnectionState.
  (instance as any).connections = {main: {connection: {iceConnectionState: 'connected'}}};
  (instance as any).e2e = {}; // truthy = conference mode
  (instance as any).groupCall = FAKE_CALL;
  // Isolate the watchdog→recovery wiring from the pollers' own internals.
  const pollSpy = vi.spyOn(instance as any, 'pollE2eChain').mockResolvedValue(undefined);
  const refreshSpy = vi.spyOn(instance as any, 'refreshConferenceParticipants').mockResolvedValue(undefined);
  return {instance, getGroupCallFull, saveGroupCall, pollSpy, refreshSpy};
}

describe('GroupCallInstance — conference-sync watchdog', () => {
  beforeEach(() => {
    (self as any).__conferenceBug = undefined;
    (self as any).__conferenceBugs = [];
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    // jsdom has no real <audio>.play(); the constructor's fixSafariAudio calls it.
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
  });

  it('forces recovery + reports a bug when a poller has not reached the server', async() => {
    const {instance, getGroupCallFull, saveGroupCall, pollSpy, refreshSpy} = makeInstance();
    (instance as any).lastChainPollAt = 0; // long stale
    (instance as any).lastParticipantsRefreshAt = 0;

    (instance as any).e2eWatchdogTick();

    // Re-seed cache from our copy, force a fresh fetch, re-kick both pollers.
    await vi.waitFor(() => expect(getGroupCallFull).toHaveBeenCalledWith('777', true));
    expect(saveGroupCall).toHaveBeenCalledTimes(1);
    expect(pollSpy).toHaveBeenCalled();
    expect(refreshSpy).toHaveBeenCalled();

    // User-facing breadcrumb is set so the user knows to export logs.
    expect((self as any).__conferenceBug?.reason).toMatch(/stalled/i);
    expect((self as any).__conferenceBugs.length).toBe(1);
  });

  it('does nothing while pollers are fresh', async() => {
    const {instance, getGroupCallFull, pollSpy} = makeInstance();
    (instance as any).lastChainPollAt = Date.now();
    (instance as any).lastParticipantsRefreshAt = Date.now();

    (instance as any).e2eWatchdogTick();
    await new Promise((r) => setTimeout(r, 5));

    expect(getGroupCallFull).not.toHaveBeenCalled();
    expect(pollSpy).not.toHaveBeenCalled();
    expect((self as any).__conferenceBug).toBeUndefined();
  });

  it('does nothing while the connection is closed', async() => {
    const {instance, getGroupCallFull} = makeInstance();
    (instance as any).connections.main.connection.iceConnectionState = 'closed';
    (instance as any).lastChainPollAt = 0;
    (instance as any).lastParticipantsRefreshAt = 0;

    (instance as any).e2eWatchdogTick();
    await new Promise((r) => setTimeout(r, 5));

    expect(getGroupCallFull).not.toHaveBeenCalled();
  });

  it('does not re-trigger once a poll has freshly stamped the clock', async() => {
    const {instance, getGroupCallFull} = makeInstance();
    (instance as any).lastChainPollAt = 0;
    (instance as any).lastParticipantsRefreshAt = 0;

    (instance as any).e2eWatchdogTick();
    await vi.waitFor(() => expect(getGroupCallFull).toHaveBeenCalledTimes(1));

    // Simulate the pollers having reached the server.
    (instance as any).lastChainPollAt = Date.now();
    (instance as any).lastParticipantsRefreshAt = Date.now();

    (instance as any).e2eWatchdogTick();
    await new Promise((r) => setTimeout(r, 5));
    expect(getGroupCallFull).toHaveBeenCalledTimes(1); // not called again
  });
});

describe('AppGroupCallsManager.refreshConferenceParticipants — silent-bail signal', () => {
  it('resolves false when the call is not cached (so the watchdog can detect the stall)', async() => {
    const manager = new AppGroupCallsManager();
    Object.assign(manager as any, {
      groupCalls: new Map(),
      log: Object.assign(() => {}, {warn: () => {}, error: () => {}, info: () => {}, debug: () => {}})
    });

    await expect(manager.refreshConferenceParticipants('not-cached' as any)).resolves.toBe(false);
  });
});
