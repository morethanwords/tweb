import deepEqual from '../../../../helpers/object/deepEqual';
import {AvailableReaction, Reaction} from '../../../../layer';
import availableReactionToReaction from './availableReactionToReaction';

export default function reactionsEqual(r1: Reaction | AvailableReaction, r2: Reaction | AvailableReaction) {
  if(typeof(r1) !== typeof(r2)) {
    return false;
  }

  [r1, r2] = [r1, r2].map((r) => {
    return r._ === 'availableReaction' ? availableReactionToReaction(r) : r;
  });

  return deepEqual(r1, r2);
}
