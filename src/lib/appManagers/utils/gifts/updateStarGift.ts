import {StarGift} from '../../../../layer';
import {BroadcastEvents} from '../../../rootScope';
import {MyStarGift} from '../../appGiftsManager';

export function updateStarGift(gift: MyStarGift, update: BroadcastEvents['star_gift_update']) {
  const {unsaved, converted, resalePrice, wearing} = update;

  if(unsaved !== undefined) {
    gift.saved.pFlags.unsaved = unsaved ? true : undefined;
  }
  if(converted !== undefined) {
    gift.isConverted = converted;
  }

  if(resalePrice !== undefined) {
    if(resalePrice.length === 0) {
      gift.resellPriceStars = null;
      gift.resellPriceTon = null;
      gift.resellOnlyTon = false;
      const raw = gift.raw as StarGift.starGiftUnique;
      raw.pFlags.resale_ton_only = undefined;
      raw.resell_amount = undefined;
    } else {
      gift.resellOnlyTon = false;
      for(const price of resalePrice) {
        if(price._ === 'starsAmount') {
          gift.resellPriceStars = price.amount;
        } else if(price._ === 'starsTonAmount') {
          gift.resellPriceTon = price.amount;
          gift.resellOnlyTon = true;
        }
      }

      const raw = gift.raw as StarGift.starGiftUnique;
      raw.pFlags.resale_ton_only = gift.resellOnlyTon ? true : undefined;
      raw.resell_amount = resalePrice;
    }
  }

  if(wearing !== undefined) {
    gift.isWearing = wearing;
  }
}
