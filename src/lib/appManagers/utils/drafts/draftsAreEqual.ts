import deepEqual from '../../../../helpers/object/deepEqual';
import {DraftMessage} from '../../../../layer';
import repliesAreEqual from '../messages/repliesAreEqual';

export default function draftsAreEqual(draft1: DraftMessage, draft2: DraftMessage) {
  return deepEqual(draft1 as DraftMessage.draftMessage, draft2 as DraftMessage.draftMessage, ['date', 'reply_to']) &&
    repliesAreEqual((draft1 as DraftMessage.draftMessage)?.reply_to, (draft2 as DraftMessage.draftMessage)?.reply_to);
}
