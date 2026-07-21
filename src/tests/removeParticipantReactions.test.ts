import {MessageReactions, Peer, Reaction} from '@layer';
import removeParticipantReactions from '@appManagers/utils/reactions/removeParticipantReactions';
import '@helpers/peerIdPolyfill';

const fire: Reaction.reactionEmoji = {_: 'reactionEmoji', emoticon: '🔥'};
const heart: Reaction.reactionEmoji = {_: 'reactionEmoji', emoticon: '❤'};
const paid: Reaction.reactionPaid = {_: 'reactionPaid'};

const peer = (userId: number): Peer.peerUser => ({
  _: 'peerUser',
  user_id: userId
});

const peerId = (userId: number) => (userId as UserId).toPeerId(false);

describe('removeParticipantReactions', () => {
  it('removes every locally known reaction of the participant', () => {
    const reactions: MessageReactions = {
      _: 'messageReactions',
      pFlags: {can_see_list: true},
      results: [
        {_: 'reactionCount', reaction: fire, count: 3},
        {_: 'reactionCount', reaction: heart, count: 1},
        {_: 'reactionCount', reaction: paid, count: 5}
      ],
      recent_reactions: [
        {_: 'messagePeerReaction', pFlags: {}, peer_id: peer(1), date: 1, reaction: fire},
        {_: 'messagePeerReaction', pFlags: {}, peer_id: peer(1), date: 2, reaction: heart},
        {_: 'messagePeerReaction', pFlags: {}, peer_id: peer(1), date: 3, reaction: paid},
        {_: 'messagePeerReaction', pFlags: {}, peer_id: peer(2), date: 4, reaction: fire}
      ],
      top_reactors: [
        {_: 'messageReactor', pFlags: {}, peer_id: peer(1), count: 3},
        {_: 'messageReactor', pFlags: {}, peer_id: peer(2), count: 2}
      ]
    };

    const updated = removeParticipantReactions({
      reactions,
      participantPeerId: peerId(1),
      knownReaction: fire
    });

    expect(updated.results).toEqual([
      {_: 'reactionCount', reaction: fire, count: 2},
      {_: 'reactionCount', reaction: paid, count: 2}
    ]);
    expect(updated.recent_reactions).toEqual([
      {_: 'messagePeerReaction', pFlags: {}, peer_id: peer(2), date: 4, reaction: fire}
    ]);
    expect(updated.top_reactors).toEqual([
      {_: 'messageReactor', pFlags: {}, peer_id: peer(2), count: 2}
    ]);
    expect(reactions.results.map(({count}) => count)).toEqual([3, 1, 5]);
  });

  it('uses the selected reaction when the recent list is truncated', () => {
    const reactions: MessageReactions = {
      _: 'messageReactions',
      pFlags: {can_see_list: true},
      results: [
        {_: 'reactionCount', reaction: fire, count: 5},
        {_: 'reactionCount', reaction: heart, count: 2}
      ],
      recent_reactions: [
        {_: 'messagePeerReaction', pFlags: {}, peer_id: peer(1), date: 1, reaction: heart},
        {_: 'messagePeerReaction', pFlags: {}, peer_id: peer(2), date: 2, reaction: fire}
      ]
    };

    const updated = removeParticipantReactions({
      reactions,
      participantPeerId: peerId(1),
      knownReaction: fire
    });

    expect(updated.results[0].count).toBe(4);
    expect(updated.results[1].count).toBe(1);
  });

  it('does not decrement a paid reaction twice', () => {
    const reactions: MessageReactions = {
      _: 'messageReactions',
      pFlags: {},
      results: [{_: 'reactionCount', reaction: paid, count: 5}],
      top_reactors: [
        {_: 'messageReactor', pFlags: {}, peer_id: peer(1), count: 3}
      ]
    };

    const updated = removeParticipantReactions({
      reactions,
      participantPeerId: peerId(1),
      knownReaction: paid
    });

    expect(updated.results[0].count).toBe(2);
  });

  it('falls back to one paid reaction when no top-reactor count is cached', () => {
    const reactions: MessageReactions = {
      _: 'messageReactions',
      pFlags: {can_see_list: true},
      results: [{_: 'reactionCount', reaction: paid, count: 5}],
      recent_reactions: [
        {_: 'messagePeerReaction', pFlags: {}, peer_id: peer(1), date: 1, reaction: paid}
      ]
    };

    const updated = removeParticipantReactions({
      reactions,
      participantPeerId: peerId(1),
      knownReaction: paid
    });

    expect(updated.results[0].count).toBe(4);
  });

  it('returns the original value when nothing can be changed', () => {
    const reactions: MessageReactions = {
      _: 'messageReactions',
      pFlags: {},
      results: [{_: 'reactionCount', reaction: fire, count: 1}]
    };

    expect(removeParticipantReactions({
      reactions,
      participantPeerId: peerId(1)
    })).toBe(reactions);
  });

  it('removes the reactions object when its last counter reaches zero', () => {
    const reactions: MessageReactions = {
      _: 'messageReactions',
      pFlags: {can_see_list: true},
      results: [{_: 'reactionCount', reaction: fire, count: 1}],
      recent_reactions: [
        {_: 'messagePeerReaction', pFlags: {}, peer_id: peer(1), date: 1, reaction: fire}
      ]
    };

    expect(removeParticipantReactions({
      reactions,
      participantPeerId: peerId(1)
    })).toBeUndefined();
  });
});
