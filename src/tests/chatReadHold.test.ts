import {loadChatBubbles, LOAD_CHAT_BUBBLES_TIMEOUT} from '@/tests/helpers/chatBubbles';
import '@helpers/peerIdPolyfill';
import type {PeerSettings} from '@layer';
import {ChatType} from '@components/chat/chatType';

let ChatBubbles: typeof import('@components/chat/bubbles').default;
let AppProfileManager: typeof import('@appManagers/appProfileManager').AppProfileManager;
let AppMessagesManager: typeof import('@appManagers/appMessagesManager').AppMessagesManager;
let apiManagerProxy: typeof import('@lib/apiManagerProxy').default;
let rootScope: typeof import('@lib/rootScope').default;

const MY_ID = 7 as PeerId;
const USER_ID = 42 as PeerId;

const SUSPICIOUS: PeerSettings = {_: 'peerSettings', pFlags: {report_spam: true, block_contact: true, add_contact: true}};
const CLEAN: PeerSettings = {_: 'peerSettings', pFlags: {add_contact: true}};

beforeAll(async() => {
  ChatBubbles = (await loadChatBubbles()).bubbles.default;
  AppProfileManager = (await import('@appManagers/appProfileManager')).AppProfileManager;
  AppMessagesManager = (await import('@appManagers/appMessagesManager')).AppMessagesManager;
  apiManagerProxy = (await import('@lib/apiManagerProxy')).default;
  rootScope = (await import('@lib/rootScope')).default;
  rootScope.myId = MY_ID;
}, LOAD_CHAT_BUBBLES_TIMEOUT);

afterEach(() => {
  vi.mocked(apiManagerProxy.getUser).mockReset();
});

function createHarness(peerId: PeerId, peerSettings?: PeerSettings) {
  const readHistory = vi.fn(() => Promise.resolve());
  const readAllHistory = vi.fn();
  const markDialogUnread = vi.fn();
  const harness = Object.assign(Object.create(ChatBubbles.prototype), {
    chat: {
      peerId,
      type: ChatType.Chat,
      isPreview: false,
      historyMaxId: 150,
      getHistoryMaxId() {
        return this.historyMaxId;
      }
    },
    managers: {appMessagesManager: {readHistory, readAllHistory, markDialogUnread}},
    unreaded: new Map<HTMLElement, number>(),
    unreadedSeen: new Set<number>(),
    unreadedChat: {peerId},
    observer: {unobserve: vi.fn()},
    scrollable: {loadedAll: {top: false, bottom: false}},
    getRenderedHistory: (): string[] => undefined,
    getMiddleware: () => () => true,
    log: Object.assign(vi.fn(), {error: vi.fn(), warn: vi.fn()}),
    messageLinkPolicyStates: new Set(),
    hiddenLinksPendingBubbles: new Set(),
    handleMessageLinkPolicyChange: vi.fn()
  }) as any;

  if(peerSettings) {
    harness.setPeerSettings(peerId, peerSettings);
  }

  return {harness, readHistory, readAllHistory, markDialogUnread};
}

const see = (harness: any, mid: number) => {
  const element = document.createElement('div');
  harness.unreaded.set(element, mid);
  harness.onUnreadedInViewport('history', element, mid);
};

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('reads in a suspicious user\'s chat', () => {
  test('what is seen is read only once the bar stops offering to report the user', async() => {
    const {harness, readHistory} = createHarness(USER_ID, SUSPICIOUS);
    see(harness, 100);
    see(harness, 101);
    await settle();
    expect(readHistory).not.toHaveBeenCalled();

    harness.setPeerSettings(USER_ID, CLEAN);
    await settle();
    expect(readHistory).toHaveBeenCalledOnce();
    expect(readHistory).toHaveBeenCalledWith(expect.objectContaining({peerId: USER_ID, maxId: 101}));
  });

  test('a message coming in at the bottom waits like the rest', async() => {
    const {harness, readHistory} = createHarness(USER_ID, SUSPICIOUS);
    harness.scrollable.loadedAll.bottom = true;
    harness.onScrolledAllDown();
    see(harness, 150);
    await settle();
    expect(readHistory).not.toHaveBeenCalled();

    harness.setPeerSettings(USER_ID, CLEAN);
    await settle();
    expect(readHistory).toHaveBeenCalledWith(expect.objectContaining({peerId: USER_ID, maxId: 150, force: true}));
    expect(readHistory).toHaveBeenCalledWith(expect.objectContaining({peerId: USER_ID, maxId: 150}));
  });

  test('the composer\'s reads wait too, and the one after a send is made once the hold goes', async() => {
    const {harness, readHistory, readAllHistory} = createHarness(USER_ID, SUSPICIOUS);
    harness.readAllHistory();
    harness.readAllHistory(true);
    expect(readAllHistory).not.toHaveBeenCalled();

    harness.setPeerSettings(USER_ID, CLEAN);
    expect(readAllHistory).not.toHaveBeenCalled();
    expect(readHistory).toHaveBeenCalledOnce();
    expect(readHistory).toHaveBeenCalledWith(expect.objectContaining({peerId: USER_ID, maxId: 150, force: true}));
  });

  test('a read put off at the bottom does not take the messages that came after it', async() => {
    const {harness, readHistory} = createHarness(USER_ID, SUSPICIOUS);
    harness.onScrolledAllDown();
    harness.chat.historyMaxId = 170;
    harness.readAllHistory(true);
    harness.chat.historyMaxId = 190;

    harness.setPeerSettings(USER_ID, CLEAN);
    expect(readHistory).toHaveBeenCalledOnce();
    expect(readHistory).toHaveBeenCalledWith(expect.objectContaining({maxId: 170, force: true}));
  });

  test('opening a chat marked unread clears the mark only once the hold goes, as far as the chat was then', () => {
    const {harness, readHistory, markDialogUnread} = createHarness(USER_ID, SUSPICIOUS);
    harness.readUnreadMark(160);
    expect(markDialogUnread).not.toHaveBeenCalled();

    harness.setPeerSettings(USER_ID, CLEAN);
    expect(markDialogUnread).toHaveBeenCalledWith({peerId: USER_ID, monoforumThreadId: undefined, read: true, maxId: 160});
    expect(readHistory).not.toHaveBeenCalled();

    const plain = createHarness(USER_ID, CLEAN);
    plain.harness.readUnreadMark(160);
    expect(plain.markDialogUnread).toHaveBeenCalledWith({peerId: USER_ID, monoforumThreadId: undefined, read: true});
  });

  test('a hold that comes while the read waits is kept', async() => {
    const {harness, readHistory} = createHarness(USER_ID, CLEAN);
    see(harness, 100);
    harness.peerSettings = SUSPICIOUS;
    await settle();
    expect(readHistory).not.toHaveBeenCalled();
    expect(harness.readPromise).toBeUndefined();

    harness.setPeerSettings(USER_ID, CLEAN);
    await settle();
    expect(readHistory).toHaveBeenCalledWith(expect.objectContaining({maxId: 100}));
  });

  test('a user who is not a contact is held until the settings come', async() => {
    vi.mocked(apiManagerProxy.getUser).mockReturnValue({_: 'user', id: USER_ID, pFlags: {}} as any);
    const {harness, readHistory} = createHarness(USER_ID);
    see(harness, 100);
    await settle();
    expect(readHistory).not.toHaveBeenCalled();

    harness.setPeerSettings(USER_ID, CLEAN);
    await settle();
    expect(readHistory).toHaveBeenCalledWith(expect.objectContaining({maxId: 100}));
  });

  const jumpWithinTheChat = (harness: any) => {
    const restore = harness.keepHeldReads();
    // * what the cleanup of the jump drops
    harness.heldRead = undefined;
    harness.unreadedSeen.clear();
    harness.unreadedChat = undefined;
    restore();
  };

  test('a jump within the chat keeps what was put off', async() => {
    const {harness, readHistory} = createHarness(USER_ID, SUSPICIOUS);
    harness.onScrolledAllDown();
    see(harness, 140);
    jumpWithinTheChat(harness);

    harness.setPeerSettings(USER_ID, CLEAN);
    await settle();
    expect(readHistory).toHaveBeenCalledWith(expect.objectContaining({maxId: 150, force: true}));
    expect(readHistory).toHaveBeenCalledWith(expect.objectContaining({maxId: 140}));
  });

  test('what a jump kept is not read in the chat opened after it', async() => {
    vi.mocked(apiManagerProxy.getUser).mockReturnValue({_: 'user', id: 43, pFlags: {}} as any);
    const {harness, readHistory} = createHarness(USER_ID, SUSPICIOUS);
    see(harness, 140);
    jumpWithinTheChat(harness);

    harness.chat.peerId = 43 as PeerId;
    harness.setPeerSettings(43 as PeerId, CLEAN);
    await settle();
    expect(readHistory).not.toHaveBeenCalled();
  });

  test('a user made a contact while the settings were on the way has what was seen read with them', async() => {
    vi.mocked(apiManagerProxy.getUser).mockReturnValue({_: 'user', id: USER_ID, pFlags: {}} as any);
    const {harness, readHistory} = createHarness(USER_ID);
    see(harness, 100);
    await settle();
    expect(readHistory).not.toHaveBeenCalled();

    vi.mocked(apiManagerProxy.getUser).mockReturnValue({_: 'user', id: USER_ID, pFlags: {contact: true}} as any);
    harness.setPeerSettings(USER_ID, CLEAN);
    await settle();
    expect(readHistory).toHaveBeenCalledWith(expect.objectContaining({maxId: 100}));
  });

  test('what the previous chat held is not read in the next one', () => {
    vi.mocked(apiManagerProxy.getUser).mockReturnValue({_: 'user', id: 43, pFlags: {}} as any);
    const {harness, readHistory, markDialogUnread} = createHarness(USER_ID, SUSPICIOUS);
    harness.onScrolledAllDown();
    harness.readUnreadMark(160);

    // * the chat shows the next peer before the cleanup, and its settings can come in between
    harness.chat.peerId = 43 as PeerId;
    harness.setPeerSettings(43 as PeerId, CLEAN);
    expect(readHistory).not.toHaveBeenCalled();
    expect(markDialogUnread).not.toHaveBeenCalled();
  });

  test('settings of the previous chat do not stand for the next one', () => {
    vi.mocked(apiManagerProxy.getUser).mockReturnValue({_: 'user', id: USER_ID, pFlags: {}} as any);
    const {harness} = createHarness(USER_ID, CLEAN);
    harness.chat.peerId = 43 as PeerId;
    expect(harness.isReadHeld()).toBe(true);
  });

  test.each([
    {name: 'a contact before the settings come', peerId: USER_ID, contact: true},
    {name: 'Saved Messages', peerId: MY_ID, contact: false},
    {name: 'a group', peerId: -USER_ID as PeerId, contact: false}
  ])('$name is read at once', async({peerId, contact}) => {
    vi.mocked(apiManagerProxy.getUser).mockReturnValue({_: 'user', id: peerId, pFlags: {contact}} as any);
    const {harness, readHistory} = createHarness(peerId);
    see(harness, 100);
    await settle();
    expect(readHistory).toHaveBeenCalledWith(expect.objectContaining({maxId: 100}));
  });
});

describe('a message sent to a suspicious user', () => {
  function createProfileManager(peerSettings: {[peerId: PeerId]: PeerSettings} = {}) {
    const processLocalUpdate = vi.fn();
    // * one getPeerSettings request on the way, answered by `answer`
    let answer: (settings: PeerSettings) => void;
    const manager = Object.assign(Object.create(AppProfileManager.prototype), {
      peerSettings,
      peerSettingsLoading: new Map(),
      apiUpdatesManager: {processLocalUpdate},
      appPeersManager: {
        getOutputPeer: (peerId: PeerId) => ({_: 'peerUser', user_id: peerId}),
        getInputPeerById: (peerId: PeerId) => ({_: 'inputPeerUser', user_id: peerId}),
        isMonoforum: () => false
      },
      appChatsManager: {saveApiChats: vi.fn()},
      appUsersManager: {saveApiUsers: vi.fn()},
      apiManager: {
        invokeApiSingleProcess: ({processResult}: any) => new Promise((resolve) => {
          answer = (settings) => resolve(processResult({_: 'messages.peerSettings', settings, chats: [], users: []}));
        })
      }
    });
    return {manager, processLocalUpdate, answer: (settings: PeerSettings) => answer(settings)};
  }

  test('ends the report and block offers, and only them', () => {
    const settings: PeerSettings = structuredClone(SUSPICIOUS);
    const {manager, processLocalUpdate} = createProfileManager({[USER_ID]: settings});

    manager.endSuspiciousPeer(USER_ID);
    expect(settings.pFlags).toEqual({add_contact: true});
    expect(processLocalUpdate).toHaveBeenCalledOnce();

    manager.endSuspiciousPeer(USER_ID);
    expect(processLocalUpdate).toHaveBeenCalledOnce();
  });

  test('a send answered while the settings are on the way ends the settings that come', async() => {
    const {manager, answer} = createProfileManager();
    const promise = manager.getPeerSettings(USER_ID);
    manager.endSuspiciousPeer(USER_ID);
    answer(structuredClone(SUSPICIOUS));
    expect((await promise).pFlags).toEqual({add_contact: true});
    expect(manager.peerSettingsLoading.size).toBe(0);

    // * without a send they stay as they came
    const next = createProfileManager();
    const nextPromise = next.manager.getPeerSettings(USER_ID);
    next.answer(structuredClone(SUSPICIOUS));
    expect((await nextPromise).pFlags).toEqual(SUSPICIOUS.pFlags);
  });

  function createSending(peerId = USER_ID) {
    const {manager: appProfileManager} = createProfileManager();
    const endSuspiciousPeer = vi.spyOn(appProfileManager, 'endSuspiciousPeer');
    const manager = Object.assign(Object.create(AppMessagesManager.prototype), {
      appProfileManager,
      appPeersManager: {peerId: MY_ID},
      tempFinalizeCallbacks: {},
      pendingByRandomId: {},
      pendingTopMsgs: {},
      getMessagePeer: () => peerId,
      getHistoryMessagesStorage: () => ({key: 'history'}),
      getScheduledMessagesStorage: () => ({key: 'scheduled'}),
      getMonoforumThreadId: (): undefined => undefined,
      getHistoryStorage: () => ({history: {unshift: vi.fn()}}),
      saveMessages: vi.fn(),
      setDialogTopMessage: vi.fn(),
      updateMessageContextForInserting: vi.fn()
    }) as any;

    const send = (options: {isScheduled?: boolean} = {}) => {
      const message = {_: 'message', id: 0.0001, mid: 0.0001, random_id: '1', peerId, pFlags: {out: true}};
      manager.beforeMessageSending(message, {...options, processAfter: () => {}});
      return message.id;
    };

    // * what the server's answer to the send runs
    const confirm = (tempId: number) => manager.takeTempFinalizeCallbacks(tempId)?.endSuspiciousPeer?.callback({});

    return {manager, appProfileManager, endSuspiciousPeer, send, confirm};
  }

  test('ends it once the server has the message, not before', async() => {
    const {appProfileManager, endSuspiciousPeer, send, confirm} = createSending();
    appProfileManager.peerSettings[USER_ID] = structuredClone(SUSPICIOUS);
    const tempId = send();
    expect(endSuspiciousPeer).not.toHaveBeenCalled();

    await confirm(tempId);
    expect(appProfileManager.peerSettings[USER_ID].pFlags).toEqual({add_contact: true});
  });

  test('settings that come between the send and the answer are ended too', async() => {
    const {appProfileManager, send, confirm} = createSending();
    const tempId = send();
    appProfileManager.peerSettings[USER_ID] = structuredClone(SUSPICIOUS);

    await confirm(tempId);
    expect(appProfileManager.peerSettings[USER_ID].pFlags).toEqual({add_contact: true});
  });

  test('a refused one, a scheduled one, or one to a group or to Saved Messages changes nothing', () => {
    const refused = createSending();
    refused.manager.rejectPendingMessageCallbacks(refused.send(), {type: 'PEER_FLOOD'});
    expect(refused.endSuspiciousPeer).not.toHaveBeenCalled();

    const scheduled = createSending();
    expect(scheduled.manager.tempFinalizeCallbacks[scheduled.send({isScheduled: true})]).toBeUndefined();

    for(const peerId of [-USER_ID as PeerId, MY_ID]) {
      const other = createSending(peerId);
      expect(other.manager.tempFinalizeCallbacks[other.send()]).toBeUndefined();
    }
  });
});

describe('clearing a chat\'s unread mark', () => {
  test('reads only as far as it is told', async() => {
    const readHistory = vi.fn(() => Promise.resolve());
    const manager = Object.assign(Object.create(AppMessagesManager.prototype), {
      getDialogOnly: () => ({_: 'dialog', top_message: 200, unread_count: 3, pFlags: {unread_mark: true}}),
      appPeersManager: {
        isForum: () => false,
        getInputDialogPeerById: () => ({_: 'inputDialogPeer'}),
        getDialogPeer: () => ({_: 'dialogPeer'})
      },
      apiManager: {invokeApi: vi.fn(() => Promise.resolve(true))},
      onUpdateDialogUnreadMark: vi.fn(),
      readHistory
    }) as any;

    await manager.markDialogUnread({peerId: USER_ID, read: true, maxId: 150});
    expect(readHistory).toHaveBeenCalledWith(expect.objectContaining({maxId: 150, force: true}));

    await manager.markDialogUnread({peerId: USER_ID, read: true});
    expect(readHistory).toHaveBeenLastCalledWith(expect.objectContaining({maxId: 200, force: true}));
  });
});
