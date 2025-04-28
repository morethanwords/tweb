import {InputSavedStarGift} from '../../../../layer';
import getPeerId from '../peers/getPeerId';

export function inputStarGiftEquals(a: InputSavedStarGift, b: InputSavedStarGift) {
  if(a._ === 'inputSavedStarGiftChat' && b._ === 'inputSavedStarGiftChat') {
    return a.saved_id === b.saved_id && getPeerId(a.peer) === getPeerId(b.peer);
  }
  if(a._ === 'inputSavedStarGiftUser' && b._ === 'inputSavedStarGiftUser') {
    return a.msg_id === b.msg_id;
  }
  return false;
}
