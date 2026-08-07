import {createRoot} from 'solid-js';
import {beforeEach, describe, expect, it, vi} from 'vitest';
import type {CommunityPeerRequest} from '@layer';
import '@helpers/peerIdPolyfill';

const mocks = vi.hoisted(() => ({
  hideToast: vi.fn(),
  toast: vi.fn(),
  toastNew: vi.fn()
}));

vi.mock('@components/toast', () => mocks);

import {
  default as createCommunityPendingRequestActions
} from '@components/communities/communityPendingRequestActions';

const request = (channelId: ChatId): CommunityPeerRequest => ({
  _: 'communityPeerRequest',
  pFlags: {visible: true},
  peer: {_: 'peerChannel', channel_id: channelId},
  requested_by: 1,
  date: 1
});

describe('community pending request actions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('restores a staged row and skips the RPC when Undo is clicked', () => {
    const apply = vi.fn().mockResolvedValue(undefined);
    let actions: ReturnType<typeof createCommunityPendingRequestActions>;
    const dispose = createRoot((dispose) => {
      actions = createCommunityPendingRequestActions({
        apply,
        onError: vi.fn()
      });
      return dispose;
    });
    const value = request(10 as ChatId);
    const peerId = (10 as ChatId).toPeerId(true);

    actions.stage(value, false);

    expect(actions.stagedPeerIds().has(peerId)).toBe(true);
    expect(apply).not.toHaveBeenCalled();
    const [content, onClose] = mocks.toast.mock.calls[0];
    content.querySelector('a').click();
    onClose();

    expect(actions.stagedPeerIds().has(peerId)).toBe(false);
    expect(mocks.hideToast).toHaveBeenCalledOnce();
    expect(apply).not.toHaveBeenCalled();
    dispose();
  });

  it('commits after the Undo toast closes and flushes on cleanup', async() => {
    const apply = vi.fn().mockResolvedValue(undefined);
    let actions: ReturnType<typeof createCommunityPendingRequestActions>;
    const dispose = createRoot((dispose) => {
      actions = createCommunityPendingRequestActions({
        apply,
        onError: vi.fn()
      });
      return dispose;
    });
    const first = request(10 as ChatId);
    const second = request(11 as ChatId);

    actions.stage(first, true);
    const onFirstClose = mocks.toast.mock.calls[0][1];
    onFirstClose();
    await actions.flush();

    expect(apply).toHaveBeenCalledWith(first, true);

    actions.stage(second, false);
    dispose();
    await vi.waitFor(() => {
      expect(apply).toHaveBeenCalledWith(second, false);
    });
  });
});
