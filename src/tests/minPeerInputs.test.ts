import {describe, expect, it} from 'vitest';
import {AppPeersManager} from '@appManagers/appPeersManager';
import {AppUsersManager} from '@appManagers/appUsersManager';
import {AppChatsManager} from '@appManagers/appChatsManager';
import {Chat, ChatFull, Message, User} from '@layer';
import '@helpers/peerIdPolyfill';

const GROUP_ID = 100 as ChatId;
const GROUP_PEER_ID = GROUP_ID.toPeerId(true);
const MIN_USER_ID = 7 as UserId;
const FULL_USER_ID = 8 as UserId;
const MIN_CHANNEL_ID = 200 as ChatId;

function setup() {
  const peers = new AppPeersManager();
  const users = new AppUsersManager();
  const chats = new AppChatsManager();
  const messages = new Map<string, Message.message>();
  const profile = {chatsFull: {} as Record<ChatId, ChatFull>};

  const group: Chat.channel = {
    _: 'channel', pFlags: {megagroup: true}, id: GROUP_ID, access_hash: 'group', title: 'Group', photo: {_: 'chatPhotoEmpty'}, date: 0
  };
  const minChannel: Chat.channel = {
    _: 'channel', pFlags: {min: true, broadcast: true}, id: MIN_CHANNEL_ID, access_hash: 'min-channel', title: 'Min', photo: {_: 'chatPhotoEmpty'}, date: 0
  };
  const minUser = {_: 'user', pFlags: {min: true}, id: MIN_USER_ID, access_hash: 'min-user'} as User.user;
  const fullUser = {_: 'user', pFlags: {}, id: FULL_USER_ID, access_hash: 'full-user'} as User.user;

  Object.assign(users, {users: {[MIN_USER_ID]: minUser, [FULL_USER_ID]: fullUser}, appPeersManager: peers, rootScope: {myId: (1 as UserId).toPeerId(false)}});
  Object.assign(chats, {
    chats: {[GROUP_ID]: group, [MIN_CHANNEL_ID]: minChannel},
    appPeersManager: peers,
    appProfileManager: {getCachedFullChat: (chatId: ChatId) => profile.chatsFull[chatId]}
  });
  Object.assign(peers, {
    appUsersManager: users,
    appChatsManager: chats,
    appCommunitiesManager: {isCommunity: () => false},
    appMessagesManager: {getMessageByPeer: (peerId: PeerId, mid: number) => messages.get(`${peerId}_${mid}`)}
  });

  const addMessage = (mid: number, fields: Partial<Message.message>) => {
    const message = {_: 'message', pFlags: {}, peerId: GROUP_PEER_ID, mid, id: mid, date: 0, message: '', ...fields} as Message.message;
    messages.set(`${GROUP_PEER_ID}_${mid}`, message);
    peers.registerMessagePeers(message);
    return message;
  };

  return {peers, users, chats, messages, profile, group, addMessage};
}

describe('min peers are named through a message', () => {
  it('builds inputUserFromMessage for a min sender', () => {
    const {users, addMessage} = setup();
    addMessage(15, {fromId: MIN_USER_ID.toPeerId(false)});

    const groupInput = {_: 'inputPeerChannel', channel_id: GROUP_ID, access_hash: 'group'};
    expect(users.getUserInput(MIN_USER_ID)).toEqual({_: 'inputUserFromMessage', peer: groupInput, msg_id: 15, user_id: MIN_USER_ID});
    expect(users.getUserInputPeer(MIN_USER_ID)).toEqual({_: 'inputPeerUserFromMessage', peer: groupInput, msg_id: 15, user_id: MIN_USER_ID});
  });

  it('keeps the access_hash of a complete user', () => {
    const {users, addMessage} = setup();
    addMessage(15, {fromId: FULL_USER_ID.toPeerId(false)});

    expect(users.getUserInput(FULL_USER_ID)).toEqual({_: 'inputUser', user_id: FULL_USER_ID, access_hash: 'full-user'});
  });

  it('finds a min user in a mention and a min channel in a forward', () => {
    const {users, chats, addMessage} = setup();
    addMessage(16, {
      fwdFromId: MIN_CHANNEL_ID.toPeerId(true),
      entities: [{_: 'messageEntityMentionName', offset: 0, length: 1, user_id: MIN_USER_ID}]
    });

    expect(users.getUserInput(MIN_USER_ID)).toMatchObject({_: 'inputUserFromMessage', msg_id: 16});
    expect(chats.getChannelInput(MIN_CHANNEL_ID)).toMatchObject({_: 'inputChannelFromMessage', msg_id: 16, channel_id: MIN_CHANNEL_ID});
    expect(chats.getChannelInputPeer(MIN_CHANNEL_ID)).toMatchObject({_: 'inputPeerChannelFromMessage', msg_id: 16, channel_id: MIN_CHANNEL_ID});
  });

  it('skips a message that is gone and falls back to the access_hash when none is left', () => {
    const {users, messages, addMessage} = setup();
    addMessage(15, {fromId: MIN_USER_ID.toPeerId(false)});
    addMessage(20, {fromId: MIN_USER_ID.toPeerId(false)});

    messages.delete(`${GROUP_PEER_ID}_20`);
    expect(users.getUserInput(MIN_USER_ID)).toMatchObject({_: 'inputUserFromMessage', msg_id: 15});

    messages.delete(`${GROUP_PEER_ID}_15`);
    expect(users.getUserInput(MIN_USER_ID)).toEqual({_: 'inputUser', user_id: MIN_USER_ID, access_hash: 'min-user'});
  });

  it('finds a min user added to the group by a service message', () => {
    const {users, messages, peers} = setup();
    const message = {
      _: 'messageService', pFlags: {}, peerId: GROUP_PEER_ID, mid: 17, id: 17, date: 0,
      action: {_: 'messageActionChatAddUsers', users: [MIN_USER_ID, FULL_USER_ID]}
    } as unknown as Message.message;
    messages.set(`${GROUP_PEER_ID}_17`, message);
    peers.registerMessagePeers(message);

    expect(users.getUserInput(MIN_USER_ID)).toMatchObject({_: 'inputUserFromMessage', msg_id: 17});
  });

  it('ignores local messages', () => {
    const {users, addMessage} = setup();
    addMessage(15.5, {fromId: MIN_USER_ID.toPeerId(false)});

    expect(users.getUserInput(MIN_USER_ID)._).toBe('inputUser');
  });
});

describe('paid messages price of a channel', () => {
  it('drops the price when the full channel lifted it for this user', () => {
    const {chats, group, profile} = setup();
    group.send_paid_messages_stars = 10;

    expect(chats.getStarsAmount(GROUP_ID)).toBe(10);

    profile.chatsFull[GROUP_ID] = {_: 'channelFull', send_paid_messages_stars: 10} as ChatFull.channelFull;
    expect(chats.getStarsAmount(GROUP_ID)).toBe(10);

    profile.chatsFull[GROUP_ID] = {_: 'channelFull'} as ChatFull.channelFull;
    expect(chats.getStarsAmount(GROUP_ID)).toBeUndefined();
  });

  it('keeps an exemption while the full channel is reloaded', () => {
    const {chats, group, profile} = setup();
    group.send_paid_messages_stars = 10;
    profile.chatsFull[GROUP_ID] = {_: 'channelFull'} as ChatFull.channelFull;
    expect(chats.getStarsAmount(GROUP_ID)).toBeUndefined();

    delete profile.chatsFull[GROUP_ID];
    expect(chats.getStarsAmount(GROUP_ID)).toBeUndefined();

    profile.chatsFull[GROUP_ID] = {_: 'channelFull', send_paid_messages_stars: 10} as ChatFull.channelFull;
    expect(chats.getStarsAmount(GROUP_ID)).toBe(10);
  });

  it('follows the channel when the price changes after the full channel was loaded', () => {
    const {chats, group, profile} = setup();
    profile.chatsFull[GROUP_ID] = {_: 'channelFull', send_paid_messages_stars: 10} as ChatFull.channelFull;
    group.send_paid_messages_stars = 25;

    expect(chats.getStarsAmount(GROUP_ID)).toBe(25);
  });
});
