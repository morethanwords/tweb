/*
 * Regression tests for indexed conference-chain delivery.
 *
 * Push and poll responses carry `next_offset`, so each block's index is
 * `next_offset - blocks.length + i`. Arrival order is not chain order: a push
 * for N+1 can beat the in-flight poll for N. Only a continuous successfully
 * applied prefix may advance the poll cursor.
 */

import {beforeEach, describe, expect, it, vi} from 'vitest';
import '@helpers/peerIdPolyfill';
import GroupCallInstance from '@lib/calls/groupCallInstance';

const CALL_ID = 'delivery-test' as any;

function makeInstance() {
  const applied: number[] = [];
  // Each applyBlock resolves on a later turn, which is what let two deliveries
  // interleave: delivery A awaits while delivery B posts.
  const applyBlock = vi.fn(async({serverBlock}: {serverBlock: Uint8Array}) => {
    await new Promise((resolve) => setTimeout(resolve, 0));
    applied.push(serverBlock[0]);
    return {} as any;
  });

  const managers: any = {
    appGroupCallsManager: {},
    appCallsManager: {},
    apiUpdatesManager: {processUpdateMessage: () => {}}
  };

  const instance = new GroupCallInstance({id: CALL_ID, chatId: 0 as any, managers});
  (instance as any).connections = {
    main: {connection: {iceConnectionState: 'connected'}, streamManager: {stop: vi.fn()}}
  };
  const receiveInbound = vi.fn(async(_args: {serverMessage: Uint8Array}) => ({disposition: 'consumed'}));
  (instance as any).e2e = {applyBlock, receiveInbound, terminate: vi.fn(async() => {})};
  (instance as any).e2eActive = true;

  return {instance, applied, applyBlock, receiveInbound};
}

function makeAttachedWorkerInstance() {
  const {instance} = makeInstance();
  const listeners = new Map<string, Array<(event: any) => void>>();
  const worker = {
    addEventListener: vi.fn((kind: string, listener: (event: any) => void) => {
      const kindListeners = listeners.get(kind) || [];
      kindListeners.push(listener);
      listeners.set(kind, kindListeners);
    }),
    applyBlock: vi.fn(async() => ({})),
    receiveInbound: vi.fn(async() => ({disposition: 'consumed'})),
    terminate: vi.fn(async() => {})
  };

  (instance as any).e2e = undefined;
  (instance as any).e2eActive = false;
  instance.attachE2e(worker as any, BigInt(1));

  return {
    instance,
    emitCallFailed(message: string) {
      for(const listener of listeners.get('callFailed') || []) {
        listener({kind: 'callFailed', message});
      }
    }
  };
}

const deliver = (
  instance: GroupCallInstance,
  subChainId: number,
  ids: number[],
  nextOffset: number,
  requestedOffset?: number
) =>
  (instance as any).deliverE2eChainBlocks(
    subChainId,
    ids.map((n) => new Uint8Array([n])),
    nextOffset,
    requestedOffset
  ) as Promise<boolean>;

const offset = (instance: GroupCallInstance, subChainId: 0 | 1) =>
  (instance as any).e2eChainOffsets[subChainId] as number;

describe('deliverE2eChainBlocks', () => {
  beforeEach(() => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
  });

  it('keeps chain order when two indexed deliveries overlap', async() => {
    const {instance, applied} = makeInstance();

    await Promise.all([
      deliver(instance, 0, [1, 2], 2),
      deliver(instance, 0, [3, 4], 4)
    ]);

    expect(applied).toEqual([1, 2, 3, 4]);
    expect(offset(instance, 0)).toBe(4);
  });

  it('buffers a future push until the missing poll response arrives', async() => {
    const {instance, applied} = makeInstance();

    // Push carries indexes 2..3 and wins the race. Neither may reach the worker.
    await deliver(instance, 0, [3, 4], 4);
    expect(applied).toEqual([]);
    expect(offset(instance, 0)).toBe(0);

    // Poll fills indexes 0..1; draining continues through the buffered push.
    await deliver(instance, 0, [1, 2], 2);
    expect(applied).toEqual([1, 2, 3, 4]);
    expect(offset(instance, 0)).toBe(4);
  });

  it('drops overlap below the cursor and applies only the unseen suffix', async() => {
    const {instance, applied} = makeInstance();

    await deliver(instance, 0, [1, 2], 2);
    // Index 1 overlaps; indexes 2..3 are new.
    await deliver(instance, 0, [2, 3, 4], 4);

    expect(applied).toEqual([1, 2, 3, 4]);
    expect(offset(instance, 0)).toBe(4);
  });

  it('accepts an overlapping poll slice and applies only its unseen suffix', async() => {
    const {instance, applied} = makeInstance();
    (instance as any).e2eChainOffsets[0] = 191;

    // The server retained indexes 190..192 while this request asked for 191.
    await expect(deliver(instance, 0, [90, 91, 92], 193, 191)).resolves.toBe(true);

    expect(applied).toEqual([91, 92]);
    expect(offset(instance, 0)).toBe(193);
  });

  it('uses the live cursor when a push overtakes an overlapping poll', async() => {
    const {instance, applied} = makeInstance();
    (instance as any).e2eChainOffsets[0] = 191;

    // The request captured 191, then a push supplied indexes 191..192.
    await deliver(instance, 0, [91, 92], 193);
    // The retained response starts after the requested cursor, but still
    // covers the now-live cursor 193. Only indexes 193..194 are unseen.
    await expect(deliver(instance, 0, [92, 93, 94], 195, 191)).resolves.toBe(true);

    expect(applied).toEqual([91, 92, 93, 94]);
    expect(offset(instance, 0)).toBe(195);
  });

  it('does not advance across a gap or an empty server batch', async() => {
    const {instance, applied} = makeInstance();

    await deliver(instance, 0, [1], 1);
    await deliver(instance, 0, [3], 3);
    await expect(deliver(instance, 0, [], 100)).resolves.toBe(false);

    expect(applied).toEqual([1]);
    expect(offset(instance, 0)).toBe(1);

    await deliver(instance, 0, [2], 2);
    expect(applied).toEqual([1, 2, 3]);
    expect(offset(instance, 0)).toBe(3);
  });

  it('bounds a relay-controlled future-block buffer', async() => {
    const {instance, applied} = makeInstance();
    const ids = Array.from({length: 300}, (_, i) => i + 1);

    await deliver(instance, 0, ids, 300);

    // The nearest continuous prefix is retained/applied; the tail is fetched
    // again from the still-contiguous cursor instead of remaining in memory.
    expect(applied).toHaveLength(256);
    expect(offset(instance, 0)).toBe(256);
    expect((instance as any).e2eChainPending[0].size).toBe(0);
  });

  it('does not advance past a block that failed to apply', async() => {
    const {instance, applied, applyBlock} = makeInstance();
    applyBlock.mockImplementationOnce(async() => {
      throw new Error('boom');
    });

    await deliver(instance, 0, [1, 2], 2);
    expect(applied).toEqual([]);
    expect(offset(instance, 0)).toBe(0);

    // Any later delivery re-runs the queued continuous prefix.
    await deliver(instance, 0, [2], 2);
    expect(applied).toEqual([1, 2]);
    expect(offset(instance, 0)).toBe(2);
  });

  it('advances the broadcast cursor past a dropped broadcast and reports it', async() => {
    const {instance, receiveInbound} = makeInstance();
    const report = vi.spyOn(instance as any, 'reportConferenceBug').mockImplementation(() => {});
    receiveInbound.mockResolvedValueOnce({disposition: 'dropped', status: {height: 3}} as any);

    // The dropped item is consumed like any other: the cursor moves on and the
    // buffered suffix is delivered in the same pass. Parking on it re-delivered
    // the same item on every poll and stalled every later verification round.
    await deliver(instance, 1, [1, 2], 2);
    expect(receiveInbound.mock.calls.map(([{serverMessage}]) => serverMessage[0])).toEqual([1, 2]);
    expect(offset(instance, 1)).toBe(2);
    expect((instance as any).e2eChainPending[1].size).toBe(0);
    expect(report).toHaveBeenCalledTimes(1);
  });

  it('buffers accepted chain updates until post-join activation', async() => {
    const {instance, applied} = makeInstance();
    (instance as any).e2eActive = false;
    vi.spyOn(instance as any, 'startE2eChainPolling').mockImplementation(() => {});

    await deliver(instance, 0, [1, 2], 2);
    expect(applied).toEqual([]);
    expect(offset(instance, 0)).toBe(0);

    await instance.activateE2e();
    expect(applied).toEqual([1, 2]);
    expect(offset(instance, 0)).toBe(2);
  });

  it('anchors the accepted join verification tail before activation drains it', async() => {
    const {instance, receiveInbound} = makeInstance();
    (instance as any).e2eActive = false;
    vi.spyOn(instance as any, 'startE2eChainPolling').mockImplementation(() => {});

    // The ordinary Updates pipeline sees the canonical join response first and
    // buffers its retained indexes 191..192 while the cursor is still zero.
    await deliver(instance, 1, [7, 8], 193);
    expect(offset(instance, 1)).toBe(0);

    await expect(instance.deliverAcceptedE2eJoinChainBlocks(
      1,
      [new Uint8Array([7]), new Uint8Array([8])],
      193
    )).resolves.toBe(true);
    expect(offset(instance, 1)).toBe(191);

    await instance.activateE2e();

    expect(receiveInbound.mock.calls.map(([{serverMessage}]) => serverMessage[0])).toEqual([7, 8]);
    expect(offset(instance, 1)).toBe(193);
  });

  it('uses an empty accepted join response to seed the retained verification cursor', async() => {
    const {instance} = makeInstance();
    (instance as any).e2eActive = false;

    await expect(instance.deliverAcceptedE2eJoinChainBlocks(1, [], 191)).resolves.toBe(true);

    expect(offset(instance, 1)).toBe(191);
  });

  it('prunes stale future pushes before anchoring an initial verification tail', async() => {
    const {instance, receiveInbound} = makeInstance();
    const stale = Array.from({length: 256}, (_, index) => index + 1);

    // Fill the bounded pending map with future indexes 1..256 while index 0 is
    // absent, as can happen when pushes beat the first retained-tail poll.
    await deliver(instance, 1, stale, 257);
    expect(offset(instance, 1)).toBe(0);
    expect((instance as any).e2eChainPending[1].size).toBe(256);

    await expect(deliver(instance, 1, [9], 301, 0)).resolves.toBe(true);

    expect(receiveInbound.mock.calls.map(([{serverMessage}]) => serverMessage[0])).toEqual([9]);
    expect(offset(instance, 1)).toBe(301);
    expect((instance as any).e2eChainPending[1].size).toBe(0);
  });

  it('drains every buffered main block before publishing verification outbound', async() => {
    const listeners = new Map<string, Array<(event: any) => void>>();
    let pendingHeight: number | undefined;
    const sendConferenceCallBroadcast = vi.fn(async(_call: unknown, _bytes: Uint8Array) => {});
    const worker = {
      addEventListener(kind: string, listener: (event: any) => void) {
        const list = listeners.get(kind) || [];
        list.push(listener);
        listeners.set(kind, list);
      },
      async applyBlock({serverBlock}: {serverBlock: Uint8Array}) {
        const height = serverBlock[0];
        pendingHeight = height;
        const status: any = {
          height,
          groupState: {
            participants: [{
              userId: BigInt(1),
              publicKey: new Uint8Array(32),
              canAddUsers: true,
              canRemoveUsers: true,
              version: 0
            }],
            externalPermissions: 3
          },
          lastBlockHash: new Uint8Array(32).fill(height),
          verification: {
            phase: 'commit',
            height,
            blockHash: new Uint8Array(32).fill(height),
            commitsSeen: 0,
            revealsSeen: 0
          },
          failed: null
        };
        for(const listener of listeners.get('status') || []) listener({kind: 'status', status});
        for(const listener of listeners.get('pendingOutbound') || []) listener({kind: 'pendingOutbound'});
        return status;
      },
      async pullOutbound() {
        if(pendingHeight === undefined) return [];
        const height = pendingHeight;
        pendingHeight = undefined;
        return [{bytes: new Uint8Array([height]), height}];
      },
      async terminate() {}
    };
    const managers: any = {
      appGroupCallsManager: {},
      appCallsManager: {sendConferenceCallBroadcast},
      apiUpdatesManager: {processUpdateMessage: () => {}}
    };
    const instance = new GroupCallInstance({id: CALL_ID, chatId: 0 as any, managers});
    instance.groupCall = {
      _: 'groupCall',
      pFlags: {},
      id: CALL_ID,
      access_hash: '1',
      participants_count: 1,
      unmuted_video_count: 0,
      version: 1
    } as any;
    (instance as any).connections = {
      main: {connection: {iceConnectionState: 'connected'}, streamManager: {stop: vi.fn()}}
    };
    vi.spyOn(instance as any, 'refreshConferenceParticipants').mockResolvedValue(undefined);
    vi.spyOn(instance as any, 'startE2eChainPolling').mockImplementation(() => {});
    instance.attachE2e(worker as any, BigInt(1));

    await deliver(instance, 0, [1, 2], 2);
    await instance.activateE2e();
    await vi.waitFor(() => expect(sendConferenceCallBroadcast).toHaveBeenCalled());

    // The height-1 round was replaced while the activation gate was closed.
    expect(sendConferenceCallBroadcast.mock.calls.map(([, bytes]) => bytes[0])).toEqual([2]);
    instance.cleanup();
  });

  it('rejects activation on a fatal buffered main-chain block without starting recovery twice', async() => {
    const {instance, applyBlock} = makeInstance();
    (instance as any).e2eActive = false;
    const activationError = new Error('buffered block is invalid');
    applyBlock.mockRejectedValueOnce(activationError);
    const startPolling = vi.spyOn(instance as any, 'startE2eChainPolling').mockImplementation(() => {});
    const hangUp = vi.spyOn(instance, 'hangUp').mockResolvedValue(undefined);

    await deliver(instance, 0, [1], 1);
    await expect(instance.activateE2e()).rejects.toBe(activationError);

    expect(offset(instance, 0)).toBe(0);
    expect(startPolling).not.toHaveBeenCalled();
    // The caller's accepted-join transaction performs rollback. Activation
    // must not start an independent leave while rejecting into that caller.
    expect(hangUp).not.toHaveBeenCalled();
  });

  it('observes a pushed activation failure while preserving it for join rollback', async() => {
    const {instance, applyBlock, receiveInbound} = makeInstance();
    const activationError = new Error('pushed activation block failed');
    applyBlock.mockRejectedValueOnce(activationError);
    (instance as any).e2e = undefined;
    instance.attachE2e({
      addEventListener: vi.fn(),
      applyBlock,
      receiveInbound,
      terminate: vi.fn(async() => {})
    } as any, BigInt(1));
    (instance as any).e2eActive = true;
    (instance as any).e2eActivating = true;
    const logError = vi.spyOn((instance as any).log, 'error');

    (instance as any).chainBlocksListener({
      callId: instance.id,
      subChainId: 0,
      blocks: [new Uint8Array([1])],
      nextOffset: 1
    });

    await vi.waitFor(() => expect(logError).toHaveBeenCalledWith(
      'pushed e2e chain delivery failed',
      activationError
    ));
    expect((instance as any).e2eFatalError).toBe(activationError);
    expect(offset(instance, 0)).toBe(0);
    instance.cleanup();
  });

  it('rejects activation if cleanup removed the worker during the accepted join', async() => {
    const {instance} = makeInstance();
    (instance as any).e2eActive = false;
    (instance as any).e2e = undefined;

    await expect(instance.activateE2e()).rejects.toThrow(/worker is unavailable/);
  });

  it('seeds an official-client cursor before attach/polling', () => {
    const {instance} = makeInstance();
    // Test setup installs e2e directly; seed API intentionally refuses changes
    // after attach, so use a fresh instance without that shortcut.
    (instance as any).e2e = undefined;

    instance.seedE2eChainOffsets({0: 27, 1: 9});

    expect(offset(instance, 0)).toBe(27);
    expect(offset(instance, 1)).toBe(9);
  });
});

describe('E2E worker failures', () => {
  it('recovers once when an active join loses its blockchain membership', async() => {
    const {instance, emitCallFailed} = makeAttachedWorkerInstance();
    const startPolling = vi.spyOn(instance as any, 'startE2eChainPolling').mockImplementation(() => {});
    const stopPolling = vi.spyOn(instance as any, 'stopE2eChainPolling');
    const hangUp = vi.spyOn(instance, 'hangUp').mockResolvedValue(undefined);
    const recoveryRequired = vi.fn();
    (instance as any).addEventListener('conferenceRecoveryRequired', recoveryRequired);
    await instance.activateE2e();

    emitCallFailed('NOT_PARTICIPANT: our public key is not in group_state');
    emitCallFailed('NOT_PARTICIPANT: our public key is not in group_state');

    expect(startPolling).toHaveBeenCalledTimes(1);
    expect(recoveryRequired).toHaveBeenCalledTimes(1);
    expect(recoveryRequired).toHaveBeenCalledWith('membership-lost');
    expect(stopPolling).toHaveBeenCalledTimes(1);
    expect((instance as any).e2eActive).toBe(false);
    expect(hangUp).not.toHaveBeenCalled();
    instance.cleanup();
  });

  it('keeps unrelated active crypto failures on the fail-closed hangup path', async() => {
    const {instance, emitCallFailed} = makeAttachedWorkerInstance();
    vi.spyOn(instance as any, 'startE2eChainPolling').mockImplementation(() => {});
    const hangUp = vi.spyOn(instance, 'hangUp').mockResolvedValue(undefined);
    const recoveryRequired = vi.fn();
    (instance as any).addEventListener('conferenceRecoveryRequired', recoveryRequired);
    await instance.activateE2e();

    emitCallFailed('INVALID_SIGNATURE: unable to verify sender');

    expect(recoveryRequired).not.toHaveBeenCalled();
    expect(hangUp).toHaveBeenCalledTimes(1);
    expect((instance as any).e2eFatalError).toEqual(
      new Error('INVALID_SIGNATURE: unable to verify sender')
    );
    instance.cleanup();
  });
});

function makePollingInstance(getGroupCallChainBlocks: ReturnType<typeof vi.fn>) {
  const applyBlock = vi.fn(async(_args: {serverBlock: Uint8Array}) => ({}));
  const receiveInbound = vi.fn(async(_args: {serverMessage: Uint8Array}) => ({disposition: 'consumed'}));
  const processUpdateMessage = vi.fn(async(_updates: unknown) => {});
  const managers: any = {
    appGroupCallsManager: {},
    appCallsManager: {getGroupCallChainBlocks},
    apiUpdatesManager: {processUpdateMessage}
  };
  const instance = new GroupCallInstance({id: CALL_ID, chatId: 0 as any, managers});
  instance.groupCall = {
    _: 'groupCall',
    pFlags: {},
    id: CALL_ID,
    access_hash: '1',
    participants_count: 1,
    unmuted_video_count: 0,
    version: 1
  } as any;
  (instance as any).connections = {
    main: {connection: {iceConnectionState: 'connected'}, streamManager: {stop: vi.fn()}}
  };
  (instance as any).e2e = {applyBlock, receiveInbound, terminate: vi.fn(async() => {})};
  (instance as any).e2eActive = true;
  return {instance, applyBlock, receiveInbound, processUpdateMessage};
}

function chainUpdate(subChainId: number, callId = CALL_ID, byte = subChainId + 1) {
  return {
    _: 'updateGroupCallChainBlocks',
    call: {_: 'inputGroupCall', id: callId, access_hash: '1'},
    sub_chain_id: subChainId,
    blocks: [new Uint8Array([byte])],
    next_offset: 1
  };
}

describe('pollE2eChain', () => {
  it('requests one recovery and stops polling when the broadcast subchain is forbidden', async() => {
    const forbidden = {type: 'GROUPCALL_FORBIDDEN'};
    const getBlocks = vi.fn(async(_call, subChainId: number) => {
      if(subChainId === 1) throw forbidden;
      return {
        _: 'updateShort',
        update: {
          ...chainUpdate(subChainId),
          blocks: [],
          next_offset: 0
        },
        date: 0
      };
    });
    const {instance} = makePollingInstance(getBlocks);
    const recoveryRequired = vi.fn();
    (instance as any).addEventListener('conferenceRecoveryRequired', recoveryRequired);
    const stopPolling = vi.spyOn(instance as any, 'stopE2eChainPolling');

    await (instance as any).pollE2eChain();

    expect(recoveryRequired).toHaveBeenCalledTimes(1);
    expect(stopPolling).toHaveBeenCalledTimes(1);
    expect(getBlocks).toHaveBeenCalledTimes(2);

    // Clearing the interval cannot cancel a tick that was already queued. The
    // terminal authorization state must also gate the poll body itself.
    await (instance as any).pollE2eChain();
    expect(getBlocks).toHaveBeenCalledTimes(2);
    expect(recoveryRequired).toHaveBeenCalledTimes(1);
  });

  it('single-flights recovery when both subchains are forbidden together', async() => {
    const getBlocks = vi.fn().mockRejectedValue({type: 'GROUPCALL_FORBIDDEN'});
    const {instance} = makePollingInstance(getBlocks);
    const recoveryRequired = vi.fn();
    (instance as any).addEventListener('conferenceRecoveryRequired', recoveryRequired);
    const stopPolling = vi.spyOn(instance as any, 'stopE2eChainPolling');

    await (instance as any).pollE2eChain();

    expect(getBlocks).toHaveBeenCalledTimes(2);
    expect(recoveryRequired).toHaveBeenCalledTimes(1);
    expect(stopPolling).toHaveBeenCalledTimes(1);
  });

  it('keeps ordinary network failures retryable without requesting recovery', async() => {
    const getBlocks = vi.fn().mockRejectedValue(new Error('offline'));
    const {instance} = makePollingInstance(getBlocks);
    const recoveryRequired = vi.fn();
    (instance as any).addEventListener('conferenceRecoveryRequired', recoveryRequired);
    const stopPolling = vi.spyOn(instance as any, 'stopE2eChainPolling');

    await (instance as any).pollE2eChain();
    await (instance as any).pollE2eChain();

    expect(getBlocks).toHaveBeenCalledTimes(4);
    expect(recoveryRequired).not.toHaveBeenCalled();
    expect(stopPolling).not.toHaveBeenCalled();
  });

  it('accepts updateShort and runs it through the ordinary Updates pipeline', async() => {
    const getBlocks = vi.fn(async(_call, subChainId: number, _offset: number, _limit: number) => ({
      _: 'updateShort',
      update: chainUpdate(subChainId),
      date: 0
    }));
    const {instance, applyBlock, receiveInbound, processUpdateMessage} = makePollingInstance(getBlocks);
    (instance as any).lastChainPollAt = 0;

    await (instance as any).pollE2eChain();

    expect(processUpdateMessage).toHaveBeenCalledTimes(2);
    expect(applyBlock.mock.calls.map(([{serverBlock}]) => serverBlock[0])).toEqual([1]);
    expect(receiveInbound.mock.calls.map(([{serverMessage}]) => serverMessage[0])).toEqual([2]);
    expect(offset(instance, 0)).toBe(1);
    expect(offset(instance, 1)).toBe(1);
    expect((instance as any).lastChainPollAt).toBeGreaterThan(0);
  });

  it('treats a bare answer with no chain update as a healthy poll', async() => {
    // tdlib and tdesktop derive no stall signal from the echo's shape — an
    // empty subchain mailbox answered without an updateGroupCallChainBlocks is
    // a healthy answer. Deriving a stall from it kept the watchdog running a
    // redundant recovery every few seconds for the whole call.
    const getBlocks = vi.fn(async() => ({
      _: 'updates',
      updates: [],
      users: [],
      chats: [],
      date: 0,
      seq: 0
    }));
    const {instance, applyBlock, receiveInbound, processUpdateMessage} = makePollingInstance(getBlocks);
    (instance as any).lastChainPollAt = 0;

    await (instance as any).pollE2eChain();

    expect(processUpdateMessage).toHaveBeenCalledTimes(2);
    expect(applyBlock).not.toHaveBeenCalled();
    expect(receiveInbound).not.toHaveBeenCalled();
    expect(offset(instance, 0)).toBe(0);
    expect(offset(instance, 1)).toBe(0);
    expect((instance as any).lastChainPollAt).toBeGreaterThan(0);
  });

  it('ignores mixed-call blocks and does not mark an identity-less poll healthy', async() => {
    const getBlocks = vi.fn(async(_call, subChainId: number) => ({
      _: 'updates',
      updates: [chainUpdate(subChainId, 'another-call' as any, 99)],
      users: [],
      chats: [],
      date: 0,
      seq: 0
    }));
    const {instance, applyBlock, receiveInbound, processUpdateMessage} = makePollingInstance(getBlocks);
    (instance as any).lastChainPollAt = Number.MAX_SAFE_INTEGER;

    await (instance as any).pollE2eChain();

    expect(processUpdateMessage).toHaveBeenCalledTimes(2);
    expect(applyBlock).not.toHaveBeenCalled();
    expect(receiveInbound).not.toHaveBeenCalled();
    expect(offset(instance, 0)).toBe(0);
    expect(offset(instance, 1)).toBe(0);
    expect((instance as any).lastChainPollAt).toBe(Number.MAX_SAFE_INTEGER);
  });

  it('extracts only the identity-matched slice from a mixed Updates container', async() => {
    const getBlocks = vi.fn(async(_call, subChainId: number) => ({
      _: 'updatesCombined',
      updates: [
        chainUpdate(subChainId, 'another-call' as any, 99),
        chainUpdate(subChainId)
      ],
      users: [],
      chats: [],
      date: 0,
      seq_start: 0,
      seq: 0
    }));
    const {instance, applyBlock, receiveInbound} = makePollingInstance(getBlocks);

    await (instance as any).pollE2eChain();

    expect(applyBlock.mock.calls.map(([{serverBlock}]) => serverBlock[0])).toEqual([1]);
    expect(receiveInbound.mock.calls.map(([{serverMessage}]) => serverMessage[0])).toEqual([2]);
  });

  it('rejects an ambiguous container with multiple matching chain slices', async() => {
    let malformedFirst = false;
    const getBlocks = vi.fn(async(_call, subChainId: number) => {
      const valid = chainUpdate(subChainId);
      const malformed = {
        ...chainUpdate(subChainId),
        blocks: [] as Uint8Array[],
        next_offset: 9
      };
      return {
        _: 'updates',
        updates: malformedFirst ? [malformed, valid] : [valid, malformed],
        users: [],
        chats: [],
        date: 0,
        seq: 0
      };
    });
    const {instance, applyBlock, receiveInbound, processUpdateMessage} = makePollingInstance(getBlocks);
    (instance as any).lastChainPollAt = Number.MAX_SAFE_INTEGER;

    await (instance as any).pollE2eChain();
    malformedFirst = true;
    await (instance as any).pollE2eChain();

    expect(processUpdateMessage).not.toHaveBeenCalled();
    expect(applyBlock).not.toHaveBeenCalled();
    expect(receiveInbound).not.toHaveBeenCalled();
    expect(offset(instance, 0)).toBe(0);
    expect(offset(instance, 1)).toBe(0);
    expect((instance as any).lastChainPollAt).toBe(Number.MAX_SAFE_INTEGER);
  });

  it('does not let repeated empty future main-chain cursors keep chain liveness healthy', async() => {
    const getBlocks = vi.fn(async(_call, subChainId: number, _offset: number, _limit: number) => ({
      _: 'updateShort',
      update: {
        ...chainUpdate(subChainId),
        blocks: [],
        next_offset: subChainId === 0 ? 9 : 0
      },
      date: 0
    }));
    const {instance, applyBlock, receiveInbound, processUpdateMessage} = makePollingInstance(getBlocks);
    (instance as any).lastChainPollAt = Number.MAX_SAFE_INTEGER;

    await (instance as any).pollE2eChain();
    await (instance as any).pollE2eChain();

    expect(getBlocks.mock.calls.map(([, , requestedOffset]) => requestedOffset)).toEqual([0, 0, 0, 0]);
    expect(processUpdateMessage).toHaveBeenCalledTimes(2);
    expect(applyBlock).not.toHaveBeenCalled();
    expect(receiveInbound).not.toHaveBeenCalled();
    expect(offset(instance, 0)).toBe(0);
    expect(offset(instance, 1)).toBe(0);
    expect((instance as any).lastChainPollAt).toBe(Number.MAX_SAFE_INTEGER);
  });

  it('accepts an empty response only when it confirms the requested cursor', async() => {
    const getBlocks = vi.fn(async(_call, subChainId: number) => ({
      _: 'updateShort',
      update: {
        ...chainUpdate(subChainId),
        blocks: [],
        next_offset: 0
      },
      date: 0
    }));
    const {instance, applyBlock, receiveInbound, processUpdateMessage} = makePollingInstance(getBlocks);
    (instance as any).lastChainPollAt = 0;

    await (instance as any).pollE2eChain();

    expect(processUpdateMessage).toHaveBeenCalledTimes(2);
    expect(applyBlock).not.toHaveBeenCalled();
    expect(receiveInbound).not.toHaveBeenCalled();
    expect(offset(instance, 0)).toBe(0);
    expect(offset(instance, 1)).toBe(0);
    expect((instance as any).lastChainPollAt).toBeGreaterThan(0);
  });

  it('anchors the first verification poll at the server-retained tail', async() => {
    const getBlocks = vi.fn(async(_call, subChainId: number) => ({
      _: 'updateShort',
      update: {
        ...chainUpdate(subChainId),
        next_offset: subChainId === 1 ? 192 : 1
      },
      date: 0
    }));
    const {instance, applyBlock, receiveInbound, processUpdateMessage} = makePollingInstance(getBlocks);
    (instance as any).lastChainPollAt = 0;

    await (instance as any).pollE2eChain();

    expect(processUpdateMessage).toHaveBeenCalledTimes(2);
    expect(applyBlock.mock.calls.map(([{serverBlock}]) => serverBlock[0])).toEqual([1]);
    expect(receiveInbound.mock.calls.map(([{serverMessage}]) => serverMessage[0])).toEqual([2]);
    expect(offset(instance, 0)).toBe(1);
    expect(offset(instance, 1)).toBe(192);
    expect((instance as any).lastChainPollAt).toBeGreaterThan(0);
  });

  it('anchors an empty first verification poll at the retained cursor', async() => {
    const getBlocks = vi.fn(async(_call, subChainId: number) => ({
      _: 'updateShort',
      update: {
        ...chainUpdate(subChainId),
        blocks: [],
        next_offset: subChainId === 1 ? 191 : 0
      },
      date: 0
    }));
    const {instance, applyBlock, receiveInbound, processUpdateMessage} = makePollingInstance(getBlocks);
    (instance as any).lastChainPollAt = 0;

    await (instance as any).pollE2eChain();

    expect(processUpdateMessage).toHaveBeenCalledTimes(2);
    expect(applyBlock).not.toHaveBeenCalled();
    expect(receiveInbound).not.toHaveBeenCalled();
    expect(offset(instance, 0)).toBe(0);
    expect(offset(instance, 1)).toBe(191);
    expect((instance as any).lastChainPollAt).toBeGreaterThan(0);
  });

  it('still rejects a main-chain poll batch that starts after the requested cursor', async() => {
    const getBlocks = vi.fn(async(_call, subChainId: number) => ({
      _: 'updateShort',
      update: {
        ...chainUpdate(subChainId),
        next_offset: subChainId === 0 ? 2 : 1
      },
      date: 0
    }));
    const {instance, applyBlock, receiveInbound, processUpdateMessage} = makePollingInstance(getBlocks);
    (instance as any).lastChainPollAt = Number.MAX_SAFE_INTEGER;

    await (instance as any).pollE2eChain();

    expect(processUpdateMessage).toHaveBeenCalledTimes(1);
    expect(applyBlock).not.toHaveBeenCalled();
    expect(receiveInbound.mock.calls.map(([{serverMessage}]) => serverMessage[0])).toEqual([2]);
    expect(offset(instance, 0)).toBe(0);
    expect(offset(instance, 1)).toBe(1);
    expect((instance as any).lastChainPollAt).toBe(Number.MAX_SAFE_INTEGER);
  });

  it('rejects later verification gaps after the initial cursor is anchored', async() => {
    const getBlocks = vi.fn(async(_call, subChainId: number) => ({
      _: 'updateShort',
      update: {
        ...chainUpdate(subChainId),
        blocks: subChainId === 0 ? [] : [new Uint8Array([2])],
        next_offset: subChainId === 0 ? 0 : 193
      },
      date: 0
    }));
    const {instance, receiveInbound, processUpdateMessage} = makePollingInstance(getBlocks);
    (instance as any).e2eChainOffsets[1] = 191;
    (instance as any).lastChainPollAt = Number.MAX_SAFE_INTEGER;

    await (instance as any).pollE2eChain();

    expect(processUpdateMessage).toHaveBeenCalledTimes(1);
    expect(receiveInbound).not.toHaveBeenCalled();
    expect(offset(instance, 0)).toBe(0);
    expect(offset(instance, 1)).toBe(191);
    expect((instance as any).lastChainPollAt).toBe(Number.MAX_SAFE_INTEGER);
  });
});
