import {ChatFull} from '@layer';
import {AppMessagesManager} from '@appManagers/appMessagesManager';
import {AppProfileManager} from '@appManagers/appProfileManager';
import '@helpers/peerIdPolyfill';

const channelId = 50 as ChatId;
const peerId = channelId.toPeerId(true);
const generateMessageId = (id: number) => id > 0 ? 0x100000000 + id : id;
const mid = (serverId: number) => generateMessageId(serverId);

function makeMessagesManager(appProfileManager: unknown): any {
  const manager = new AppMessagesManager() as any;
  Object.assign(manager, {
    rootScope: {dispatchEvent: () => {}},
    appPeersManager: {isChannel: () => true},
    appMessagesIdsManager: {generateMessageId},
    appProfileManager,
    appTranslationsManager: {resetPeerTranslationsByChannelCutoff: () => new Set<number>()},
    dialogsStorage: {getForumTopicsCacheIfExists: (): undefined => undefined, clear: () => {}},
    filtersStorage: {clear: () => {}},
    monoforumDialogsStorage: {getDialogsByParentIfExists: (): undefined => undefined},
    messagesStorageByPeerId: {},
    historiesStorage: {},
    threadsStorage: {},
    searchesStorage: {},
    unreadMentions: {},
    pinnedMessages: {},
    missingMessages: new Set(),
    needSingleMessages: new Map(),
    inFlightSingleMessages: new Map(),
    richMessages: new Map(),
    richMessageRefreshes: new Map(),
    deletedMessages: new Set(),
    clearSearchCountersCache: () => {},
    flushPinnedMessagesCache: () => {},
    getDialogOnly: (): undefined => undefined,
    iterateHistoryStorages: () => {},
    onUpdateDeleteMessages: () => new Set<number>()
  });
  return manager;
}

/**
 * The wipe and the restore are one contract, so they are asserted together here. Asserting only
 * the wipe — as `appManagerCacheRaces` used to, in passing — reads like the whole feature and is
 * how the missing half went unnoticed.
 */
describe('channel available_min_id cutoff recovery', () => {
  test('a difference-too-long clear forgets the cutoff', () => {
    const manager = makeMessagesManager({
      getCachedFullChat: (): undefined => undefined,
      clearBotCommands: () => {}
    });

    manager.applyChannelAvailableMinId(channelId, 100);
    expect(manager.isMessageIdUnavailableByChannelCutoff(peerId, mid(50))).toBe(true);

    manager.clear(false);
    expect(manager.isMessageIdUnavailableByChannelCutoff(peerId, mid(50))).toBe(false);
  });

  test('a cached channelFull restores the forgotten cutoff', () => {
    // appProfileManager has no clear(), so `chatsFull` outlives the wipe above and stays the
    // only record of the cutoff. Reading it back has to re-arm the guard, otherwise every
    // cutoff check answers "available" until the cached entry expires.
    const profileManager = new AppProfileManager() as any;
    const fullChat = {_: 'channelFull', id: channelId, available_min_id: 100} as unknown as ChatFull.channelFull;
    const manager = makeMessagesManager(profileManager);
    Object.assign(profileManager, {
      chatsFull: {[channelId]: fullChat},
      fullExpiration: {[peerId]: Date.now() + 60_000},
      appMessagesManager: manager,
      clearBotCommands: () => {}
    });

    manager.applyChannelAvailableMinId(channelId, 100);
    manager.clear(false);
    expect(manager.isMessageIdUnavailableByChannelCutoff(peerId, mid(50))).toBe(false);

    expect(profileManager.getChannelFull(channelId)).toBe(fullChat);
    expect(manager.isMessageIdUnavailableByChannelCutoff(peerId, mid(50))).toBe(true);
    expect(manager.isMessageIdUnavailableByChannelCutoff(peerId, mid(150))).toBe(false);
  });

  test('reading the cache never lowers a cutoff an update has raised since', () => {
    const profileManager = new AppProfileManager() as any;
    const fullChat = {_: 'channelFull', id: channelId, available_min_id: 100} as unknown as ChatFull.channelFull;
    const manager = makeMessagesManager(profileManager);
    Object.assign(profileManager, {
      chatsFull: {[channelId]: fullChat},
      fullExpiration: {[peerId]: Date.now() + 60_000},
      appMessagesManager: manager,
      clearBotCommands: () => {}
    });

    manager.applyChannelAvailableMinId(channelId, 200);
    profileManager.getChannelFull(channelId);

    expect(manager.isMessageIdUnavailableByChannelCutoff(peerId, mid(150))).toBe(true);
  });
});
