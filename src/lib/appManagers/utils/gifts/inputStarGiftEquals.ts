import {InputSavedStarGift} from '../../../../layer';
import {MyStarGift} from '../../appGiftsManager';
import getPeerId from '../peers/getPeerId';

export function inputStarGiftEquals(gift: InputSavedStarGift | MyStarGift, b: InputSavedStarGift) {
  const a = 'type' in gift ? gift.input : gift;
  if(a._ === 'inputSavedStarGiftChat' && b._ === 'inputSavedStarGiftChat') {
    return a.saved_id === b.saved_id && getPeerId(a.peer) === getPeerId(b.peer);
  }
  if(a._ === 'inputSavedStarGiftUser' && b._ === 'inputSavedStarGiftUser') {
    return a.msg_id === b.msg_id;
  }
  if(a._ === 'inputSavedStarGiftSlug' && b._ === 'inputSavedStarGiftSlug') {
    return a.slug === b.slug;
  }

  if('raw' in gift && gift.raw._ === 'starGiftUnique' && b._ === 'inputSavedStarGiftSlug') {
    return gift.raw.slug === b.slug;
  }

  return false;
}
