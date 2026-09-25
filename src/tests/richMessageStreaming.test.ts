import {describe, expect, test, vi} from 'vitest';
import '@helpers/peerIdPolyfill';
import {AppMessagesManager} from '@appManagers/appMessagesManager';
import {AppProfileManager} from '@appManagers/appProfileManager';
import type {InputPeer, RichMessage, SendMessageAction, Update} from '@layer';

const peerId = (42 as UserId).toPeerId(false);
const channelPeerId = (100 as ChatId).toPeerId(true);
const inputPeer: InputPeer.inputPeerUser = {
  _: 'inputPeerUser',
  user_id: 42,
  access_hash: '1'
};
const output: RichMessage.richMessage = {
  _: 'richMessage',
  pFlags: {},
  blocks: [{
    _: 'pageBlockThinking',
    text: {_: 'textPlain', text: 'Working'}
  }],
  photos: [],
  documents: []
};

describe('rich-message streaming actions', () => {
  test('validates and sends input rich drafts in streaming mode', async() => {
    const manager = new AppMessagesManager();
    const invokeApi = vi.fn().mockResolvedValue(true);
    const action: SendMessageAction.inputSendMessageRichMessageDraftAction = {
      _: 'inputSendMessageRichMessageDraftAction',
      pFlags: {},
      random_id: '10',
      rich_message: {
        _: 'inputRichMessage',
        pFlags: {},
        blocks: [{
          _: 'pageBlockParagraph',
          text: {_: 'textPlain', text: 'Working'}
        }]
      }
    };

    Object.assign(manager as any, {
      apiManager: {
        getAppConfig: vi.fn().mockResolvedValue({}),
        invokeApi
      },
      appPeersManager: {
        getInputPeerById: () => inputPeer,
        isBotforum: () => true,
        isForum: () => false,
        isMonoforum: () => false,
        peerId: (99 as UserId).toPeerId(false)
      }
    });
    vi.spyOn(manager, 'canSendToPeer').mockResolvedValue(true);
    const assertRichMessage = vi.spyOn(manager, 'assertRichMessage');

    await manager.setTyping(peerId, action, undefined, 7);

    expect(assertRichMessage).toHaveBeenCalledWith(action.rich_message, {streaming: true});
    expect(invokeApi).toHaveBeenCalledWith('messages.setTyping', {
      peer: inputPeer,
      top_msg_id: 7,
      action
    });
  });

  test('builds an optimistic botforum draft bubble with rich content', () => {
    const manager = new AppMessagesManager();
    Object.assign(manager as any, {
      appPeersManager: {
        getOutputPeer: () => ({_: 'peerUser', user_id: 42})
      },
      timeManager: {getServerTimeOffset: () => 0, getServerTime: () => Math.floor(Date.now() / 1000)}
    });
    vi.spyOn(manager, 'generateTempMessageId').mockReturnValue(-1);

    const message = (manager as any).generateStreamedMessage({
      peerId,
      authorId: peerId,
      threadId: 7,
      tempId: -1,
      randomId: '10',
      date: 1,
      content: {kind: 'rich', richMessage: output}
    });

    expect(message.message).toBe('');
    expect(message.entities).toBeUndefined();
    expect(message.rich_message).toEqual(output);
  });

  test('routes incoming rich botforum drafts to the draft-message handler', () => {
    const manager = new AppProfileManager();
    const handleStreamedMessageTypingUpdate = vi.fn();
    const update: Update.updateUserTyping = {
      _: 'updateUserTyping',
      user_id: 42,
      action: {
        _: 'sendMessageRichMessageDraftAction',
        pFlags: {},
        random_id: '10',
        rich_message: output
      }
    };
    Object.assign(manager as any, {
      appPeersManager: {
        getPeerId: () => peerId,
        peerId: (99 as UserId).toPeerId(false)
      },
      appMessagesManager: {handleStreamedMessageTypingUpdate},
      appMessagesIdsManager: {generateMessageId: (mid: number) => mid},
      typingsInPeer: {}
    });

    (manager as any).onUpdateUserTyping(update);

    expect(handleStreamedMessageTypingUpdate).toHaveBeenCalledWith(update);
  });

  test('routes incoming channel rich drafts to the draft-message handler', () => {
    const manager = new AppProfileManager();
    const handleStreamedMessageTypingUpdate = vi.fn();
    const update: Update.updateChannelUserTyping = {
      _: 'updateChannelUserTyping',
      channel_id: 100,
      top_msg_id: 7,
      from_id: {_: 'peerUser', user_id: 42},
      action: {
        _: 'sendMessageRichMessageDraftAction',
        pFlags: {},
        random_id: '10',
        rich_message: output
      }
    };
    Object.assign(manager as any, {
      appPeersManager: {
        getPeerId: (value: typeof update | typeof update.from_id) => value._ === 'updateChannelUserTyping' ?
          channelPeerId :
          peerId,
        peerId: (99 as UserId).toPeerId(false)
      },
      appMessagesManager: {handleStreamedMessageTypingUpdate},
      appMessagesIdsManager: {generateMessageId: (mid: number) => mid},
      typingsInPeer: {}
    });

    (manager as any).onUpdateUserTyping(update);

    expect(handleStreamedMessageTypingUpdate).toHaveBeenCalledWith(update);
  });

  // Incoming revision, scope, adoption and TTL coverage now lives in
  // streamedMessageManager.test.ts and streamedMessageDrafts.test.ts.
});
