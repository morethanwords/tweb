import deepEqual from '../../../../helpers/object/deepEqual';
import {Reaction} from '../../../../layer';

export default function reactionsEqual(r1: Reaction, r2: Reaction) {
  return deepEqual(r1, r2);
}
