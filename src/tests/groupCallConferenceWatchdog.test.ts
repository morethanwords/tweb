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
    // jsdom has no real <audio>.play(); the constructor's fixSafariAudio calls it.
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
  });

  it('forces recovery + reports a bug when a poller has not reached the server', async() => {
    const {instance, getGroupCallFull, saveGroupCall, pollSpy, refreshSpy} = makeInstance();
    const logError = vi.spyOn((instance as any).log, 'error');
    (instance as any).lastChainPollAt = performance.now() - 16000;
    (instance as any).lastParticipantsRefreshAt = performance.now() - 16000;

    (instance as any).e2eWatchdogTick();

    // Re-seed cache from our copy, force a fresh fetch, re-kick both pollers.
    await vi.waitFor(() => expect(getGroupCallFull).toHaveBeenCalledWith('777', true));
    expect(saveGroupCall).toHaveBeenCalledTimes(1);
    expect(pollSpy).toHaveBeenCalled();
    expect(refreshSpy).toHaveBeenCalled();

    expect(logError).toHaveBeenCalledWith(
      'CONFERENCE BUG —',
      expect.stringMatching(/stalled/i),
      expect.objectContaining({reason: expect.stringMatching(/stalled/i)})
    );
  });

  it('escalates to a full rejoin after repeated unproductive recoveries', async() => {
    // A local re-hydrate cannot re-anchor a chain cursor the server compacted
    // past (or conjure a roster it refuses to serve) — looping it every tick
    // for the rest of the call was the failure mode. After a bounded number of
    // recoveries that failed to advance the stale clock, the instance must
    // hand the problem to the controller's full rejoin, which re-anchors both.
    const {instance} = makeInstance();
    const recoverySpy = vi.spyOn(instance as any, 'requestConferenceRecovery');

    for(let round = 0; round < 3; ++round) {
      (instance as any).lastChainPollAt = performance.now() - 16000;
      (instance as any).lastParticipantsRefreshAt = performance.now() - 16000;
      (instance as any).e2eWatchdogTick();
      await vi.waitFor(() => expect((instance as any).recoveringConferenceSync).toBe(false));
    }

    expect(recoverySpy).toHaveBeenCalledWith('sync-unrecoverable-locally');
    expect((instance as any).conferenceRecoveryDispatched).toBe(true);
  });

  it('resets the unproductive-recovery streak when a recovery unsticks the clocks', async() => {
    const {instance} = makeInstance();
    const recoverySpy = vi.spyOn(instance as any, 'requestConferenceRecovery');

    for(let round = 0; round < 2; ++round) {
      (instance as any).lastChainPollAt = performance.now() - 16000;
      (instance as any).lastParticipantsRefreshAt = performance.now() - 16000;
      (instance as any).e2eWatchdogTick();
      await vi.waitFor(() => expect((instance as any).recoveringConferenceSync).toBe(false));
    }
    expect((instance as any).unproductiveSyncRecoveries).toBe(2);

    // This recovery succeeds: the re-kicked pollers stamp the clocks.
    (instance as any).lastChainPollAt = performance.now() - 16000;
    (instance as any).lastParticipantsRefreshAt = performance.now() - 16000;
    (instance as any).pollE2eChain.mockImplementation(async() => {
      (instance as any).lastChainPollAt = performance.now();
    });
    (instance as any).refreshConferenceParticipants.mockImplementation(async() => {
      (instance as any).lastParticipantsRefreshAt = performance.now();
    });
    (instance as any).e2eWatchdogTick();
    await vi.waitFor(() => expect((instance as any).recoveringConferenceSync).toBe(false));

    expect((instance as any).unproductiveSyncRecoveries).toBe(0);
    expect(recoverySpy).not.toHaveBeenCalled();
  });

  it('does nothing while pollers are fresh', async() => {
    const {instance, getGroupCallFull, pollSpy} = makeInstance();
    const logError = vi.spyOn((instance as any).log, 'error');
    (instance as any).lastChainPollAt = performance.now();
    (instance as any).lastParticipantsRefreshAt = performance.now();

    (instance as any).e2eWatchdogTick();
    await new Promise((r) => setTimeout(r, 5));

    expect(getGroupCallFull).not.toHaveBeenCalled();
    expect(pollSpy).not.toHaveBeenCalled();
    expect(logError).not.toHaveBeenCalled();
  });

  it('does nothing while the connection is closed', async() => {
    const {instance, getGroupCallFull} = makeInstance();
    (instance as any).connections.main.connection.iceConnectionState = 'closed';
    (instance as any).lastChainPollAt = performance.now() - 16000;
    (instance as any).lastParticipantsRefreshAt = performance.now() - 16000;

    (instance as any).e2eWatchdogTick();
    await new Promise((r) => setTimeout(r, 5));

    expect(getGroupCallFull).not.toHaveBeenCalled();
  });

  it('does not re-trigger once a poll has freshly stamped the clock', async() => {
    const {instance, getGroupCallFull} = makeInstance();
    (instance as any).lastChainPollAt = performance.now() - 16000;
    (instance as any).lastParticipantsRefreshAt = performance.now() - 16000;

    (instance as any).e2eWatchdogTick();
    await vi.waitFor(() => expect(getGroupCallFull).toHaveBeenCalledTimes(1));

    // Simulate the pollers having reached the server.
    (instance as any).lastChainPollAt = performance.now();
    (instance as any).lastParticipantsRefreshAt = performance.now();

    (instance as any).e2eWatchdogTick();
    await new Promise((r) => setTimeout(r, 5));
    expect(getGroupCallFull).toHaveBeenCalledTimes(1); // not called again
  });

  it('observes an unexpected detached recovery rejection', async() => {
    const {instance} = makeInstance();
    const recoveryError = new Error('unexpected recovery failure');
    vi.spyOn(instance as any, 'recoverConferenceSync').mockRejectedValue(recoveryError);
    const logError = vi.spyOn((instance as any).log, 'error');
    (instance as any).lastChainPollAt = performance.now() - 16000;
    (instance as any).lastParticipantsRefreshAt = performance.now() - 16000;

    (instance as any).e2eWatchdogTick();

    await vi.waitFor(() => expect(logError).toHaveBeenCalledWith(
      'conference watchdog recovery failed',
      recoveryError
    ));
  });

  it('uses monotonic elapsed time when the wall clock moves backward', async() => {
    const wallClock = vi.spyOn(Date, 'now').mockReturnValue(2_000_000_000_000);
    const monotonicClock = vi.spyOn(performance, 'now').mockReturnValue(50_000);
    try {
      const {instance, getGroupCallFull} = makeInstance();
      (instance as any).lastChainPollAt = performance.now();
      (instance as any).lastParticipantsRefreshAt = performance.now();

      wallClock.mockReturnValue(1_000_000_000_000);
      monotonicClock.mockReturnValue(66_000);
      (instance as any).e2eWatchdogTick();

      await vi.waitFor(() => expect(getGroupCallFull).toHaveBeenCalledWith('777', true));
    } finally {
      wallClock.mockRestore();
      monotonicClock.mockRestore();
    }
  });

  it('hydrates the self participant through the existing roster refresh loop', async() => {
    const refreshConferenceParticipants = vi.fn(async() => ({complete: true, userIds: []}));
    const managers: any = {
      appGroupCallsManager: {
        refreshConferenceParticipants,
        getCachedParticipants: vi.fn(() => [])
      },
      appCallsManager: {},
      apiUpdatesManager: {processUpdateMessage: () => {}}
    };
    const instance = new GroupCallInstance({id: '777' as any, chatId: 0 as any, managers});
    (instance as any).connections = {main: {connection: {iceConnectionState: 'connected'}}};
    (instance as any).e2e = {};
    (instance as any).groupCall = FAKE_CALL;
    vi.spyOn(instance as any, 'reconcileConferenceMembership').mockResolvedValue(undefined);

    instance.requestSelfParticipantHydration();
    await vi.waitFor(() => expect(refreshConferenceParticipants).toHaveBeenCalledTimes(1));
    expect(refreshConferenceParticipants).toHaveBeenLastCalledWith('777', {includeSelf: true});

    await (instance as any).refreshConferenceParticipants();
    expect(refreshConferenceParticipants).toHaveBeenLastCalledWith('777', {includeSelf: true});

    instance.participant = {pFlags: {self: true}} as any;
    await (instance as any).refreshConferenceParticipants();
    expect(refreshConferenceParticipants).toHaveBeenLastCalledWith('777', undefined);
    expect((instance as any).selfParticipantHydrationRequested).toBe(false);
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
