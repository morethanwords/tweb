import numberThousandSplitter from '../../../../helpers/number/numberThousandSplitter';
import {StarGift} from '../../../../layer';

export function getCollectibleName(gift: StarGift.starGiftUnique) {
  return `${gift.title} #${numberThousandSplitter(gift.num, ',')}`
}
