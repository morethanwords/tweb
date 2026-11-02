import {AppMessagesManager} from '@appManagers/appMessagesManager';
import {AppProfileManager} from '@appManagers/appProfileManager';
import '@helpers/peerIdPolyfill';

// * a supergroup made from a group says so in its full info (`migrated_from_chat_id`): its history and
// * shared media go on into the old group from there, as on tdesktop — not only once the service message
// * at the top of its history happens to be loaded

const channelId = 50 as ChatId;
const oldChatId = 7 as ChatId;
const peerId = channelId.toPeerId(true);
const oldPeerId = oldChatId.toPeerId(true);

function makeHarness(migratedFromChatId?: ChatId) {
  const inputChannel = {_: 'inputChannel', channel_id: channelId, access_hash: '0'};
  const chats: Record<string, any> = {
    [channelId]: {_: 'channel', id: channelId, pFlags: {megagroup: true}},
    [oldChatId]: {_: 'chat', id: oldChatId, pFlags: {deactivated: true}, migrated_to: inputChannel}
  };
  const appChatsManager = {
    getChat: (id: ChatId) => chats[id],
    hasChat: (id: ChatId) => !!chats[id],
    getChannelInput: () => inputChannel
  };

  const messagesManager = new AppMessagesManager() as any;
  Object.assign(messagesManager, {
    appChatsManager,
    rootScope: {dispatchEvent: vi.fn()},
    dialogsStorage: {dropDialogWithEvent: vi.fn()}
  });

  const fullChat = {_: 'channelFull', id: channelId, migrated_from_chat_id: migratedFromChatId};
  const profileManager = new AppProfileManager() as any;
  Object.assign(profileManager, {
    chatsFull: {},
    fullExpiration: {},
    appChatsManager,
    appMessagesManager: Object.assign(messagesManager, {
      applyChannelAvailableMinId: vi.fn(),
      getChannelAvailableMinIdRequestGeneration: () => 0
    }),
    appNotificationsManager: {getSettingsClock: () => 0},
    apiManager: {
      invokeApiSingleProcess: ({processResult}: {processResult: (result: any) => any}) => processResult({
        _: 'messages.chatFull',
        full_chat: fullChat,
        chats: Object.values(chats),
        users: []
      })
    },
    saveFullPeerResult: () => fullChat
  });

  return {profileManager, messagesManager};
}

test('the full info of a supergroup made from a group joins the two', () => {
  const {profileManager, messagesManager} = makeHarness(oldChatId);
  expect(messagesManager.getMigration(peerId)).toBeUndefined();
  profileManager.getChannelFull(channelId);
  expect(messagesManager.getMigration(peerId)).toEqual({next: undefined, prev: oldPeerId});
  expect(messagesManager.getMigration(oldPeerId)).toEqual({next: peerId, prev: undefined});
});

test('a supergroup made as one joins nothing', () => {
  const {profileManager, messagesManager} = makeHarness();
  profileManager.getChannelFull(channelId);
  expect(messagesManager.getMigration(peerId)).toBeUndefined();
});
