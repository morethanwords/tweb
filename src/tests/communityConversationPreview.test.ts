import {describe, expect, it, vi} from 'vitest';
import {
  AppMessagesManager,
  HistoryType
} from '@appManagers/appMessagesManager';

function createPreviewManager() {
  const manager = Object.create(AppMessagesManager.prototype) as any;
  manager.conversationPreviewPromises = new Map();
  manager.conversationPreviewLoadQueue = {
    push: ({load}: {load: () => Promise<unknown>}): void => {
      void load();
    }
  };
  manager.getDialogOnly = vi.fn();
  manager.getMessageByPeer = vi.fn();
  manager.getHistory = vi.fn();
  return manager;
}

describe('Community conversation previews', () => {
  it('deduplicates preview loads and uses preview-only history', async() => {
    const manager = createPreviewManager();
    const peerId = 1 as PeerId;
    const message = {mid: 7};
    let resolveHistory: (result: {history: number[]}) => void;
    manager.getHistory.mockReturnValue(new Promise((resolve) => {
      resolveHistory = resolve;
    }));
    manager.getMessageByPeer.mockReturnValue(message);

    const first = manager.loadConversationPreviews([peerId]);
    const second = manager.loadConversationPreviews([peerId, peerId]);
    expect(manager.getHistory).toHaveBeenCalledOnce();
    expect(manager.getHistory).toHaveBeenCalledWith({
      peerId,
      limit: 1,
      previewOnly: true
    });

    resolveHistory({history: [message.mid]});
    await expect(first).resolves.toEqual([{
      peerId,
      dialog: undefined,
      lastMessage: message
    }]);
    await expect(second).resolves.toEqual([{
      peerId,
      dialog: undefined,
      lastMessage: message
    }]);
  });

  it('does not turn a peer forbidden when a preview is inaccessible', async() => {
    const manager = Object.create(AppMessagesManager.prototype) as any;
    manager.apiManager = {
      invokeApiSingle: vi.fn().mockRejectedValue({
        type: 'CHANNEL_PRIVATE'
      })
    };
    manager.appPeersManager = {
      getInputPeerById: vi.fn(() => ({_: 'inputPeerEmpty'}))
    };
    manager.appChatsManager = {
      getChat: vi.fn()
    };
    manager.saveApiResult = vi.fn();

    await expect(manager.requestHistory({
      peerId: 1 as PeerId,
      historyType: HistoryType.Chat,
      limit: 1,
      previewOnly: true
    })).rejects.toMatchObject({type: 'CHANNEL_PRIVATE'});
    expect(manager.appChatsManager.getChat).not.toHaveBeenCalled();
  });
});
