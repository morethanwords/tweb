import {Message} from '../../../../layer';
import getPeerId from '../peers/getPeerId';
import getFwdFromName from './getFwdFromName';

export default function isForwardOfForward(message: Message) {
  const fwdFrom = (message as Message.message).fwd_from;
  if(!fwdFrom) {
    return false;
  }

  const fwdFromName = getFwdFromName(fwdFrom);
  const fwdFromId = getPeerId(fwdFrom.from_id);
  return !!(fwdFromName && (fwdFromId || (fwdFrom.from_name && fwdFrom.saved_from_name && fwdFrom.from_name !== fwdFrom.saved_from_name))) ||
    !!(fwdFrom.saved_from_id/*  && getPeerId(fwdFrom.saved_from_id) !== fwdFromId */);
}
