import {expect, test, vi} from 'vitest';
import '@helpers/peerIdPolyfill';
import {AppMessagesManager} from '@appManagers/appMessagesManager';

const PEER_ID = (100 as ChatId).toPeerId(true);

function setup() {
  const manager = new AppMessagesManager();
  const invokeApiSingle = vi.fn(async() => ({
    _: 'messages.messages',
    messages: [{_: 'message', id: 1, pFlags: {}}, {_: 'message', id: 2, pFlags: {}}],
    users: [],
    chats: []
  }));
  Object.assign(manager as any, {
    scheduledMessagesStorage: {},
    apiManager: {invokeApiSingle},
    appPeersManager: {isMonoforum: () => false, getInputPeerById: () => ({_: 'inputPeerChannel', channel_id: 100, access_hash: '1'})},
    appUsersManager: {saveApiUsers: () => {}},
    appChatsManager: {saveApiChats: () => {}}
  });
  vi.spyOn(manager as any, 'canSendToPeer').mockResolvedValue(true);
  vi.spyOn(manager, 'saveMessages').mockImplementation((messages: any[], {storage}: any) => {
    messages.forEach((message) => storage.set(message.mid = message.id, message));
    return messages;
  });
  return {manager, invokeApiSingle};
}

// * a topic's composer does not ask for the chat's scheduled messages, and one scheduled there lands in the chat's
// * storage at once: the chat's list asked for after it is still the server's whole list, not that one message
test('asks for the scheduled messages a storage holds only some of', async() => {
  const {manager, invokeApiSingle} = setup();
  manager.getScheduledMessagesStorage(PEER_ID).set(5, {_: 'message', id: 5} as any);

  const mids = await manager.getScheduledMessages(PEER_ID);

  expect(invokeApiSingle).toHaveBeenCalledWith('messages.getScheduledHistory', expect.anything());
  expect(mids).toEqual(expect.arrayContaining([1, 2, 5]));
});

test('does not ask again once the list is loaded', async() => {
  const {manager, invokeApiSingle} = setup();
  await manager.getScheduledMessages(PEER_ID);

  expect(await manager.getScheduledMessages(PEER_ID)).toEqual([1, 2]);
  expect(invokeApiSingle).toHaveBeenCalledTimes(1);
});

// * the list asked for while a scheduled send is on its way can bring the send's own message before its update
test('finishes a scheduled send whose message the list brought first', async() => {
  const {manager} = setup();
  const dispatchEvent = vi.fn();
  Object.assign(manager as any, {
    rootScope: {dispatchEvent},
    appPeersManager: {...(manager as any).appPeersManager, isChannel: () => true},
    appMessagesIdsManager: {generateMessageId: (id: number) => id},
    pendingByMessageId: {1: 'random'},
    pendingByRandomId: {random: {peerId: PEER_ID, tempId: 0.001, storage: manager.getScheduledMessagesStorage(PEER_ID)}}
  });
  vi.spyOn(manager as any, 'getMessagePeer').mockReturnValue(PEER_ID);
  vi.spyOn(manager as any, 'releaseEditedMessageRichMedia').mockReturnValue(false);
  vi.spyOn(manager as any, 'handleEditedMessage').mockImplementation(() => {});
  vi.spyOn(manager as any, 'adoptStreamedMessageDraft').mockImplementation(() => {});
  const finalize = vi.spyOn(manager, 'finalizePendingMessage').mockReturnValue({} as any);
  await manager.getScheduledMessages(PEER_ID);

  (manager as any).onUpdateNewScheduledMessage({_: 'updateNewScheduledMessage', message: {_: 'message', id: 1, pFlags: {}}});

  expect(finalize).toHaveBeenCalledWith('random', expect.objectContaining({id: 1}));
  expect(dispatchEvent).not.toHaveBeenCalledWith('message_edit', expect.anything());
});
