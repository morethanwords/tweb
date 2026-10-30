import '@helpers/peerIdPolyfill';
import {AppChatsManager} from '@appManagers/appChatsManager';
import AppGiftsManager from '@appManagers/appGiftsManager';
import AppChatInvitesManager from '@appManagers/appChatInvitesManager';
import ApiManagerMethods from '@appManagers/apiManagerMethods';
import {InputCheckPasswordSRP, InputSavedStarGift, MessagesChatInviteImporters, PaymentsSavedStarGifts, StarGiftCollection, Update, Updates} from '@layer';

const CHAT_ID = 100 as ChatId;
const PEER_ID = CHAT_ID.toPeerId(true);
const INPUT_PEER = {_: 'inputPeerChannel', channel_id: CHAT_ID, access_hash: '1'} as const;
const OUTPUT_PEER = {_: 'peerChannel', channel_id: CHAT_ID} as const;
const UPDATES = {_: 'updates', updates: [{_: 'updateConfig'}], users: [], chats: [], date: 1, seq: 0} as Updates;

function makeChatsManager() {
  const manager = new AppChatsManager();
  const invokeApi = vi.fn().mockResolvedValue(UPDATES);
  const processUpdateMessage = vi.fn();
  const processLocalUpdate = vi.fn();
  const dispatchEvent = vi.fn();
  const reloadPendingJoinRequests = vi.fn().mockResolvedValue(undefined);
  Object.assign(manager as any, {
    apiManager: {
      invokeApi,
      // * no dedup to join here: the request runs and its result goes through `processResult`
      invokeApiSingleProcess: vi.fn(async({method, params, processResult}: any) => processResult(await invokeApi(method, params)))
    },
    apiUpdatesManager: {processUpdateMessage, processLocalUpdate},
    appChatsManager: {getInputPeer: () => INPUT_PEER},
    appPeersManager: {getOutputPeer: () => OUTPUT_PEER},
    appChatInvitesManager: {reloadPendingJoinRequests},
    rootScope: {dispatchEvent},
    isChannel: () => true,
    isCommunity: () => false,
    getChannelInput: () => ({_: 'inputChannel', channel_id: CHAT_ID, access_hash: '1'})
  });

  return {manager, invokeApi, processUpdateMessage, processLocalUpdate, dispatchEvent, reloadPendingJoinRequests};
}

const pendingJoinRequests = (requests_pending: number, recent_requesters: UserId[] = []): Update.updatePendingJoinRequests => ({
  _: 'updatePendingJoinRequests',
  peer: OUTPUT_PEER,
  requests_pending,
  recent_requesters
});

describe('appChatsManager.hideAllChatJoinRequests', () => {
  test('answers the whole queue, then reads it anew rather than putting the counter at zero', async() => {
    const {manager, invokeApi, processUpdateMessage, processLocalUpdate, dispatchEvent, reloadPendingJoinRequests} = makeChatsManager();

    await manager.hideAllChatJoinRequests(CHAT_ID, true);

    expect(invokeApi).toHaveBeenCalledWith('messages.hideAllChatJoinRequests', {
      peer: INPUT_PEER,
      approved: true,
      link: undefined
    });
    expect(processUpdateMessage).toHaveBeenCalledWith(UPDATES);
    // * the full chat is refreshed, as after a single request
    expect(dispatchEvent).toHaveBeenCalledWith('invalidate_participants', CHAT_ID);
    // * a request that came meanwhile would contradict a zero
    expect(reloadPendingJoinRequests).toHaveBeenCalledWith(CHAT_ID);
    expect(processLocalUpdate).not.toHaveBeenCalled();
  });

  test('takes the server\'s counter from the answer when it carries one', async() => {
    const {manager, invokeApi, processUpdateMessage, reloadPendingJoinRequests} = makeChatsManager();
    const updates = {...UPDATES, updates: [pendingJoinRequests(1, [5 as UserId])]} as Updates;
    invokeApi.mockResolvedValueOnce(updates);

    await manager.hideAllChatJoinRequests(CHAT_ID, true);

    expect(processUpdateMessage).toHaveBeenCalledWith(updates);
    expect(reloadPendingJoinRequests).not.toHaveBeenCalled();
  });

  test('narrowed to one link, answers only its requests, and the counter is read anew too', async() => {
    const {manager, invokeApi, reloadPendingJoinRequests} = makeChatsManager();

    await manager.hideAllChatJoinRequests(CHAT_ID, false, 'https://t.me/+abc');

    expect(invokeApi).toHaveBeenCalledWith('messages.hideAllChatJoinRequests', {
      peer: INPUT_PEER,
      approved: false,
      link: 'https://t.me/+abc'
    });
    expect(reloadPendingJoinRequests).toHaveBeenCalledWith(CHAT_ID);
  });

  test('a refused request changes nothing', async() => {
    const {manager, invokeApi, processLocalUpdate, processUpdateMessage, reloadPendingJoinRequests} = makeChatsManager();
    invokeApi.mockRejectedValueOnce({type: 'CHAT_ADMIN_REQUIRED'});

    await expect(manager.hideAllChatJoinRequests(CHAT_ID, true)).rejects.toEqual({type: 'CHAT_ADMIN_REQUIRED'});
    expect(processUpdateMessage).not.toHaveBeenCalled();
    expect(processLocalUpdate).not.toHaveBeenCalled();
    expect(reloadPendingJoinRequests).not.toHaveBeenCalled();
  });
});

describe('appChatInvitesManager.reloadPendingJoinRequests', () => {
  function makeInvitesManager() {
    const manager = new AppChatInvitesManager() as any;
    let answer: (value: unknown) => void;
    const invokeApi = vi.fn((_method: string, _params: object) => new Promise((resolve) => answer = resolve));
    const processLocalUpdate = vi.fn();
    Object.assign(manager, {
      apiManager: {invokeApi},
      apiUpdatesManager: {processLocalUpdate},
      appChatsManager: {getInputPeer: () => INPUT_PEER},
      appPeersManager: {getOutputPeer: () => OUTPUT_PEER},
      appUsersManager: {saveApiUsers: vi.fn()},
      // * stops the update there: what counts is that it came
      appCommunitiesManager: {handlePendingJoinRequestsUpdate: () => true}
    });

    const importers = (count: number, userIds: number[]): MessagesChatInviteImporters => ({
      _: 'messages.chatInviteImporters',
      count,
      importers: userIds.map((user_id) => ({_: 'chatInviteImporter', user_id, date: 1, pFlags: {requested: true}})),
      users: []
    });

    return {manager: manager as AppChatInvitesManager, invokeApi, processLocalUpdate, answer: (count: number, userIds: number[]) => answer(importers(count, userIds))};
  }

  test('shows the queue as the server has it now, its latest requesters first', async() => {
    const {manager, invokeApi, processLocalUpdate, answer} = makeInvitesManager();

    const promise = manager.reloadPendingJoinRequests(CHAT_ID);
    expect(invokeApi).toHaveBeenCalledWith('messages.getChatInviteImporters', expect.objectContaining({requested: true, limit: 3}));
    answer(2, [7, 6]);
    await promise;

    expect(processLocalUpdate).toHaveBeenCalledExactlyOnceWith(pendingJoinRequests(2, [7, 6] as UserId[]));
  });

  test('an update of the queue that comes while it is read is the newer word', async() => {
    const {manager, processLocalUpdate, answer} = makeInvitesManager();

    const promise = manager.reloadPendingJoinRequests(CHAT_ID);
    await (manager as any).onUpdatePendingJoinRequests(pendingJoinRequests(1, [8 as UserId]));
    answer(0, []);
    await promise;

    expect(processLocalUpdate).not.toHaveBeenCalled();
  });
});

describe('appChatsManager.updateEmojiStatus', () => {
  test('sets a channel\'s status and applies the updates it answers with', async() => {
    const {manager, invokeApi, processUpdateMessage} = makeChatsManager();

    await manager.updateEmojiStatus(CHAT_ID, {_: 'emojiStatusEmpty'});

    expect(invokeApi).toHaveBeenCalledWith('channels.updateEmojiStatus', {
      channel: {_: 'inputChannel', channel_id: CHAT_ID, access_hash: '1'},
      emoji_status: {_: 'emojiStatusEmpty'}
    });
    expect(processUpdateMessage).toHaveBeenCalledWith(UPDATES);
  });
});

function makeGiftsManager() {
  const manager = new AppGiftsManager() as any;
  const invokeApi = vi.fn().mockResolvedValue(true);
  Object.assign(manager, {
    apiManager: {invokeApi},
    appPeersManager: {getInputPeerById: () => INPUT_PEER},
    rootScope: {myId: 1 as PeerId}
  });

  return {manager: manager as AppGiftsManager, invokeApi};
}

/** The real dedup over `invokeApi`: a request asked for again while it is on its way joins it */
function withRealDedup(manager: AppGiftsManager, invokeApi: ReturnType<typeof vi.fn>) {
  Object.assign(manager as any, {
    apiManager: {invokeApi, apiPromisesSingleProcess: {}, invokeApiSingleProcess: ApiManagerMethods.prototype.invokeApiSingleProcess},
    appPeersManager: {getInputPeerById: () => INPUT_PEER, saveApiPeers: vi.fn()}
  });
}

const savedGifts = (chat_notifications_enabled?: boolean): PaymentsSavedStarGifts => ({
  _: 'payments.savedStarGifts',
  count: 0,
  gifts: [],
  chats: [],
  users: [],
  chat_notifications_enabled
});

const flush = () => new Promise((resolve) => setTimeout(resolve));

describe('appGiftsManager: what the gift screens used to send by themselves', () => {
  test('creates, deletes and reorders a peer\'s collections', async() => {
    const {manager, invokeApi} = makeGiftsManager();

    await manager.createCollection(PEER_ID, 'Best');
    expect(invokeApi).toHaveBeenLastCalledWith('payments.createStarGiftCollection', {
      title: 'Best',
      peer: INPUT_PEER,
      stargift: []
    });

    await manager.deleteCollection(PEER_ID, 7);
    expect(invokeApi).toHaveBeenLastCalledWith('payments.deleteStarGiftCollection', {
      collection_id: 7,
      peer: INPUT_PEER
    });

    await manager.reorderCollections(PEER_ID, [3, 1, 2]);
    expect(invokeApi).toHaveBeenLastCalledWith('payments.reorderStarGiftCollections', {
      peer: INPUT_PEER,
      order: [3, 1, 2]
    });
  });

  test('turns a channel\'s gift notifications on and off', async() => {
    const {manager, invokeApi} = makeGiftsManager();

    await manager.toggleChatGiftNotifications(PEER_ID, true);
    expect(invokeApi).toHaveBeenLastCalledWith('payments.toggleChatStarGiftNotifications', {
      peer: INPUT_PEER,
      enabled: true
    });

    await manager.toggleChatGiftNotifications(PEER_ID, false);
    expect(invokeApi).toHaveBeenLastCalledWith('payments.toggleChatStarGiftNotifications', {
      peer: INPUT_PEER,
      enabled: false
    });
  });

  test('sends a peer\'s order of collections and its notifications one after another, whichever screen asked', async() => {
    const {manager, invokeApi} = makeGiftsManager();
    const calls: {method: string, params: any, resolve: (value: unknown) => void, reject: (err: unknown) => void}[] = [];
    invokeApi.mockImplementation((method: string, params: any) => new Promise((resolve, reject) => calls.push({method, params, resolve, reject})));
    const OTHER_PEER_ID = (200 as ChatId).toPeerId(true);

    const first = manager.reorderCollections(PEER_ID, [3, 1, 2]);
    const second = manager.reorderCollections(PEER_ID, [1, 2, 3]);
    void manager.toggleChatGiftNotifications(PEER_ID, true);
    void manager.reorderCollections(OTHER_PEER_ID, [5, 4]);
    await flush();
    // * the newer order waits for the older one; the notifications and another peer's order do not
    expect(calls.map(({method, params}) => [method, params.order ?? params.enabled])).toEqual([
      ['payments.reorderStarGiftCollections', [3, 1, 2]],
      ['payments.toggleChatStarGiftNotifications', true],
      ['payments.reorderStarGiftCollections', [5, 4]]
    ]);

    // * a refused one does not hold the next back
    calls[0].reject({type: 'FLOOD_WAIT_X'});
    await expect(first).rejects.toEqual({type: 'FLOOD_WAIT_X'});
    await flush();
    expect(calls[3].params.order).toEqual([1, 2, 3]);
    calls[3].resolve(true);
    await expect(second).resolves.toBe(true);
  });

  test('reads a peer\'s gift settings only once the writes of them on their way are answered', async() => {
    const {manager, invokeApi} = makeGiftsManager();
    const COLLECTIONS: StarGiftCollection[] = [];
    const writes: ((value: unknown) => void)[] = [];
    invokeApi.mockImplementation((method: string) => {
      switch(method) {
        case 'payments.toggleChatStarGiftNotifications':
        case 'payments.reorderStarGiftCollections':
          return new Promise((resolve) => writes.push(resolve));
        case 'payments.getStarGiftCollections':
          return Promise.resolve({_: 'payments.starGiftCollections', collections: COLLECTIONS});
        default:
          return Promise.resolve(savedGifts(true));
      }
    });
    withRealDedup(manager, invokeApi);
    const methods = () => invokeApi.mock.calls.map(([method]) => method);

    void manager.toggleChatGiftNotifications(PEER_ID, true);
    void manager.reorderCollections(PEER_ID, [2, 1]);
    const page = manager.getProfileGifts({peerId: PEER_ID});
    const notifications = manager.getChatGiftNotifications(PEER_ID);
    const pageWithCollections = manager.getProfileGifts({peerId: PEER_ID, withCollections: true});
    const collections = manager.getCollections(PEER_ID);
    await flush();
    expect(methods()).toEqual(['payments.toggleChatStarGiftNotifications', 'payments.reorderStarGiftCollections']);

    // * the toggle answered: what carries only the notifications goes
    writes[0](true);
    await expect(page).resolves.toMatchObject({chatNotificationsEnabled: true, collections: undefined});
    await expect(notifications).resolves.toBe(true);
    expect(methods()).not.toContain('payments.getStarGiftCollections');

    // * the order answered: the collections go too
    writes[1](true);
    await expect(pageWithCollections).resolves.toMatchObject({collections: COLLECTIONS});
    await expect(collections).resolves.toBe(COLLECTIONS);
  });

  test('a read asked after a write is answered never joins one asked before it', async() => {
    const {manager, invokeApi} = makeGiftsManager();
    const answers: {[method: string]: ((value: unknown) => void)[]} = {};
    invokeApi.mockImplementation((method: string) => new Promise((resolve) => (answers[method] ??= []).push(resolve)));
    withRealDedup(manager, invokeApi);
    const collections = (...ids: number[]) => ({
      _: 'payments.starGiftCollections',
      collections: ids.map((collection_id) => ({_: 'starGiftCollection', collection_id, title: '', gifts_count: 0, hash: 0}))
    });

    // * on their way while the notifications are toggled and the collections reordered
    const before = manager.getProfileGifts({peerId: PEER_ID});
    const collectionsBefore = manager.getCollections(PEER_ID);
    await flush();
    const toggle = manager.toggleChatGiftNotifications(PEER_ID, true);
    const reorder = manager.reorderCollections(PEER_ID, [2, 1]);
    await flush();
    answers['payments.toggleChatStarGiftNotifications'][0](true);
    answers['payments.reorderStarGiftCollections'][0](true);
    await Promise.all([toggle, reorder]);

    // * the same reads asked again: requests of their own, not the ones from before
    const after = manager.getProfileGifts({peerId: PEER_ID});
    const notificationsAfter = manager.getChatGiftNotifications(PEER_ID);
    const collectionsAfter = manager.getCollections(PEER_ID);
    await flush();
    expect(answers['payments.getSavedStarGifts']).toHaveLength(3);
    expect(answers['payments.getStarGiftCollections']).toHaveLength(2);

    answers['payments.getSavedStarGifts'][0](savedGifts(false));
    answers['payments.getSavedStarGifts'].slice(1).forEach((answer) => answer(savedGifts(true)));
    answers['payments.getStarGiftCollections'][0](collections(1, 2));
    answers['payments.getStarGiftCollections'][1](collections(2, 1));
    await expect(before).resolves.toMatchObject({chatNotificationsEnabled: false});
    await expect(collectionsBefore).resolves.toHaveLength(2);
    await expect(after).resolves.toMatchObject({chatNotificationsEnabled: true});
    await expect(notificationsAfter).resolves.toBe(true);
    expect((await collectionsAfter).map((collection) => collection.collection_id)).toEqual([2, 1]);
  });

  test('checks a locked gift and asks for a withdrawal link', async() => {
    const {manager, invokeApi} = makeGiftsManager();

    await manager.checkCanSendGift('5');
    expect(invokeApi).toHaveBeenLastCalledWith('payments.checkCanSendGift', {gift_id: '5'});

    const input: InputSavedStarGift = {_: 'inputSavedStarGiftSlug', slug: 'gift-1'};
    const password = {_: 'inputCheckPasswordEmpty'} as InputCheckPasswordSRP;
    await manager.getGiftWithdrawalUrl(input, password);
    expect(invokeApi).toHaveBeenLastCalledWith('payments.getStarGiftWithdrawalUrl', {
      stargift: input,
      password
    });
  });

  test('hands on whether a channel\'s gift notifications are on, as the list says it', async() => {
    const {manager} = makeGiftsManager();
    const invokeApiSingleProcess = vi.fn().mockResolvedValueOnce(savedGifts(true)).mockResolvedValueOnce(savedGifts());
    Object.assign(manager as any, {
      apiManager: {invokeApiSingleProcess},
      appPeersManager: {getInputPeerById: () => INPUT_PEER, saveApiPeers: vi.fn()}
    });

    expect((await manager.getProfileGifts({peerId: PEER_ID})).chatNotificationsEnabled).toBe(true);
    // * not said at all for whoever cannot manage them
    expect((await manager.getProfileGifts({peerId: PEER_ID})).chatNotificationsEnabled).toBeUndefined();
  });
});
