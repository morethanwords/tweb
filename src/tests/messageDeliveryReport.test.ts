import '@helpers/peerIdPolyfill';
import {AppMessagesManager, MessagesStorage} from '@appManagers/appMessagesManager';
import {AppMessagesIdsManager} from '@appManagers/appMessagesIdsManager';
import type {Message, Peer} from '@layer';

// A message can ask the client to confirm it reached the device (`report_delivery_until_date`).
// Every message saved from the server is checked, as tdesktop does; the ones of a chat go in one
// `messages.reportMessagesDelivery`, each id once.

const NOW = 1_800_000_000;
const USER_PEER: Peer = {_: 'peerUser', user_id: 42};
const CHANNEL_PEER: Peer = {_: 'peerChannel', channel_id: 1234};
const USER_PEER_ID = (42 as UserId).toPeerId(false);
const CHANNEL_PEER_ID = (1234 as ChatId).toPeerId(true);
const DELAY = 100;

function setup() {
  const manager = new AppMessagesManager();
  const invokeApi = vi.fn((_method: string, _params: {peer: any, id: number[]}): Promise<boolean> => Promise.resolve(true));
  const storages = new Map<string, MessagesStorage>();

  Object.assign(manager as any, {
    appMessagesIdsManager: new AppMessagesIdsManager(),
    apiManager: {invokeApi},
    appChatsManager: {isBroadcast: () => false},
    appPeersManager: {
      peerId: (1 as UserId).toPeerId(false),
      getPeerId: (peer: Peer) => peer._ === 'peerUser' ?
        peer.user_id.toPeerId(false) :
        (peer as Peer.peerChannel).channel_id.toPeerId(true),
      getInputPeerById: (peerId: PeerId) => ({_: 'inputPeerTest', peerId}),
      registerMessagePeers: vi.fn()
    },
    timeManager: {getServerTimeOffset: () => 0, getServerTime: () => NOW},
    setMessageUnreadByDialog: vi.fn(),
    setMessageToStorage: (storage: MessagesStorage, message: Message.message) => storage.set(message.mid, message)
  });

  const storage = (peerId: PeerId, type: 'history' | 'scheduled' = 'history') => {
    const key = `${peerId}_${type}`;
    let storage = storages.get(key);
    if(!storage) storages.set(key, storage = (manager as any).createMessageStorage(peerId, type));
    return storage;
  };

  const save = (peer: Peer, id: number, reportUntil: number | undefined, type?: 'history' | 'scheduled') => {
    const message = {
      _: 'message',
      pFlags: {},
      id,
      peer_id: peer,
      date: NOW,
      message: '',
      report_delivery_until_date: reportUntil
    } as Message.message;
    const peerId = (manager as any).appPeersManager.getPeerId(peer) as PeerId;
    manager.saveMessage(message, {storage: storage(peerId, type), ...(type === 'scheduled' ? {isScheduled: true} : {})});
  };

  const requests = () => invokeApi.mock.calls.map(([method, params]) => ({method, peerId: params.peer.peerId, id: params.id}));

  return {save, invokeApi, requests};
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('messages.reportMessagesDelivery', () => {
  it('reports the messages of a chat saved meanwhile in one request, a request per chat', async() => {
    const {save, requests} = setup();
    save(USER_PEER, 10, NOW + 60);
    save(CHANNEL_PEER, 5, NOW + 60);
    save(USER_PEER, 11, NOW + 60);

    expect(requests()).toEqual([]);
    await vi.advanceTimersByTimeAsync(DELAY);

    expect(requests()).toEqual([
      {method: 'messages.reportMessagesDelivery', peerId: USER_PEER_ID, id: [10, 11]},
      {method: 'messages.reportMessagesDelivery', peerId: CHANNEL_PEER_ID, id: [5]}
    ]);
  });

  it('reports a message once, however many times it is saved', async() => {
    const {save, requests} = setup();
    save(USER_PEER, 10, NOW + 60);
    save(USER_PEER, 10, NOW + 60);
    await vi.advanceTimersByTimeAsync(DELAY);
    // * the same message again, from a history page this time
    save(USER_PEER, 10, NOW + 60);
    await vi.advanceTimersByTimeAsync(DELAY);

    expect(requests()).toEqual([
      {method: 'messages.reportMessagesDelivery', peerId: USER_PEER_ID, id: [10]}
    ]);
  });

  it('leaves out a message nobody waits for, and a scheduled one', async() => {
    const {save, requests} = setup();
    save(USER_PEER, 10, undefined);
    save(USER_PEER, 11, NOW);
    save(USER_PEER, 12, NOW - 1);
    save(USER_PEER, 13, NOW + 60, 'scheduled');
    await vi.advanceTimersByTimeAsync(DELAY);

    expect(requests()).toEqual([]);
  });

  it('splits a long list into requests of 50 ids', async() => {
    const {save, requests} = setup();
    const ids = Array.from({length: 60}, (_, i) => i + 1);
    ids.forEach((id) => save(USER_PEER, id, NOW + 60));
    await vi.advanceTimersByTimeAsync(DELAY * 2);

    expect(requests()).toEqual([
      {method: 'messages.reportMessagesDelivery', peerId: USER_PEER_ID, id: ids.slice(0, 50)},
      {method: 'messages.reportMessagesDelivery', peerId: USER_PEER_ID, id: ids.slice(50)}
    ]);
  });

  it('sends a chat one report at a time, and one that hangs holds up no other chat', async() => {
    const {save, requests, invokeApi} = setup();
    let answerFirst: () => void;
    invokeApi.mockImplementationOnce(() => new Promise<boolean>((resolve) => answerFirst = () => resolve(true)));
    save(USER_PEER, 10, NOW + 60);
    await vi.advanceTimersByTimeAsync(DELAY);
    // * the chat's first report has no answer yet
    save(USER_PEER, 11, NOW + 60);
    save(CHANNEL_PEER, 5, NOW + 60);
    await vi.advanceTimersByTimeAsync(DELAY * 3);

    expect(requests()).toEqual([
      {method: 'messages.reportMessagesDelivery', peerId: USER_PEER_ID, id: [10]},
      {method: 'messages.reportMessagesDelivery', peerId: CHANNEL_PEER_ID, id: [5]}
    ]);

    answerFirst();
    await vi.advanceTimersByTimeAsync(DELAY);

    expect(requests().slice(2)).toEqual([
      {method: 'messages.reportMessagesDelivery', peerId: USER_PEER_ID, id: [11]}
    ]);
  });

  it('drops a failed report and goes on with the next ones', async() => {
    const {save, requests, invokeApi} = setup();
    invokeApi.mockRejectedValueOnce({type: 'PEER_ID_INVALID'});
    save(USER_PEER, 10, NOW + 60);
    await vi.advanceTimersByTimeAsync(DELAY);
    save(USER_PEER, 11, NOW + 60);
    await vi.advanceTimersByTimeAsync(DELAY);

    expect(requests()).toEqual([
      {method: 'messages.reportMessagesDelivery', peerId: USER_PEER_ID, id: [10]},
      {method: 'messages.reportMessagesDelivery', peerId: USER_PEER_ID, id: [11]}
    ]);
  });
});
