import {Message, MessagesMessageReactionsList, Reaction} from '@layer';
import {AppMessagesManager} from '@appManagers/appMessagesManager';
import '@helpers/peerIdPolyfill';

const fire: Reaction.reactionEmoji = {_: 'reactionEmoji', emoticon: '🔥'};
const chatPeerId = (100 as ChatId).toPeerId(true);
const reactorPeerId = (200 as UserId).toPeerId(false);

const message = {
  _: 'message',
  pFlags: {},
  id: 10,
  mid: 10,
  peerId: chatPeerId,
  date: 1,
  message: '',
  reactions: {
    _: 'messageReactions',
    pFlags: {can_see_list: true},
    results: [{_: 'reactionCount', reaction: fire, count: 1}]
  }
} as Message.message;

function createManager(reactionsList: MessagesMessageReactionsList) {
  const getMessageReactionsList = vi.fn().mockResolvedValue(reactionsList);
  const manager = {
    canViewMessageReadParticipants: vi.fn().mockResolvedValue(false),
    appReactionsManager: {getMessageReactionsList},
    appPeersManager: {
      getPeerId: vi.fn(() => reactorPeerId)
    }
  };

  return {manager, getMessageReactionsList};
}

describe('getMessageReactionsListAndReadParticipants', () => {
  it('fetches the full list without a local recent_reactions cache and preserves pFlags.my', async() => {
    const reactionsList: MessagesMessageReactionsList = {
      _: 'messages.messageReactionsList',
      count: 1,
      reactions: [{
        _: 'messagePeerReaction',
        pFlags: {my: true},
        peer_id: {_: 'peerUser', user_id: 200 as UserId},
        date: 1,
        reaction: fire
      }],
      chats: [],
      users: []
    };
    const {manager, getMessageReactionsList} = createManager(reactionsList);

    expect(message.reactions.recent_reactions).toBeUndefined();

    const result = await AppMessagesManager.prototype.getMessageReactionsListAndReadParticipants.call(
      manager,
      message,
      undefined,
      fire,
      undefined,
      true,
      false
    );

    expect(getMessageReactionsList).toHaveBeenCalledOnce();
    expect(getMessageReactionsList).toHaveBeenCalledWith(chatPeerId, message.mid, 50, fire, undefined);
    expect(result.combined).toEqual([{
      peerId: reactorPeerId,
      reaction: fire,
      date: 1,
      isMyReaction: true
    }]);
  });

  it('does not fetch the reaction list when skipReactionsList is true', async() => {
    const {manager, getMessageReactionsList} = createManager({
      _: 'messages.messageReactionsList',
      count: 0,
      reactions: [],
      chats: [],
      users: []
    });

    const result = await AppMessagesManager.prototype.getMessageReactionsListAndReadParticipants.call(
      manager,
      message,
      undefined,
      fire,
      undefined,
      true,
      true
    );

    expect(getMessageReactionsList).not.toHaveBeenCalled();
    expect(result.combined).toEqual([]);
    expect(result.reactionsCount).toBe(0);
  });
});
