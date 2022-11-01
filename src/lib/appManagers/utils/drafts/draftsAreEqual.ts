import deepEqual from '../../../../helpers/object/deepEqual';
import isObject from '../../../../helpers/object/isObject';
import {DraftMessage} from '../../../../layer';

export default function draftsAreEqual(draft1: DraftMessage, draft2: DraftMessage) {
  if(typeof(draft1) !== typeof(draft2)) {
    return false;
  }

  if(!isObject(draft1)) {
    return true;
  }

  if(draft1._ !== draft2._) {
    return false;
  }

  if(draft1._ === 'draftMessage' && draft2._ === draft1._) {
    if(draft1.reply_to_msg_id !== draft2.reply_to_msg_id) {
      return false;
    }

    if(!deepEqual(draft1.entities, draft2.entities)) {
      return false;
    }

    if(draft1.message !== draft2.message) {
      return false;
    }

    if(draft1.pFlags.no_webpage !== draft2.pFlags.no_webpage) {
      return false;
    }
  }

  return true;
}
