import {loadChatBubbles, LOAD_CHAT_BUBBLES_TIMEOUT} from '@/tests/helpers/chatBubbles';
import '@helpers/peerIdPolyfill';
import type {PeerSettings} from '@layer';
import {ChatType} from '@components/chat/chatType';

let ChatBubbles: typeof import('@components/chat/bubbles').default;
let AppProfileManager: typeof import('@appManagers/appProfileManager').AppProfileManager;
let AppMessagesManager: typeof import('@appManagers/appMessagesManager').AppMessagesManager;
let apiManagerProxy: typeof import('@lib/apiManagerProxy').default;

const MY_ID = 7 as PeerId;
const USER_ID = 42 as PeerId;

const SUSPICIOUS: PeerSettings = {_: 'peerSettings', pFlags: {report_spam: true, block_contact: true, add_contact: true}};

beforeAll(async() => {
  ChatBubbles = (await loadChatBubbles()).bubbles.default;
  AppProfileManager = (await import('@appManagers/appProfileManager')).AppProfileManager;
  AppMessagesManager = (await import('@appManagers/appMessagesManager')).AppMessagesManager;
  apiManagerProxy = (await import('@lib/apiManagerProxy')).default;
  (await import('@lib/rootScope')).default.myId = MY_ID;
}, LOAD_CHAT_BUBBLES_TIMEOUT);

afterEach(() => {
  vi.mocked(apiManagerProxy.getUser).mockReset();
});

function createHarness(peerId: PeerId, peerSettings?: PeerSettings) {
  const readHistory = vi.fn(() => Promise.resolve());
  const harness = Object.assign(Object.create(ChatBubbles.prototype), {
    chat: {
      peerId,
      type: ChatType.Chat,
      isPreview: false,
      getHistoryMaxId: () => 150
    },
    managers: {
      appMessagesManager: {readHistory},
      appProfileManager: {getPeerSettings: vi.fn(() => Promise.resolve(SUSPICIOUS))}
    },
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

  return {harness, readHistory};
}

const see = (harness: any, mid: number) => {
  const element = document.createElement('div');
  harness.unreaded.set(element, mid);
  harness.onUnreadedInViewport('history', element, mid);
};

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

// * what a read tells a sender the bar offers to report is the server's to decide, so the chat reads as any other
describe('reads in the chat of a user the bar may offer to report', () => {
  test.each([
    {name: 'while it offers to', peerSettings: SUSPICIOUS},
    {name: 'before their settings say whether it does', peerSettings: undefined as PeerSettings}
  ])('are sent at once $name', async({peerSettings}) => {
    const {harness, readHistory} = createHarness(USER_ID, peerSettings);
    see(harness, 100);
    await settle();
    expect(readHistory).toHaveBeenCalledOnce();
    expect(readHistory).toHaveBeenLastCalledWith(expect.objectContaining({peerId: USER_ID, maxId: 100}));

    harness.onScrolledAllDown();
    expect(readHistory).toHaveBeenLastCalledWith(expect.objectContaining({peerId: USER_ID, maxId: 150, force: true}));
  });
});

describe('the settings of a sender who is not a contact', () => {
  test('the plate never brought, after a jump cut it off, are asked for by the chat itself', async() => {
    vi.mocked(apiManagerProxy.getUser).mockReturnValue({_: 'user', id: USER_ID, pFlags: {}} as any);
    const {harness} = createHarness(USER_ID);
    harness.requestMissingPeerSettings(USER_ID);
    await settle();
    expect(harness.managers.appProfileManager.getPeerSettings).toHaveBeenCalledWith(USER_ID);
    expect(harness.handleMessageLinkPolicyChange).toHaveBeenCalledWith(false, true);

    // * nothing is asked with the settings at hand, nor for a contact
    const known = createHarness(USER_ID, SUSPICIOUS);
    known.harness.requestMissingPeerSettings(USER_ID);
    expect(known.harness.managers.appProfileManager.getPeerSettings).not.toHaveBeenCalled();

    vi.mocked(apiManagerProxy.getUser).mockReturnValue({_: 'user', id: USER_ID, pFlags: {contact: true}} as any);
    const contact = createHarness(USER_ID);
    contact.harness.requestMissingPeerSettings(USER_ID);
    expect(contact.harness.managers.appProfileManager.getPeerSettings).not.toHaveBeenCalled();
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

    const send = (options: {isScheduled?: boolean, noOutgoingMessage?: boolean} = {}, promise?: Promise<void>) => {
      const message = {_: 'message', id: 0.0001, mid: 0.0001, random_id: '1', peerId, pFlags: {out: true}, promise};
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

  test('a send that makes no message of its own ends it once it is answered', async() => {
    const {appProfileManager, send} = createSending();
    appProfileManager.peerSettings[USER_ID] = structuredClone(SUSPICIOUS);
    let answer: () => void;
    send({noOutgoingMessage: true}, new Promise<void>((resolve) => answer = resolve));
    await settle();
    expect(appProfileManager.peerSettings[USER_ID].pFlags).toEqual(SUSPICIOUS.pFlags);

    answer();
    await settle();
    expect(appProfileManager.peerSettings[USER_ID].pFlags).toEqual({add_contact: true});

    const refused = createSending();
    refused.send({noOutgoingMessage: true}, Promise.reject(new Error('PEER_FLOOD')));
    await settle();
    expect(refused.endSuspiciousPeer).not.toHaveBeenCalled();
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
