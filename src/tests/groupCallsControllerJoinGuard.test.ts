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
import type {InputGroupCall} from '@layer';

const SENTINEL_MESSAGE = '__guard_passed_sentinel__';

function installManagers(opts: {
  chainBlocksImpl?: (input: InputGroupCall, sub: number, offset: number, limit: number) => Promise<unknown>;
}) {
  const appCallsManagerMock = {
    getGroupCallChainBlocks: opts.chainBlocksImpl ?? (async() => {
      throw new Error(SENTINEL_MESSAGE);
    })
  };
  const apiUpdatesManagerMock = {
    processUpdateMessage: () => {}
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
      groupCallsController.joinConference({input, selfUserId: SELF_USER_ID})
    ).rejects.toThrow(SENTINEL_MESSAGE);
  });

  it('accepts inputGroupCallInviteMessage — guard does not throw', async() => {
    const input: InputGroupCall = {_: 'inputGroupCallInviteMessage', msg_id: 555};
    await expect(
      groupCallsController.joinConference({input, selfUserId: SELF_USER_ID})
    ).rejects.toThrow(SENTINEL_MESSAGE);
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
      groupCallsController.joinConference({input: slugInput, selfUserId: SELF_USER_ID})
    ).rejects.toThrow(SENTINEL_MESSAGE);

    expect(seen.length).toBe(1);
    expect(seen[0]).toEqual(slugInput);
  });
});
