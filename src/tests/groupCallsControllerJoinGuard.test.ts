/*
 * Type-guard tests for GroupCallsController.joinConference. The method must:
 *   - accept all three `InputGroupCall` constructor variants:
 *       inputGroupCall(id, access_hash) — canonical
 *       inputGroupCallSlug(slug)        — invite-link join
 *       inputGroupCallInviteMessage(msg_id) — invite-message join
 *   - reject any other tag with an informative `unsupported call ref kind`
 *     error before touching the worker or polling the chain.
 *
 * We stub `EncryptWorkerHost` and mock `appCallsManager.getGroupCallChainBlocks`
 * so the call exits with a sentinel error AFTER the guard, letting us assert
 * "the guard passed" without dragging in the SFU / streamManager / SDP stack.
 */

import {beforeEach, describe, expect, it, vi} from 'vitest';

// Replace the e2e worker with a no-op host so `new EncryptWorkerHost()` doesn't
// spawn a real Web Worker (which jsdom can't run). Must be hoisted via `vi.mock`
// before the controller import.
vi.mock('@lib/calls/e2e/encryptWorkerHost', () => {
  class EncryptWorkerHost {
    public async createKey(): Promise<Uint8Array> {
      return new Uint8Array(32);
    }
    public async createZeroBlock(_args: any): Promise<Uint8Array> {
      // Unreachable in these tests — the chain-blocks mock throws first.
      return new Uint8Array(0);
    }
    public async createSelfAddBlock(_args: any): Promise<Uint8Array> {
      return new Uint8Array(0);
    }
    public async terminate(): Promise<void> {}
  }
  return {EncryptWorkerHost};
});

import groupCallsController from '@lib/calls/groupCallsController';
import GROUP_CALL_STATE from '@lib/calls/groupCallState';
import type {InputGroupCall, Updates} from '@layer';

const SENTINEL_MESSAGE = '__guard_passed_sentinel__';

function installManagers(opts: {
  chainBlocksImpl?: (input: InputGroupCall, sub: number, offset: number, limit: number) => Promise<unknown>;
  processUpdateMessageImpl?: (updates: unknown) => MaybePromise<void>;
}) {
  const appCallsManagerMock = {
    getGroupCallChainBlocks: opts.chainBlocksImpl ?? (async() => {
      throw new Error(SENTINEL_MESSAGE);
    })
  };
  const apiUpdatesManagerMock = {
    processUpdateMessage: opts.processUpdateMessageImpl ?? (() => {})
  };

  Object.assign(groupCallsController as any, {
    managers: {
      appCallsManager: appCallsManagerMock,
      apiUpdatesManager: apiUpdatesManagerMock
    },
    log: Object.assign(() => {}, {warn: () => {}, error: () => {}, info: () => {}, debug: () => {}}),
    audioAsset: {
      createAudio: () => {},
      play: () => {},
      stop: () => {},
      playWithTimeout: () => {},
      cancelDelayedPlay: () => {}
    }
  });
}

const SELF_USER_ID = BigInt(1234);
const EXPECTED_CALL: InputGroupCall.inputGroupCall = {
  _: 'inputGroupCall',
  id: '700',
  access_hash: '701'
};

describe('GroupCallsController.joinConference — InputGroupCall type guard', () => {
  beforeEach(() => {
    installManagers({});
  });

  it('accepts inputGroupCall(id, access_hash) — guard does not throw', async() => {
    const input: InputGroupCall = {_: 'inputGroupCall', id: '777', access_hash: '888'};
    // Reaching the sentinel means we got past the guard, into
    // `fetchLastConferenceBlock` — exactly what we want to assert.
    await expect(
      groupCallsController.joinConference({input, selfUserId: SELF_USER_ID})
    ).rejects.toThrow(SENTINEL_MESSAGE);
  });

  it('accepts inputGroupCallSlug — guard does not throw', async() => {
    const input: InputGroupCall = {_: 'inputGroupCallSlug', slug: 'invite-link-slug'};
    await expect(
      groupCallsController.joinConference({
        input,
        expectedCanonicalInput: EXPECTED_CALL,
        selfUserId: SELF_USER_ID
      })
    ).rejects.toThrow(SENTINEL_MESSAGE);
  });

  it('accepts inputGroupCallInviteMessage — guard does not throw', async() => {
    const input: InputGroupCall = {_: 'inputGroupCallInviteMessage', msg_id: 555};
    await expect(
      groupCallsController.joinConference({
        input,
        expectedCanonicalInput: EXPECTED_CALL,
        selfUserId: SELF_USER_ID
      })
    ).rejects.toThrow(SENTINEL_MESSAGE);
  });

  it('rejects a non-canonical authorization without a preview identity', async() => {
    const input: InputGroupCall = {_: 'inputGroupCallSlug', slug: 'invite-link-slug'};
    await expect(
      groupCallsController.joinConference({input, selfUserId: SELF_USER_ID})
    ).rejects.toThrow(/requires an expected canonical identity/);
  });

  it('rejects any other tag with an informative error', async() => {
    // Cast through `any` — the type itself forbids the bad shape, but the
    // server could theoretically send any tag and we want defence-in-depth.
    const bogusInput = {_: 'inputGroupCallBogus', whatever: 1} as any;
    await expect(
      groupCallsController.joinConference({input: bogusInput, selfUserId: SELF_USER_ID})
    ).rejects.toThrow(/unsupported call ref kind/);

    // And the bad-tag error must mention the offending kind so logs are
    // actionable.
    await expect(
      groupCallsController.joinConference({input: bogusInput, selfUserId: SELF_USER_ID})
    ).rejects.toThrow(/inputGroupCallBogus/);
  });

  it('passes the input through to getGroupCallChainBlocks unchanged', async() => {
    // Side-channel assert: the chain-blocks mock receives the same object we
    // handed `joinConference`. Confirms there's no accidental rewriting of
    // slug/inviteMessage to the canonical id-form by the controller.
    const seen: InputGroupCall[] = [];
    installManagers({
      chainBlocksImpl: async(input: InputGroupCall) => {
        seen.push(input);
        throw new Error(SENTINEL_MESSAGE);
      }
    });

    const slugInput: InputGroupCall = {_: 'inputGroupCallSlug', slug: 'test-slug'};
    await expect(
      groupCallsController.joinConference({
        input: slugInput,
        expectedCanonicalInput: EXPECTED_CALL,
        selfUserId: SELF_USER_ID
      })
    ).rejects.toThrow(SENTINEL_MESSAGE);

    expect(seen.length).toBe(1);
    expect(seen[0]).toEqual(slugInput);
  });

  it('rejects a foreign chain update instead of treating it as the requested tip', async() => {
    const input: InputGroupCall = {_: 'inputGroupCall', id: '700', access_hash: '701'};
    installManagers({
      chainBlocksImpl: async() => ({
        _: 'updates',
        updates: [{
          _: 'updateGroupCallChainBlocks',
          call: {_: 'inputGroupCall', id: '999', access_hash: '1000'},
          sub_chain_id: 0,
          blocks: [new Uint8Array([1])],
          next_offset: 1
        }],
        users: [],
        chats: [],
        date: 0,
        seq: 0
      } satisfies Updates.updates)
    });

    await expect((groupCallsController as any).fetchLastConferenceBlock(input))
    .rejects.toThrow(/matching block update/);
  });

  it('accepts one canonical resolution for a slug and validates its cursor', async() => {
    const input: InputGroupCall = {_: 'inputGroupCallSlug', slug: 'invite'};
    const canonical: InputGroupCall.inputGroupCall = {
      _: 'inputGroupCall',
      id: '700',
      access_hash: '701'
    };
    installManagers({
      chainBlocksImpl: async() => ({
        _: 'updatesCombined',
        updates: [
          {
            _: 'updateGroupCall',
            pFlags: {},
            call: {
              _: 'groupCall',
              pFlags: {conference: true},
              id: canonical.id,
              access_hash: canonical.access_hash,
              participants_count: 1,
              unmuted_video_limit: 0,
              version: 1
            }
          },
          {
            _: 'updateGroupCallChainBlocks',
            call: canonical,
            sub_chain_id: 0,
            blocks: [new Uint8Array([5])],
            next_offset: 3
          }
        ],
        users: [],
        chats: [],
        date: 0,
        seq_start: 0,
        seq: 0
      } satisfies Updates.updatesCombined)
    });

    await expect((groupCallsController as any).fetchLastConferenceBlock(input, canonical)).resolves.toEqual({
      block: new Uint8Array([5]),
      nextOffset: 3
    });
  });

  it('waits for update processing before publishing the initial chain tip', async() => {
    let finishProcessing: () => void;
    const processing = new Promise<void>((resolve) => {
      finishProcessing = resolve;
    });
    installManagers({
      processUpdateMessageImpl: () => processing,
      chainBlocksImpl: async() => ({
        _: 'updateShort',
        update: {
          _: 'updateGroupCallChainBlocks',
          call: EXPECTED_CALL,
          sub_chain_id: 0,
          blocks: [new Uint8Array([9])],
          next_offset: 1
        },
        date: 0
      } satisfies Updates.updateShort)
    });

    let settled = false;
    const result = (groupCallsController as any).fetchLastConferenceBlock(EXPECTED_CALL).then((value: unknown) => {
      settled = true;
      return value;
    });
    await Promise.resolve();
    expect(settled).toBe(false);

    finishProcessing();
    await expect(result).resolves.toEqual({
      block: new Uint8Array([9]),
      nextOffset: 1
    });
  });

  it('rejects a chain cursor smaller than the returned block batch', async() => {
    const input: InputGroupCall = {_: 'inputGroupCall', id: '700', access_hash: '701'};
    installManagers({
      chainBlocksImpl: async() => ({
        _: 'updates',
        updates: [{
          _: 'updateGroupCallChainBlocks',
          call: input,
          sub_chain_id: 0,
          blocks: [new Uint8Array([1]), new Uint8Array([2])],
          next_offset: 1
        }],
        users: [],
        chats: [],
        date: 0,
        seq: 0
      } satisfies Updates.updates)
    });

    await expect((groupCallsController as any).fetchLastConferenceBlock(input))
    .rejects.toThrow(/invalid next_offset/);
  });

  it('observes initial legacy roster failure without rejecting an accepted join', async() => {
    let rejectRoster!: (reason: unknown) => void;
    const roster = new Promise<Map<PeerId, any>>((_resolve, reject) => {
      rejectRoster = reject;
    });
    const fakeCall = {
      connections: {main: {streamManager: {}}},
      onParticipantUpdate: vi.fn(),
      participants: roster,
      state: GROUP_CALL_STATE.MUTED
    };
    const join = vi.spyOn(groupCallsController as any, 'joinGroupCallInternal').mockResolvedValue(undefined);
    const warn = vi.fn();
    (groupCallsController as any).currentGroupCall = fakeCall;
    (groupCallsController as any).log.warn = warn;

    try {
      await expect(groupCallsController.joinGroupCall(1 as ChatId, 'call-id' as any, true, true))
      .resolves.toBeUndefined();
      const rosterError = new Error('initial roster proxy failed');
      rejectRoster(rosterError);
      await vi.waitFor(() => expect(warn).toHaveBeenCalledWith(
        'initial group call participant hydration failed',
        rosterError
      ));
    } finally {
      join.mockRestore();
      (groupCallsController as any).currentGroupCall = undefined;
    }
  });
});
