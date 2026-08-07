import {describe, expect, it, vi} from 'vitest';
import '@helpers/peerIdPolyfill';
import {AppProfileManager} from '@appManagers/appProfileManager';

describe('Community profile routing', () => {
  it('reads Community full data from the shared Profile cache', () => {
    const communityId = 123 as ChatId;
    const full = {
      _: 'communityFull',
      pFlags: {},
      id: communityId,
      about: 'Community'
    } as any;
    const invokeApiSingleProcess = vi.fn(() => {
      throw new Error('A fresh request must not be used for a valid cached Full');
    });
    const manager = new AppProfileManager();
    Object.assign(manager as any, {
      chatsFull: {[communityId]: full},
      fullExpiration: {
        [communityId.toPeerId(true)]: Date.now() + 60_000
      },
      appChatsManager: {
        isCommunity: (chatId: ChatId) => chatId === communityId,
        isChannel: vi.fn(() => false)
      },
      apiManager: {invokeApiSingleProcess}
    });

    expect(manager.getChatFull(communityId)).toBe(full);
    expect(manager.getCachedFullChat(communityId)).toBe(full);
    expect(invokeApiSingleProcess).not.toHaveBeenCalled();
  });
});
