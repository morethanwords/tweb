import '@helpers/peerIdPolyfill';
import {AppMessagesManager} from '@appManagers/appMessagesManager';
import {AppMessagesIdsManager} from '@appManagers/appMessagesIdsManager';
import deferredPromise, {CancellablePromise} from '@helpers/cancellablePromise';
import pause from '@helpers/schedulers/pause';
import {logger, LogTypes} from '@lib/logger';

// A read sent to the server while another is on its way is sent once that one is answered — for the same
// chat it was made in, a channel's direct messages thread included. A read the server did not take is
// asked for again by the next read of it, instead of being taken for sent.

type Call = {method: string, params: any, deferred: CancellablePromise<any>};

function setup(channel: boolean) {
  const manager = new AppMessagesManager();
  const calls: Call[] = [];
  const invokeApi = vi.fn((method: string, params: any) => {
    const deferred = deferredPromise<any>();
    calls.push({method, params, deferred});
    return deferred;
  });
  const histories: {[key: string]: any} = {};

  Object.assign(manager as any, {
    log: logger('MESSAGES', LogTypes.None),
    apiManager: {invokeApi},
    apiUpdatesManager: {processLocalUpdate: vi.fn()},
    appPeersManager: {
      isChannel: () => channel,
      isMonoforum: () => channel,
      getInputPeerById: (peerId: PeerId) => ({_: 'inputPeer', peerId}),
      getOutputPeer: (peerId: PeerId) => ({_: 'peer', peerId}),
      getPeerString: (peerId: PeerId) => '' + peerId
    },
    appChatsManager: {getChannelInput: (chatId: ChatId) => ({_: 'inputChannel', channel_id: chatId})},
    rootScope: {dispatchEvent: vi.fn()}
  });
  vi.spyOn(manager, 'getHistoryStorage').mockImplementation((peerId, threadId) => histories[`${peerId}_${threadId}`] ??= {});
  vi.spyOn(manager, 'getReadMaxIdIfUnread').mockReturnValue(1);
  vi.spyOn(manager, 'getMessageByPeer').mockReturnValue(undefined);

  return {manager, calls, histories};
}

describe('reading a chat\'s history', () => {
  test('a read of a direct messages thread made meanwhile is sent for that thread', async() => {
    const {manager, calls, histories} = setup(true);
    const peerId = (77 as ChatId).toPeerId(true);
    const monoforumThreadId = (5 as UserId).toPeerId(false);
    const idsManager = new AppMessagesIdsManager();
    const mid = (id: number) => idsManager.generateMessageId(id, peerId.toChatId());

    void manager.readHistory({peerId, maxId: mid(100), monoforumThreadId});
    expect(calls.map(({method}) => method)).toEqual(['messages.readSavedHistory']);

    // * read further while the first is on its way: applied here, sent once it is answered
    histories[`${peerId}_${monoforumThreadId}`].readMaxId = mid(120);
    calls[0].deferred.resolve(undefined);
    await pause(0);

    expect(calls.map(({method}) => method)).toEqual(['messages.readSavedHistory', 'messages.readSavedHistory']);
    expect(calls[1].params).toMatchObject({max_id: 120});
  });

  test('a read made while another is on its way is sent once that one is answered', async() => {
    const {manager, calls, histories} = setup(false);
    const peerId = (42 as UserId).toPeerId(false);

    void manager.readHistory({peerId, maxId: 100, force: true});
    void manager.readHistory({peerId, maxId: 150, force: true});
    expect(calls.map(({method}) => method)).toEqual(['messages.readHistory']);

    // * where the second one's local apply leaves the chat
    histories[`${peerId}_undefined`].readMaxId = 150;
    calls[0].deferred.resolve({pts: 0, pts_count: 0});
    await pause(0);

    expect(calls.map(({method}) => method)).toEqual(['messages.readHistory', 'messages.readHistory']);
    expect(calls[1].params).toMatchObject({max_id: 150});
  });

  test('a read the server refused is sent again by the next one', async() => {
    const {manager, calls} = setup(false);
    const peerId = (42 as UserId).toPeerId(false);

    const first = manager.readHistory({peerId, maxId: 100});
    calls[0].deferred.reject({type: 'NETWORK_BAD_REQUEST'});
    await expect(first).rejects.toMatchObject({type: 'NETWORK_BAD_REQUEST'});
    await pause(0);

    void manager.readHistory({peerId, maxId: 100});
    expect(calls.map(({method}) => method)).toEqual(['messages.readHistory', 'messages.readHistory']);
  });
});
