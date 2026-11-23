import '@helpers/peerIdPolyfill';
import MTProtoMessagePort from '@lib/mainWorker/mainMessagePort';
import {AppMessagesManager} from '@appManagers/appMessagesManager';
import {makeChannelIds} from '@/tests/helpers/channelIds';
import {SliceEnd} from '@helpers/slicedArray';
import {logger, LogTypes} from '@lib/logger';
import {getMiddleware} from '@helpers/middleware';
import {Message} from '@layer';

// A chat that cannot be shown (a restriction: sensitive content, an age check) shows nothing, and remembers nothing of
// it: once it can be shown - sensitive content allowed, the age confirmed, with no reload - its history loads page by
// page as any other's, instead of stopping at the first page as if that were all of it.

const {peerId, idsManager, mid} = makeChannelIds();

function setup() {
  vi.spyOn(MTProtoMessagePort, 'getInstance').mockReturnValue({invokeVoid: vi.fn()} as any);

  let restricted = true;
  const manager = new AppMessagesManager();
  Object.assign(manager as any, {
    log: logger('MESSAGES', LogTypes.None),
    middleware: getMiddleware(),
    messagesStorageByPeerId: {},
    historiesStorage: {},
    appMessagesIdsManager: idsManager,
    appPeersManager: {
      isPeerRestricted: () => restricted,
      isBroadcast: () => false,
      isChannel: () => true,
      isMonoforum: () => false,
      isBotforum: () => false,
      getPeerMigratedTo: (): PeerId => undefined
    },
    appChatsManager: {isForum: () => false},
    rootScope: {dispatchEvent: vi.fn()}
  });
  vi.spyOn(manager, 'getMigration').mockReturnValue(undefined);
  vi.spyOn(manager as any, 'mergeReplyKeyboard').mockReturnValue(false);

  // * the newest page of a channel of 100 posts
  vi.spyOn(manager, 'requestHistory').mockImplementation(async({limit}) => {
    const messages = Array.from({length: limit}, (_, idx) => {
      const message = {_: 'message', id: mid(100 - idx), mid: mid(100 - idx), peerId, date: 100 - idx, message: '', pFlags: {}} as any as Message.message;
      manager.setMessageToStorage(manager.getHistoryMessagesStorage(peerId), message);
      return message;
    });
    return {_: 'messages.channelMessages', messages, count: 100, chats: [], users: [], topics: [], pts: 1, pFlags: {}} as any;
  });

  return {manager, lift: () => restricted = false};
}

describe('a chat that could not be shown', () => {
  test('shows nothing while it cannot', async() => {
    const {manager} = setup();
    const result = await manager.getHistory({peerId, limit: 20});
    expect(result).toMatchObject({count: 0, history: [], isEnd: {top: true, bottom: true}});
    expect(manager.requestHistory).not.toHaveBeenCalled();
  });

  test('loads its history page by page once it can', async() => {
    const {manager, lift} = setup();
    await manager.getHistory({peerId, limit: 20});
    lift();

    const result = await manager.getHistory({peerId, limit: 20});
    expect(result.history).toHaveLength(20);
    expect(result.isEnd.top).toBe(false);
    expect(manager.getHistoryStorage(peerId).history.first.isEnd(SliceEnd.Top)).toBe(false);
  });
});
