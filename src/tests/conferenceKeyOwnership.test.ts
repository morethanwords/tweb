/*
 * The conference signing key is generated inside the encrypt worker; the main
 * thread only ever handles the public key. These tests pin the controller's
 * side of that contract: every worker RPC the create / join paths issue is
 * seedless, and the public key advertised to the server is the one the worker
 * returned from `createKey`.
 */

import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

const hostMocks = vi.hoisted(() => ({
  hosts: [] as any[],
  createKeyError: undefined as Error | undefined
}));

vi.mock('@lib/calls/e2e/encryptWorkerHost', () => {
  class EncryptWorkerHost {
    public createKey = vi.fn(async() => {
      if(hostMocks.createKeyError) throw hostMocks.createKeyError;
      return new Uint8Array(32).fill(0x2b);
    });
    public createZeroBlock = vi.fn(async() => new Uint8Array([1]));
    public createSelfAddBlock = vi.fn(async() => new Uint8Array([2]));
    public prepareRejoinBlock = vi.fn(async() => new Uint8Array([3]));
    public commitRejoinBlock = vi.fn(async() => {});
    public init = vi.fn(async() => {});
    public terminate = vi.fn(async() => {});

    constructor() {
      hostMocks.hosts.push(this);
    }
  }
  return {EncryptWorkerHost};
});
vi.mock('@lib/calls/groupCallInstance', () => ({default: class {}}));

import {GroupCallsController} from '@lib/calls/groupCallsController';
import type {InputGroupCall} from '@layer';

const INPUT: InputGroupCall = {_: 'inputGroupCall', id: '700', access_hash: '701'};
const SELF_USER_ID = BigInt(42);
const WORKER_PUBLIC_KEY = new Uint8Array(32).fill(0x2b);
const EXPECTED_SELF = {
  userId: SELF_USER_ID,
  publicKey: WORKER_PUBLIC_KEY,
  canAddUsers: true,
  canRemoveUsers: true,
  version: 0
};

function makeController() {
  const controller = new GroupCallsController();
  Object.assign(controller as any, {
    log: Object.assign(vi.fn(), {warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn(), bindPrefix: () => vi.fn()}),
    audioAsset: {createAudio: vi.fn(), play: vi.fn(), stop: vi.fn(), playWithTimeout: vi.fn(), cancelDelayedPlay: vi.fn()},
    managers: {}
  });
  return controller;
}

describe('conference join paths — worker-owned signing key', () => {
  beforeEach(() => {
    hostMocks.hosts.length = 0;
    hostMocks.createKeyError = undefined;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('creates a conference with a key minted by the worker and no seed on this thread', async() => {
    const controller = makeController();
    const joined = {id: INPUT.id} as any;
    const common = vi.spyOn(controller as any, 'joinConferenceCommon').mockResolvedValue(joined);

    await expect(controller.startConference({selfUserId: SELF_USER_ID, muted: true})).resolves.toBe(joined);

    expect(hostMocks.hosts).toHaveLength(1);
    const [worker] = hostMocks.hosts;
    expect(worker.createKey).toHaveBeenCalledTimes(1);
    expect(worker.createZeroBlock).toHaveBeenCalledWith({
      groupState: {participants: [EXPECTED_SELF], externalPermissions: 3}
    });
    const commonArgs = common.mock.calls[0][0] as Record<string, unknown>;
    expect(commonArgs).toMatchObject({
      createConference: true,
      worker,
      publicKey: WORKER_PUBLIC_KEY,
      selfUserId: SELF_USER_ID,
      lastBlockServer: new Uint8Array([1])
    });
    expect(commonArgs).not.toHaveProperty('seed');
  });

  it('joins an existing conference with a seedless self-add on the fetched chain tip', async() => {
    const controller = makeController();
    vi.spyOn(controller as any, 'fetchLastConferenceBlock').mockResolvedValue({block: new Uint8Array([7]), nextOffset: 1});
    const joined = {id: INPUT.id} as any;
    const common = vi.spyOn(controller as any, 'joinConferenceCommon').mockResolvedValue(joined);

    await expect(controller.joinConference({input: INPUT, selfUserId: SELF_USER_ID})).resolves.toBe(joined);

    const [worker] = hostMocks.hosts;
    expect(worker.createKey).toHaveBeenCalledTimes(1);
    expect(worker.createSelfAddBlock).toHaveBeenCalledWith({
      previousBlockServer: new Uint8Array([7]),
      self: EXPECTED_SELF
    });
    expect(worker.createZeroBlock).not.toHaveBeenCalled();
    const commonArgs = common.mock.calls[0][0] as Record<string, unknown>;
    expect(commonArgs).toMatchObject({worker, publicKey: WORKER_PUBLIC_KEY, lastBlockServer: new Uint8Array([2])});
    expect(commonArgs).not.toHaveProperty('seed');
  });

  it('joins an empty chain with a seedless zero block', async() => {
    const controller = makeController();
    vi.spyOn(controller as any, 'fetchLastConferenceBlock').mockResolvedValue({block: undefined, nextOffset: 0});
    vi.spyOn(controller as any, 'joinConferenceCommon').mockResolvedValue({id: INPUT.id});

    await controller.joinConference({input: INPUT, selfUserId: SELF_USER_ID});

    const [worker] = hostMocks.hosts;
    expect(worker.createZeroBlock).toHaveBeenCalledWith({
      groupState: {participants: [EXPECTED_SELF], externalPermissions: 3}
    });
    expect(worker.createSelfAddBlock).not.toHaveBeenCalled();
  });

  it('tears the worker down when it cannot mint a key', async() => {
    const controller = makeController();
    const common = vi.spyOn(controller as any, 'joinConferenceCommon');
    hostMocks.createKeyError = new Error('worker crashed');

    await expect(controller.startConference({selfUserId: SELF_USER_ID})).rejects.toThrow('worker crashed');

    const [worker] = hostMocks.hosts;
    expect(worker.terminate).toHaveBeenCalledTimes(1);
    expect(worker.createZeroBlock).not.toHaveBeenCalled();
    expect(common).not.toHaveBeenCalled();
  });
});
