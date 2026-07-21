import {MessageReactions, Reaction} from '@layer';
import copy from '@helpers/object/copy';
import getPeerId from '@appManagers/utils/peers/getPeerId';
import reactionsEqual from '@appManagers/utils/reactions/reactionsEqual';

export default function removeParticipantReactions({
  reactions,
  participantPeerId,
  knownReaction
}: {
  reactions: MessageReactions,
  participantPeerId: PeerId,
  knownReaction?: Reaction
}): MessageReactions {
  if(!reactions) {
    return reactions;
  }

  const updated = copy(reactions);
  let changed = false;
  let hasPaidRecentReaction = false;
  let removedKnownReaction = false;
  let paidCount = 0;

  const decrementResult = (reaction: Reaction, count = 1) => {
    const index = updated.results.findIndex((result) => reactionsEqual(result.reaction, reaction));
    if(index === -1) {
      return;
    }

    const result = updated.results[index];
    result.count = Math.max(0, result.count - count);
    if(!result.count) {
      updated.results.splice(index, 1);
    }
    changed = true;
  };

  if(updated.recent_reactions) {
    updated.recent_reactions = updated.recent_reactions.filter((peerReaction) => {
      if(getPeerId(peerReaction.peer_id) !== participantPeerId) {
        return true;
      }

      changed = true;
      if(peerReaction.reaction._ === 'reactionPaid') {
        hasPaidRecentReaction = true;
      } else {
        decrementResult(peerReaction.reaction);
        if(knownReaction && reactionsEqual(peerReaction.reaction, knownReaction)) {
          removedKnownReaction = true;
        }
      }
      return false;
    });
  }

  if(updated.top_reactors) {
    updated.top_reactors = updated.top_reactors.filter((reactor) => {
      if(!reactor.peer_id || getPeerId(reactor.peer_id) !== participantPeerId) {
        return true;
      }

      paidCount += reactor.count;
      changed = true;
      return false;
    });
  }

  if(paidCount || hasPaidRecentReaction) {
    decrementResult({_: 'reactionPaid'}, paidCount || 1);
    if(knownReaction?._ === 'reactionPaid') {
      removedKnownReaction = true;
    }
  }

  // `recent_reactions` may be truncated. The reaction-specific menu still knows
  // which counter belongs to the participant, so mirror the official clients'
  // fallback and decrement that counter when the participant is absent locally.
  if(knownReaction && !removedKnownReaction) {
    decrementResult(knownReaction);
  }

  if(!changed) {
    return reactions;
  }

  return updated.results.length ? updated : undefined;
}
