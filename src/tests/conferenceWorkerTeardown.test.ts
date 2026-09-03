/*
 * Regression tests for teardown and wire-safety fixes found in round two.
 *
 *  - EncryptWorkerHost.terminate() set `destroyed` BEFORE invoking the destroy
 *    RPC, and `invoke` rejects outright once that flag is set — so the message
 *    was never posted and the key wipe the method documents never ran. The
 *    thread dies either way; the explicit zeroing is the point of the RPC.
 *  - ConferenceEntry.setSource accepted a source group with no sources,
 *    installing `undefined` as the entry's source and as a Map key.
 */

import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {ConferenceEntry} from '@lib/calls/localConferenceDescription';

// Minimal Worker stand-in: jsdom has none, and we only care what gets posted.
class FakeWorker {
  public posted: any[] = [];
  public terminated = false;
  public answerRpc = true;
  public postError: Error | undefined;
  private listeners: Record<string, Set<(ev: any) => void>> = {};

  public postMessage(msg: any) {
    if(this.postError) throw this.postError;
    this.posted.push(msg);
    if(!this.answerRpc) return;
    // Answer every RPC so terminate()'s await resolves.
    queueMicrotask(() => {
      this.listeners.message?.forEach((l) => l({data: {kind: 'ok', id: msg.id, result: undefined}}));
    });
  }

  public addEventListener(type: string, cb: (ev: any) => void) {
    (this.listeners[type] ??= new Set()).add(cb);
  }

  public removeEventListener(type: string, cb: (ev: any) => void) {
    this.listeners[type]?.delete(cb);
  }

  public terminate() {
    this.terminated = true;
  }

  public listenerCount(type: string) {
    return this.listeners[type]?.size || 0;
  }

  public emitError(message: string) {
    this.listeners.error?.forEach((listener) => listener({message}));
  }
}

let fake: FakeWorker;
vi.mock('@lib/calls/e2e/encryptWorker?worker', () => ({
  default: class {
    constructor() {
      return fake as unknown as Worker;
    }
  }
}));

describe('EncryptWorkerHost.terminate', () => {
  beforeEach(() => {
    fake = new FakeWorker();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('posts the destroy RPC before terminating the thread', async() => {
    const {EncryptWorkerHost} = await import('@lib/calls/e2e/encryptWorkerHost');
    const host = new EncryptWorkerHost();

    await host.terminate();

    const kinds = fake.posted.map((m) => m.kind);
    expect(kinds).toContain('destroy');
    expect(fake.terminated).toBe(true);
  });

  it('is idempotent — a second terminate posts nothing more', async() => {
    const {EncryptWorkerHost} = await import('@lib/calls/e2e/encryptWorkerHost');
    const host = new EncryptWorkerHost();

    await host.terminate();
    const after = fake.posted.length;
    await host.terminate();

    expect(fake.posted.length).toBe(after);
  });

  it('terminates after a bounded wait when the destroy RPC never answers', async() => {
    vi.useFakeTimers();
    fake.answerRpc = false;
    const {EncryptWorkerHost} = await import('@lib/calls/e2e/encryptWorkerHost');
    const host = new EncryptWorkerHost();

    const terminating = host.terminate();
    await vi.advanceTimersByTimeAsync(499);
    expect(fake.terminated).toBe(false);

    await vi.advanceTimersByTimeAsync(1);
    await terminating;

    expect(fake.terminated).toBe(true);
    expect(fake.listenerCount('message')).toBe(0);
    expect(fake.listenerCount('error')).toBe(0);
  });

  it('rejects new work while terminating and rejects older pending RPCs on timeout', async() => {
    vi.useFakeTimers();
    fake.answerRpc = false;
    const {EncryptWorkerHost} = await import('@lib/calls/e2e/encryptWorkerHost');
    const host = new EncryptWorkerHost();
    const pending = host.getStatus();
    const pendingResult = expect(pending).rejects.toThrow('Worker terminated');

    const terminating = host.terminate();
    const rejected = host.getStatus();
    await expect(rejected).rejects.toThrow('EncryptWorkerHost: terminating');
    expect(fake.posted.map((message) => message.kind)).toEqual(['getStatus', 'destroy']);

    await vi.advanceTimersByTimeAsync(500);
    await terminating;
    await pendingResult;
  });

  it('fails closed once on a worker runtime error and leaves no pending RPC', async() => {
    vi.useFakeTimers();
    fake.answerRpc = false;
    const {EncryptWorkerHost} = await import('@lib/calls/e2e/encryptWorkerHost');
    const host = new EncryptWorkerHost();
    const failures: string[] = [];
    host.addEventListener('callFailed', ({message}) => failures.push(message));

    const pending = host.getStatus();
    const pendingResult = expect(pending).rejects.toThrow('crypto runtime crashed');
    fake.emitError('crypto runtime crashed');
    fake.emitError('duplicate browser error');

    await pendingResult;
    expect((host as any).pending.size).toBe(1); // only the bounded destroy RPC remains
    await vi.advanceTimersByTimeAsync(500);
    expect(fake.terminated).toBe(true);
    expect((host as any).pending.size).toBe(0);
    expect(failures).toEqual(['crypto runtime crashed']);
    expect(fake.listenerCount('message')).toBe(0);
    expect(fake.listenerCount('error')).toBe(0);
    await expect(host.getStatus()).rejects.toThrow('EncryptWorkerHost: failed');
    expect(fake.posted.map((message) => message.kind)).toEqual(['getStatus', 'destroy']);
  });

  it('reports and terminates a runtime error even with no pending RPC', async() => {
    const {EncryptWorkerHost} = await import('@lib/calls/e2e/encryptWorkerHost');
    const host = new EncryptWorkerHost();
    const callFailed = vi.fn();
    host.addEventListener('callFailed', callFailed);

    fake.emitError('worker startup failed');

    await vi.waitFor(() => expect(fake.terminated).toBe(true));
    expect(callFailed).toHaveBeenCalledTimes(1);
    expect(callFailed).toHaveBeenCalledWith({kind: 'callFailed', message: 'worker startup failed'});
  });

  it('does not retain an RPC whose postMessage fails synchronously', async() => {
    const {EncryptWorkerHost} = await import('@lib/calls/e2e/encryptWorkerHost');
    const host = new EncryptWorkerHost();
    const cloneError = new Error('could not clone request');
    fake.postError = cloneError;

    await expect(host.getStatus()).rejects.toBe(cloneError);
    expect((host as any).pending.size).toBe(0);

    fake.postError = undefined;
    await host.terminate();
  });

  it('exposes a two-phase seedless rejoin protocol', async() => {
    const {EncryptWorkerHost} = await import('@lib/calls/e2e/encryptWorkerHost');
    const host = new EncryptWorkerHost();

    await host.prepareRejoinBlock({
      previousBlockServer: new Uint8Array([1, 2, 3, 4]),
      self: {
        userId: BigInt(7),
        publicKey: new Uint8Array(32),
        canAddUsers: true,
        canRemoveUsers: true,
        version: 0
      }
    });
    await host.commitRejoinBlock();

    const prepare = fake.posted.find((message) => message.kind === 'prepareRejoinBlock');
    expect(prepare).toBeDefined();
    expect(prepare.args.privateSeed).toBeUndefined();
    expect(fake.posted.some((message) => message.kind === 'commitRejoinBlock')).toBe(true);
  });
});

describe('EncryptWorkerHost.createKey', () => {
  beforeEach(() => {
    fake = new FakeWorker();
  });

  it('asks the worker for a key with no arguments at all', async() => {
    const {EncryptWorkerHost} = await import('@lib/calls/e2e/encryptWorkerHost');
    const host = new EncryptWorkerHost();
    await host.createKey();
    expect(fake.posted.find((message) => message.kind === 'createKey')).toEqual({
      kind: 'createKey',
      id: expect.any(Number)
    });
    await host.terminate();
  });
});

// Load a fresh encryptWorker module against mocked keys / call / crypto modules
// and capture the message handler it installs. `restore` undoes everything.
async function loadWorker(modules: {keys: unknown, call: unknown, crypto?: Record<string, unknown>}) {
  vi.resetModules();
  vi.doMock('@lib/calls/e2e/keys', () => modules.keys);
  vi.doMock('@lib/calls/e2e/call', () => modules.call);
  vi.doMock('@lib/calls/e2e/crypto', () => ({
    ensureCryptoReady: vi.fn(async() => {}),
    ...modules.crypto
  }));

  let messageHandler: ((event: MessageEvent<any>) => void) | undefined;
  const previousTransform = (self as any).onrtctransform;
  const addListener = vi.spyOn(self as any, 'addEventListener').mockImplementation((...args: unknown[]) => {
    const [type, listener] = args as [string, (event: MessageEvent<any>) => void];
    if(type === 'message') messageHandler = listener;
  });
  const postMessage = vi.spyOn(self as any, 'postMessage').mockImplementation(() => {});
  const restore = () => {
    addListener.mockRestore();
    postMessage.mockRestore();
    (self as any).onrtctransform = previousTransform;
    vi.doUnmock('@lib/calls/e2e/keys');
    vi.doUnmock('@lib/calls/e2e/call');
    vi.doUnmock('@lib/calls/e2e/crypto');
    vi.resetModules();
  };

  try {
    await import('@lib/calls/e2e/encryptWorker');
    if(!messageHandler) throw new Error('encryptWorker did not install its message handler');
  } catch(err) {
    restore();
    throw err;
  }

  const dispatch = async(data: any) => {
    messageHandler!({data} as MessageEvent<any>);
    await vi.waitFor(() => {
      expect(postMessage.mock.calls.some(([response]) =>
        (response as {id?: number}).id === data.id
      )).toBe(true);
    });
  };
  return {dispatch, postMessage, restore};
}

describe('encryptWorker request seed lifecycle', () => {
  it('wipes every request seed and destroys a key whose init hydration fails', async() => {
    const derivedFrom: number[][] = [];
    const keys: Array<{destroy: ReturnType<typeof vi.fn>}> = [];
    const create = vi.fn(async() => {
      throw new Error('invalid initial block');
    });

    const {dispatch, postMessage, restore} = await loadWorker({
      keys: {
        PrivateKey: class {
          public static fromSeed(seed: Uint8Array) {
            derivedFrom.push([...seed]);
            const key = {destroy: vi.fn()};
            keys.push(key);
            return key;
          }
        }
      },
      call: {
        E2eCall: {
          createZeroBlock: vi.fn(async() => new Uint8Array([1])),
          createSelfAddBlock: vi.fn(async() => new Uint8Array([2])),
          create
        }
      }
    });

    try {
      const zeroSeed = new Uint8Array(32).fill(11);
      const selfAddSeed = new Uint8Array(32).fill(22);
      const initSeed = new Uint8Array(32).fill(33);

      await dispatch({
        kind: 'createZeroBlock',
        id: 1,
        args: {
          privateSeed: zeroSeed,
          groupState: {participants: [], externalPermissions: 0}
        }
      });
      await dispatch({
        kind: 'createSelfAddBlock',
        id: 2,
        args: {
          privateSeed: selfAddSeed,
          previousBlockServer: new Uint8Array([1]),
          self: {
            userId: BigInt(7),
            publicKey: new Uint8Array(32),
            canAddUsers: true,
            canRemoveUsers: true,
            version: 0
          }
        }
      });
      await dispatch({
        kind: 'init',
        id: 3,
        args: {
          userId: BigInt(7),
          privateSeed: initSeed,
          lastBlockServer: new Uint8Array([1])
        }
      });
      await dispatch({kind: 'getStatus', id: 4});

      expect(derivedFrom).toEqual([
        new Array(32).fill(11),
        new Array(32).fill(22),
        new Array(32).fill(33)
      ]);
      expect([...zeroSeed]).toEqual(new Array(32).fill(0));
      expect([...selfAddSeed]).toEqual(new Array(32).fill(0));
      expect([...initSeed]).toEqual(new Array(32).fill(0));
      expect(keys).toHaveLength(3);
      expect(keys.every(({destroy}) => destroy.mock.calls.length === 1)).toBe(true);
      expect(create).toHaveBeenCalledTimes(1);
      expect(postMessage).toHaveBeenCalledWith(expect.objectContaining({
        kind: 'err',
        id: 3,
        message: 'invalid initial block'
      }));
      expect(postMessage).toHaveBeenCalledWith(expect.objectContaining({
        kind: 'err',
        id: 4,
        message: 'Call not initialized'
      }));
    } finally {
      restore();
    }
  });
});

describe('encryptWorker rejoin transaction', () => {
  it('commits only the latest prepared block and queues one final-round verification broadcast', async() => {
    const firstPrepared = new Uint8Array([10]);
    const finalPrepared = new Uint8Array([20]);
    const reanchor = vi.fn(async() => {});
    const liveCall = {
      userId: BigInt(7),
      getHeight: () => 0,
      getGroupState: (): {participants: never[], externalPermissions: number} => ({
        participants: [],
        externalPermissions: 0
      }),
      getLastBlockHash: () => new Uint8Array(32),
      getVerificationState: (): undefined => undefined,
      getStatus: (): null => null,
      reanchor
    };
    const createSelfAddBlock = vi.fn()
    .mockResolvedValueOnce(firstPrepared)
    .mockResolvedValueOnce(finalPrepared);
    const destroyKey = vi.fn();

    const {dispatch, postMessage, restore} = await loadWorker({
      keys: {
        PrivateKey: class {
          public static fromSeed() {
            return {destroy: destroyKey};
          }
        }
      },
      call: {
        E2eCall: {
          create: vi.fn(async() => liveCall),
          createZeroBlock: vi.fn(),
          createSelfAddBlock
        }
      }
    });

    try {
      await dispatch({
        kind: 'init',
        id: 1,
        args: {userId: BigInt(7), privateSeed: new Uint8Array(32), lastBlockServer: new Uint8Array([1])}
      });
      postMessage.mockClear();
      const selfParticipant = {
        userId: BigInt(7),
        publicKey: new Uint8Array(32),
        canAddUsers: true,
        canRemoveUsers: true,
        version: 0
      };
      await dispatch({
        kind: 'prepareRejoinBlock',
        id: 2,
        args: {previousBlockServer: new Uint8Array([2]), self: selfParticipant}
      });
      await dispatch({
        kind: 'prepareRejoinBlock',
        id: 3,
        args: {previousBlockServer: new Uint8Array([3]), self: selfParticipant}
      });
      await dispatch({kind: 'commitRejoinBlock', id: 4});

      expect(reanchor).toHaveBeenCalledTimes(1);
      expect(reanchor).toHaveBeenCalledWith(finalPrepared);
      const pendingOutbound = postMessage.mock.calls.filter(([response]) => {
        const message = response as any;
        return message.kind === 'event' && message.event?.kind === 'pendingOutbound';
      });
      expect(pendingOutbound).toHaveLength(1);
    } finally {
      restore();
    }
  });
});

describe('encryptWorker key ownership', () => {
  const selfParticipant = {
    userId: BigInt(7),
    publicKey: new Uint8Array(32),
    canAddUsers: true,
    canRemoveUsers: true,
    version: 0
  };

  function keyModules() {
    const fromSeed = vi.fn((seed: Uint8Array) => ({
      publicKeyBytes: new Uint8Array(32).fill(seed[0]),
      destroy: vi.fn()
    }));
    const randomBytes = vi.fn((size: number) => new Uint8Array(size).fill(0x5a));
    const liveCall = {
      userId: BigInt(7),
      getHeight: () => 0,
      getGroupState: (): {participants: never[], externalPermissions: number} => ({
        participants: [],
        externalPermissions: 0
      }),
      getLastBlockHash: () => new Uint8Array(32),
      getVerificationState: (): undefined => undefined,
      getStatus: (): null => null,
      destroy: vi.fn()
    };
    const E2eCall = {
      create: vi.fn(async() => liveCall),
      createZeroBlock: vi.fn(async() => new Uint8Array([1])),
      createSelfAddBlock: vi.fn(async() => new Uint8Array([2]))
    };
    return {fromSeed, randomBytes, liveCall, E2eCall};
  }

  it('mints the key in the worker, returns only its public half and signs every seedless request with it', async() => {
    const {fromSeed, randomBytes, liveCall, E2eCall} = keyModules();
    const {dispatch, postMessage, restore} = await loadWorker({
      keys: {PrivateKey: {fromSeed}},
      call: {E2eCall},
      crypto: {randomBytes}
    });

    try {
      await dispatch({kind: 'createKey', id: 1});
      expect(randomBytes).toHaveBeenCalledWith(32);
      expect(fromSeed).toHaveBeenCalledTimes(1);
      const key = fromSeed.mock.results[0].value;
      // The seed lived exactly as long as the derivation.
      expect([...fromSeed.mock.calls[0][0]]).toEqual(new Array(32).fill(0));
      expect(postMessage).toHaveBeenCalledWith({kind: 'ok', id: 1, result: new Uint8Array(32).fill(0x5a)});

      await dispatch({
        kind: 'createZeroBlock',
        id: 2,
        args: {groupState: {participants: [], externalPermissions: 0}}
      });
      await dispatch({
        kind: 'createSelfAddBlock',
        id: 3,
        args: {previousBlockServer: new Uint8Array([1]), self: selfParticipant}
      });
      await dispatch({
        kind: 'init',
        id: 4,
        args: {userId: BigInt(7), lastBlockServer: new Uint8Array([1])}
      });

      expect(E2eCall.createZeroBlock).toHaveBeenCalledWith(key, expect.anything());
      expect(E2eCall.createSelfAddBlock).toHaveBeenCalledWith(key, expect.anything(), selfParticipant);
      expect(E2eCall.create).toHaveBeenCalledWith(BigInt(7), key, expect.anything());
      expect(fromSeed).toHaveBeenCalledTimes(1);
      expect(key.destroy).not.toHaveBeenCalled();

      // destroy wipes the call's epoch keys, not just the signing key.
      await dispatch({kind: 'destroy', id: 5});
      expect(liveCall.destroy).toHaveBeenCalledTimes(1);
      expect(key.destroy).toHaveBeenCalledTimes(1);
    } finally {
      restore();
    }
  });

  it('refuses to sign without a key and to mint one over a live call', async() => {
    const {fromSeed, randomBytes, E2eCall} = keyModules();
    const {dispatch, postMessage, restore} = await loadWorker({
      keys: {PrivateKey: {fromSeed}},
      call: {E2eCall},
      crypto: {randomBytes}
    });

    try {
      await dispatch({
        kind: 'createZeroBlock',
        id: 1,
        args: {groupState: {participants: [], externalPermissions: 0}}
      });
      expect(postMessage).toHaveBeenCalledWith(expect.objectContaining({
        kind: 'err',
        id: 1,
        message: 'no signing key: createKey first'
      }));
      expect(E2eCall.createZeroBlock).not.toHaveBeenCalled();

      await dispatch({kind: 'createKey', id: 2});
      await dispatch({
        kind: 'init',
        id: 3,
        args: {userId: BigInt(7), lastBlockServer: new Uint8Array([1])}
      });
      await dispatch({kind: 'createKey', id: 4});
      expect(postMessage).toHaveBeenCalledWith(expect.objectContaining({
        kind: 'err',
        id: 4,
        message: 'createKey: already initialized'
      }));
      expect(fromSeed).toHaveBeenCalledTimes(1);
    } finally {
      restore();
    }
  });
});

describe('ConferenceEntry.setSource', () => {
  it('refuses a source group carrying no sources', () => {
    const entry = new ConferenceEntry('0', 'audio');
    // The server picks these arrays. An empty one used to yield
    // `entry.source === undefined`, which then became a Map key in
    // entriesBySource — one bucket every such entry overwrites.
    const groups = [{_: 'groupCallParticipantVideoSourceGroup', semantics: 'FID', sources: []} as any];
    entry.setSource(groups);
    expect(entry.source).toBeUndefined();
    // `source` is undefined either way — what distinguishes the fix is that the
    // entry is left UNCONFIGURED rather than half-configured with a source group
    // it has no source for.
    expect(entry.sourceGroups).toBeUndefined();
  });

  it('accepts a real source', () => {
    const entry = new ConferenceEntry('0', 'video');
    entry.setSource([{_: 'groupCallParticipantVideoSourceGroup', semantics: 'FID', sources: [4242]} as any]);
    expect(entry.source).toBe(4242);
  });

  it('accepts a bare numeric source', () => {
    const entry = new ConferenceEntry('0', 'audio');
    entry.setSource(7);
    expect(entry.source).toBe(7);
  });
});
