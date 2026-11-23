import createUpdatesManager, {newChannelMessageUpdate, push} from '@/tests/helpers/updatesManager';
import {Message, Peer, Update} from '@layer';

// An incoming message is applied from its update when the client knows every peer the message names, and asks
// for a difference otherwise (tdesktop's AllDataLoadedForMessage: peerLoaded for the author and the forward's
// origin, whatever kind of peer they are). A channel as the author — a group's anonymous admin, a message sent as
// a channel, a channel's post brought into its discussion group — or as a forward's origin was looked up among
// the users, never found, and every such message cost a difference before it was shown.

const groupId = 50 as ChatId;
const otherChannelId = 60 as ChatId;
const userId = 7 as UserId;

function setup() {
  const {manager, saved} = createUpdatesManager();
  const users = new Set<UserId>([userId]);
  const chats = new Set<ChatId>([groupId, otherChannelId]);
  manager.appUsersManager.hasUser = (id: UserId) => users.has(id);
  manager.appChatsManager.hasChat = (id: ChatId) => chats.has(id);
  manager.addChannelState(groupId, 100);
  const getChannelDifference = manager.getChannelDifference = vi.fn();
  const getDifference = manager.getDifference = vi.fn();

  return {manager, saved, users, chats, getChannelDifference, getDifference};
}

function groupMessage(fromId: Peer, extra?: Partial<Message.message>) {
  return newChannelMessageUpdate(groupId, 11, 101, {from_id: fromId, ...extra});
}

function privateMessage(extra: Partial<Message.message>): Update.updateNewMessage {
  return {
    _: 'updateNewMessage',
    message: {
      _: 'message',
      id: 5,
      peer_id: {_: 'peerUser', user_id: userId},
      from_id: {_: 'peerUser', user_id: userId},
      pFlags: {},
      date: 2,
      message: 'hi',
      ...extra
    },
    pts: 2,
    pts_count: 1
  };
}

function forwardedFrom(fromId: Peer) {
  return privateMessage({fwd_from: {_: 'messageFwdHeader', pFlags: {}, date: 1, from_id: fromId}});
}

describe('a message whose peers the client knows is applied from its update', () => {
  test('a group\'s anonymous admin', () => {
    const {manager, saved, getChannelDifference} = setup();

    push(manager, groupMessage({_: 'peerChannel', channel_id: groupId}));

    expect(saved.map((update) => update._)).toEqual(['updateNewChannelMessage']);
    expect(getChannelDifference).not.toHaveBeenCalled();
  });

  test('a message sent as another channel', () => {
    const {manager, saved, getChannelDifference} = setup();

    push(manager, groupMessage({_: 'peerChannel', channel_id: otherChannelId}));

    expect(saved).toHaveLength(1);
    expect(getChannelDifference).not.toHaveBeenCalled();
  });

  test('a message forwarded from a channel', () => {
    const {manager, saved, getDifference} = setup();

    push(manager, forwardedFrom({_: 'peerChannel', channel_id: otherChannelId}));

    expect(saved.map((update) => update._)).toEqual(['updateNewMessage']);
    expect(getDifference).not.toHaveBeenCalled();
  });

  test('a message of a user', () => {
    const {manager, saved} = setup();

    push(manager, groupMessage({_: 'peerUser', user_id: userId}));

    expect(saved).toHaveLength(1);
  });
});

describe('a message naming a peer the client does not know waits for a difference', () => {
  test('an unknown channel as the author', () => {
    const {manager, saved, chats, getChannelDifference} = setup();
    chats.delete(otherChannelId);

    push(manager, groupMessage({_: 'peerChannel', channel_id: otherChannelId}));

    expect(saved).toEqual([]);
    expect(getChannelDifference).toHaveBeenCalledWith(groupId);
  });

  test('an unknown user as the author', () => {
    const {manager, saved, users, getChannelDifference} = setup();
    users.delete(userId);

    push(manager, groupMessage({_: 'peerUser', user_id: userId}));

    expect(saved).toEqual([]);
    expect(getChannelDifference).toHaveBeenCalledWith(groupId);
  });

  test('a forward from an unknown channel', () => {
    const {manager, saved, chats, getDifference} = setup();
    chats.delete(otherChannelId);

    push(manager, forwardedFrom({_: 'peerChannel', channel_id: otherChannelId}));

    expect(saved).toEqual([]);
    expect(getDifference).toHaveBeenCalled();
  });

  test('a forward from an unknown user', () => {
    const {manager, saved, users, getDifference} = setup();
    users.delete(8 as UserId);

    push(manager, forwardedFrom({_: 'peerUser', user_id: 8}));

    expect(saved).toEqual([]);
    expect(getDifference).toHaveBeenCalled();
  });
});
