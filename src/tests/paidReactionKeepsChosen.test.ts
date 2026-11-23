import '@helpers/peerIdPolyfill';
import {AppReactionsManager} from '@appManagers/appReactionsManager';
import getPeerId from '@appManagers/utils/peers/getPeerId';
import {count as countOf, emoji, paid} from '@/tests/helpers/reactions';
import {Message, MessageReactions, Peer, Reaction, ReactionCount} from '@layer';

// Stars sent to a post are not one of the reactions the user chose, which the limit (one without Premium) counts:
// sending them pushes none of those out, as in tdesktop (MessageReactions::add never takes the paid one). Counted as
// a new choice, they took the user's own 👍 off the post on screen while the stars waited to be sent, and a tap on
// 👍 to put it back really took it off.

const like = emoji('👍');
const heart = emoji('❤');

function chosenCount(reaction: Reaction, count: number, chosen_order: number): ReactionCount {
  return {...countOf(reaction, count), chosen_order};
}

function setup(limit: number, results: ReactionCount[]) {
  const peerId = (60 as ChatId).toPeerId(true);
  const message = {
    _: 'message',
    id: 7,
    mid: 7,
    peerId,
    peer_id: {_: 'peerChannel', channel_id: 60},
    pFlags: {},
    reactions: {_: 'messageReactions', pFlags: {}, results}
  } as Message.message;
  const manager = new AppReactionsManager() as any;
  Object.assign(manager, {
    apiManager: {getLimit: () => Promise.resolve(limit)},
    getPaidReactionPrivacy: () => ({_: 'paidReactionPrivacyDefault'}),
    appMessagesManager: {
      isEphemeralMessage: () => false,
      getMessageByPeer: () => message,
      generateFromId: (): Peer => undefined
    },
    appPeersManager: {
      peerId: (1 as UserId).toPeerId(false),
      getPeerId,
      // * whose the reaction is does not matter here
      getOutputPeer: (): Peer => ({_: 'peerUser', user_id: 1}),
      isBroadcast: () => true,
      isMegagroup: () => false
    }
  });

  return {manager, message};
}

/** a post with the user's own 👍 among 3, at the limit of one */
function setupLiked() {
  return setup(1, [chosenCount(like, 3, 0)]);
}

function chosen(reactions: MessageReactions) {
  return reactions.results
  .filter((reactionCount) => reactionCount.chosen_order >= 0)
  .map((reactionCount) => [(reactionCount.reaction as Reaction.reactionEmoji).emoticon, reactionCount.count]);
}

describe('stars sent to a post', () => {
  test('keep the reaction the user chose, at the limit of one', async() => {
    const {manager, message} = setupLiked();

    const reactions = await manager.sendReaction({message, reaction: paid, count: 5, onlyReturn: true});

    expect(chosen(reactions)).toEqual([['👍', 3]]);
    expect(reactions.results.find((reactionCount: ReactionCount) => reactionCount.reaction._ === 'reactionPaid').count).toBe(5);
  });

  test('keep both the user chose, at the limit of two', async() => {
    const {manager, message} = setup(2, [chosenCount(like, 3, 0), chosenCount(heart, 1, 1)]);

    const reactions = await manager.sendReaction({message, reaction: paid, count: 1, onlyReturn: true});

    expect(chosen(reactions).sort()).toEqual([['❤', 1], ['👍', 3]]);
  });

  test('a new reaction at the limit still takes the place of the old one', async() => {
    const {manager, message} = setupLiked();

    const reactions = await manager.sendReaction({message, reaction: heart, onlyReturn: true});

    expect(chosen(reactions)).toEqual([['❤', 1]]);
  });
});
