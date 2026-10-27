/*
 * When a 1-on-1 call restarts ICE, and when it gives up (p2P/connectionRecovery).
 */
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import P2PConnectionRecovery, {
  P2P_CALLEE_RESTART_DELAY_MS,
  P2P_ICE_DISCONNECTED_RESTART_DELAY_MS,
  P2P_ICE_RESTART_MIN_INTERVAL_MS,
  P2P_ICE_RESTART_RETRY_MS,
  P2P_NEVER_CONNECTED_FAILURE_TIMEOUT_MS
} from '@lib/calls/p2P/connectionRecovery';

function makeRecovery(options: {isOutgoing?: boolean, restartResult?: () => boolean} = {}) {
  const windowTarget = new EventTarget();
  const networkInformation = Object.assign(new EventTarget(), {type: 'wifi', effectiveType: '4g'});
  const restart = vi.fn((_trigger: string) => options.restartResult ? options.restartResult() : true);
  const giveUp = vi.fn();
  const events: string[] = [];
  const recovery = new P2PConnectionRecovery({
    isOutgoing: options.isOutgoing ?? true,
    log: Object.assign(vi.fn(), {warn: vi.fn(), error: vi.fn()}) as any,
    restart,
    giveUp,
    onEvent: (event) => events.push(event),
    now: () => Date.now(),
    windowTarget,
    networkInformation
  });
  recovery.start();
  return {events, giveUp, networkInformation, recovery, restart, windowTarget};
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('P2P transport recovery: restart triggers', () => {
  it('restarts at once when ICE fails on the caller', () => {
    const {recovery, restart} = makeRecovery();
    recovery.setIceConnectionState('checking');
    recovery.setIceConnectionState('connected');
    recovery.setIceConnectionState('failed');

    expect(restart).toHaveBeenCalledTimes(1);
    expect(restart).toHaveBeenCalledWith('ice-failed');
  });

  it('restarts a disconnect only once it has lasted 2 s', () => {
    const {recovery, restart} = makeRecovery();
    recovery.setIceConnectionState('connected');
    recovery.setIceConnectionState('disconnected');

    vi.advanceTimersByTime(P2P_ICE_DISCONNECTED_RESTART_DELAY_MS - 1);
    expect(restart).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(restart).toHaveBeenCalledWith('ice-disconnected');
  });

  it('leaves a disconnect that heals within 2 s alone', () => {
    const {recovery, restart} = makeRecovery();
    recovery.setIceConnectionState('connected');
    recovery.setIceConnectionState('disconnected');
    vi.advanceTimersByTime(1500);
    recovery.setIceConnectionState('connected');
    vi.advanceTimersByTime(10000);

    expect(restart).not.toHaveBeenCalled();
  });

  it('restarts when the browser comes back online, even over a pair ICE still calls connected', () => {
    const {recovery, restart, windowTarget} = makeRecovery();
    recovery.setIceConnectionState('connected');

    windowTarget.dispatchEvent(new Event('online'));

    expect(restart).toHaveBeenCalledWith('online');
  });

  it('ignores the network before ICE has begun', () => {
    const {networkInformation, restart, windowTarget} = makeRecovery();

    windowTarget.dispatchEvent(new Event('online'));
    networkInformation.dispatchEvent(new Event('change'));
    vi.advanceTimersByTime(P2P_ICE_RESTART_MIN_INTERVAL_MS * 2);

    expect(restart).not.toHaveBeenCalled();
  });

  it('restarts on a network change only while ICE is not connected', () => {
    const {networkInformation, recovery, restart} = makeRecovery();
    recovery.setIceConnectionState('connected');
    networkInformation.dispatchEvent(new Event('change'));
    expect(restart).not.toHaveBeenCalled();

    recovery.setIceConnectionState('disconnected');
    networkInformation.type = 'cellular';
    networkInformation.dispatchEvent(new Event('change'));
    expect(restart).toHaveBeenCalledWith('network-change');
  });

  it('lets a first connection that is still checking finish its checks', () => {
    const {networkInformation, recovery, restart} = makeRecovery();
    recovery.setIceConnectionState('checking');

    networkInformation.dispatchEvent(new Event('change'));
    vi.advanceTimersByTime(P2P_ICE_RESTART_MIN_INTERVAL_MS * 2);

    expect(restart).not.toHaveBeenCalled();
  });

  it('takes an estimate update on the same network for no switch where the type is known', () => {
    const {networkInformation, recovery, restart} = makeRecovery();
    recovery.setIceConnectionState('connected');
    networkInformation.dispatchEvent(new Event('change'));
    recovery.setIceConnectionState('disconnected');

    // rtt/downlink moved, still Wi-Fi: the 2 s disconnect timer decides.
    networkInformation.dispatchEvent(new Event('change'));
    expect(restart).not.toHaveBeenCalled();

    networkInformation.type = 'cellular';
    networkInformation.dispatchEvent(new Event('change'));
    expect(restart).toHaveBeenCalledWith('network-change');
  });

  it('restarts on a failed peer connection too, once', () => {
    const {recovery, restart} = makeRecovery();
    recovery.setIceConnectionState('connected');
    recovery.setIceConnectionState('failed');
    recovery.setConnectionState('failed');

    expect(restart).toHaveBeenCalledTimes(1);
  });
});

describe('P2P transport recovery: throttling', () => {
  it('restarts at most once per 5 s while the transport is down', () => {
    const {recovery, restart, windowTarget} = makeRecovery();
    recovery.setIceConnectionState('connected');
    recovery.setIceConnectionState('failed');
    expect(restart).toHaveBeenCalledTimes(1);

    // The restart did not help: checking → failed again, and the network flaps.
    recovery.setIceConnectionState('checking');
    vi.advanceTimersByTime(1000);
    recovery.setIceConnectionState('failed');
    windowTarget.dispatchEvent(new Event('online'));
    expect(restart).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(P2P_ICE_RESTART_MIN_INTERVAL_MS - 1000 - 1);
    expect(restart).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(1);
    expect(restart).toHaveBeenCalledTimes(2);
  });

  it('keeps restarting every 5 s while ICE stays failed, but lets a check run', () => {
    const {recovery, restart} = makeRecovery();
    recovery.setIceConnectionState('connected');
    recovery.setIceConnectionState('failed');
    expect(restart).toHaveBeenCalledTimes(1);

    // No network: the restart changes nothing, ICE still reads failed.
    vi.advanceTimersByTime(P2P_ICE_RESTART_MIN_INTERVAL_MS);
    expect(restart).toHaveBeenCalledTimes(2);
    vi.advanceTimersByTime(P2P_ICE_RESTART_MIN_INTERVAL_MS);
    expect(restart).toHaveBeenCalledTimes(3);

    recovery.setIceConnectionState('checking');
    vi.advanceTimersByTime(P2P_ICE_RESTART_MIN_INTERVAL_MS * 3);
    expect(restart).toHaveBeenCalledTimes(3);
  });

  it('drops a scheduled restart when the transport recovers, and restarts at once on the next failure', () => {
    const {recovery, restart} = makeRecovery();
    recovery.setIceConnectionState('connected');
    recovery.setIceConnectionState('failed');
    recovery.setIceConnectionState('checking');
    recovery.setIceConnectionState('failed');
    expect(restart).toHaveBeenCalledTimes(1);

    recovery.setIceConnectionState('connected');
    vi.advanceTimersByTime(P2P_ICE_RESTART_MIN_INTERVAL_MS * 2);
    expect(restart).toHaveBeenCalledTimes(1);

    recovery.setIceConnectionState('failed');
    expect(restart).toHaveBeenCalledTimes(2);
  });

  it('asks again shortly when the connection cannot restart right now', () => {
    let canRestart = false;
    const {recovery, restart} = makeRecovery({restartResult: () => canRestart});
    recovery.setIceConnectionState('connected');
    recovery.setIceConnectionState('failed');
    expect(restart).toHaveBeenCalledTimes(1);

    canRestart = true;
    vi.advanceTimersByTime(P2P_ICE_RESTART_RETRY_MS);
    expect(restart).toHaveBeenCalledTimes(2);
    expect(recovery.restarts).toBe(1);
  });
});

describe('P2P transport recovery: the callee', () => {
  it('waits for the caller before restarting on an ICE failure', () => {
    const {recovery, restart} = makeRecovery({isOutgoing: false});
    recovery.setIceConnectionState('connected');
    recovery.setIceConnectionState('failed');
    expect(restart).not.toHaveBeenCalled();

    vi.advanceTimersByTime(P2P_CALLEE_RESTART_DELAY_MS);
    expect(restart).toHaveBeenCalledWith('ice-failed');
  });

  it('lets the caller\'s restart stand in for its own', () => {
    const {recovery, restart} = makeRecovery({isOutgoing: false});
    recovery.setIceConnectionState('connected');
    recovery.setIceConnectionState('failed');
    vi.advanceTimersByTime(500);

    recovery.onRemoteRestart();
    vi.advanceTimersByTime(P2P_CALLEE_RESTART_DELAY_MS * 2);
    expect(restart).not.toHaveBeenCalled();
  });

  it('restarts at once on its own network change', () => {
    const {recovery, restart, windowTarget} = makeRecovery({isOutgoing: false});
    recovery.setIceConnectionState('connected');

    windowTarget.dispatchEvent(new Event('online'));

    expect(restart).toHaveBeenCalledWith('online');
  });
});

describe('P2P transport recovery: giving up', () => {
  it('gives a call that never connected 20 s of failure', () => {
    const {giveUp, recovery} = makeRecovery();
    recovery.setIceConnectionState('checking');
    recovery.setIceConnectionState('failed');

    vi.advanceTimersByTime(P2P_NEVER_CONNECTED_FAILURE_TIMEOUT_MS - 1);
    expect(giveUp).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(giveUp).toHaveBeenCalledTimes(1);
  });

  it('does not give up a call that connects within those 20 s', () => {
    const {giveUp, recovery} = makeRecovery();
    recovery.setIceConnectionState('failed');
    vi.advanceTimersByTime(10000);
    recovery.setIceConnectionState('connected');
    vi.advanceTimersByTime(P2P_NEVER_CONNECTED_FAILURE_TIMEOUT_MS);

    expect(giveUp).not.toHaveBeenCalled();
  });

  it('leaves a call that did connect to the controller\'s reconnect timeout', () => {
    const {giveUp, recovery} = makeRecovery();
    recovery.setIceConnectionState('connected');
    recovery.setIceConnectionState('failed');
    vi.advanceTimersByTime(P2P_NEVER_CONNECTED_FAILURE_TIMEOUT_MS * 3);

    expect(giveUp).not.toHaveBeenCalled();
  });

  it('ends the call at once when DTLS fails over a connected ICE path', () => {
    const {giveUp, recovery, restart} = makeRecovery();
    recovery.setIceConnectionState('connected');

    recovery.setConnectionState('failed', 'connected');

    expect(giveUp).toHaveBeenCalledTimes(1);
    expect(restart).not.toHaveBeenCalled();
  });
});

describe('P2P transport recovery: stop', () => {
  it('removes its listeners and timers', () => {
    const {giveUp, networkInformation, recovery, restart, windowTarget} = makeRecovery();
    recovery.setIceConnectionState('failed');
    recovery.setIceConnectionState('checking');
    recovery.setIceConnectionState('failed');
    restart.mockClear();

    recovery.stop();
    windowTarget.dispatchEvent(new Event('online'));
    networkInformation.dispatchEvent(new Event('change'));
    recovery.setIceConnectionState('disconnected');
    vi.advanceTimersByTime(P2P_NEVER_CONNECTED_FAILURE_TIMEOUT_MS * 2);

    expect(restart).not.toHaveBeenCalled();
    expect(giveUp).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('reports what it did to the call log', () => {
    const {events, recovery} = makeRecovery();
    recovery.setIceConnectionState('connected');
    recovery.setIceConnectionState('failed');
    recovery.setIceConnectionState('connected');

    expect(events).toEqual([
      'ICE failed',
      'ICE restarted {"trigger":"ice-failed","restarts":1}',
      'transport recovered {"iceConnectionState":"connected","restarts":1}'
    ]);
  });
});
