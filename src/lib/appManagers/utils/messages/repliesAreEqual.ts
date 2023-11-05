import deepEqual from '../../../../helpers/object/deepEqual';
import {InputReplyTo, MessageReplyHeader} from '../../../../layer';

export default function repliesAreEqual(reply1: MessageReplyHeader | InputReplyTo, reply2: MessageReplyHeader | InputReplyTo) {
  return deepEqual(reply1, reply2);
}
