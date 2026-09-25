import {describe, expect, test, vi} from 'vitest';
import '@helpers/peerIdPolyfill';
import {AppMessagesManager} from '@appManagers/appMessagesManager';
import type {InputPeer, Message, Updates} from '@layer';

const sourcePeerId = (42 as UserId).toPeerId(false);
const targetPeerId = (43 as UserId).toPeerId(false);
const selfPeerId = (1 as UserId).toPeerId(false);
const mid = 7;

const inputPeer: InputPeer.inputPeerUser = {
  _: 'inputPeerUser',
  user_id: 42,
  access_hash: '1'
};

function makeUpdates(): Updates.updates {
  return {
    _: 'updates',
    updates: [],
    users: [],
    chats: [],
    date: 0,
    seq: 0
  };
}

function makeSourceMessage(rich: boolean): Message.message {
  return {
    _: 'message',
    id: mid,
    mid,
    peerId: sourcePeerId,
    fromId: sourcePeerId,
    pFlags: {},
    date: 1,
    message: 'forward me',
    rich_message: rich ? {
      _: 'richMessage',
      pFlags: {},
      blocks: [{
        _: 'pageBlockParagraph',
        text: {_: 'textPlain', text: 'forward me'}
      }],
      photos: [],
      documents: []
    } : undefined
  } as Message.message;
}

function makeManager(options: {premium: boolean, rich: boolean}) {
  const manager = new AppMessagesManager();
  const sourceMessage = makeSourceMessage(options.rich);
  const outgoingMessages: Message.message[] = [];
  const invokeApiAfter = vi.fn().mockResolvedValue(makeUpdates());
  const generateForwardHeader = vi.fn().mockReturnValue({
    _: 'messageFwdHeader',
    pFlags: {},
    date: sourceMessage.date
  });

  Object.assign(manager as any, {
    apiManager: {
      getConfig: vi.fn().mockResolvedValue({forwarded_count_max: 100}),
      invokeApiAfter
    },
    apiUpdatesManager: {
      processPaidMessageUpdate: vi.fn(),
      processUpdateMessage: vi.fn()
    },
    appMessagesIdsManager: {
      splitMessageIdsByChannels: vi.fn((mids: number[]) => [[undefined, {mids, messageIds: mids}]]),
      generateMessageId: vi.fn((id: number) => id)
    },
    appPeersManager: {
      peerId: selfPeerId,
      getInputPeerById: vi.fn(() => inputPeer),
      getPeerMigratedTo: vi.fn(),
      isBotforum: vi.fn().mockReturnValue(false),
      isChannel: vi.fn().mockReturnValue(false)
    },
    repayRequestHandler: {tryRegisterRequest: vi.fn()},
    rootScope: {premium: options.premium},
    log: vi.fn()
  });

  vi.spyOn(manager, 'checkSendOptions').mockResolvedValue({
    appConfig: {rich_message_posting: 'enabled'}
  } as any);
  vi.spyOn(manager, 'getMessageByPeer').mockReturnValue(sourceMessage);
  vi.spyOn(manager, 'generateOutgoingMessage').mockImplementation((peerId) => {
    const message = {
      _: 'message',
      id: -mid,
      mid: -mid,
      peerId,
      pFlags: {},
      date: 1,
      message: '',
      random_id: '1'
    } as Message.message;
    outgoingMessages.push(message);
    return message;
  });
  vi.spyOn(manager, 'beforeMessageSending').mockImplementation(() => undefined);
  vi.spyOn(manager, 'getInputReplyTo').mockReturnValue(undefined);
  vi.spyOn(manager as any, 'generateForwardHeader').mockImplementation(generateForwardHeader);
  vi.spyOn(manager as any, 'onMessagesSendError').mockImplementation(() => undefined);
  const forwardMessagesInner = vi.spyOn(manager, 'forwardMessagesInner');

  return {
    forwardMessagesInner,
    generateForwardHeader,
    invokeApiAfter,
    manager,
    outgoingMessages
  };
}

async function forwardWithoutAuthor(manager: AppMessagesManager, dropCaptions = false) {
  await manager.forwardMessages({
    peerId: targetPeerId,
    fromPeerId: sourcePeerId,
    mids: [mid],
    dropAuthor: true,
    dropCaptions
  });
}

describe('rich-message forward author privacy', () => {
  test('keeps the rich author for non-Premium even when rich posting is enabled', async() => {
    const {
      forwardMessagesInner,
      generateForwardHeader,
      invokeApiAfter,
      manager,
      outgoingMessages
    } = makeManager({premium: false, rich: true});

    await forwardWithoutAuthor(manager);

    expect(forwardMessagesInner).toHaveBeenCalledWith(expect.objectContaining({
      allowDropRichAuthor: false,
      dropAuthor: true
    }));
    expect(generateForwardHeader).toHaveBeenCalledTimes(1);
    expect(outgoingMessages[0].fwd_from).toBeDefined();
    expect(invokeApiAfter).toHaveBeenCalledWith(
      'messages.forwardMessages',
      expect.objectContaining({
        drop_author: undefined,
        drop_media_captions: undefined
      }),
      expect.any(Object)
    );
  });

  test('allows Premium to hide the rich author', async() => {
    const {
      forwardMessagesInner,
      generateForwardHeader,
      manager,
      outgoingMessages
    } = makeManager({premium: true, rich: true});

    await forwardWithoutAuthor(manager);

    expect(forwardMessagesInner).toHaveBeenCalledWith(expect.objectContaining({
      allowDropRichAuthor: true,
      dropAuthor: true
    }));
    expect(generateForwardHeader).not.toHaveBeenCalled();
    expect(outgoingMessages[0].fwd_from).toBeUndefined();
  });

  test('preserves captions together with the author for protected rich forwards', async() => {
    const {invokeApiAfter, manager} = makeManager({premium: false, rich: true});

    await forwardWithoutAuthor(manager, true);

    expect(invokeApiAfter).toHaveBeenCalledWith(
      'messages.forwardMessages',
      expect.objectContaining({
        drop_author: undefined,
        drop_media_captions: undefined
      }),
      expect.any(Object)
    );
  });

  test('still hides the author of an ordinary forward for non-Premium', async() => {
    const {
      forwardMessagesInner,
      generateForwardHeader,
      manager,
      outgoingMessages
    } = makeManager({premium: false, rich: false});

    await forwardWithoutAuthor(manager);

    expect(forwardMessagesInner).toHaveBeenCalledWith(expect.objectContaining({
      allowDropRichAuthor: false,
      dropAuthor: true
    }));
    expect(generateForwardHeader).not.toHaveBeenCalled();
    expect(outgoingMessages[0].fwd_from).toBeUndefined();
  });
});
