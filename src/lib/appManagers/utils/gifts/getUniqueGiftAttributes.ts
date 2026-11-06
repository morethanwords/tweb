import {StarGift, StarGiftAttribute} from '@layer';

export type UniqueGiftAttributes = {
  model?: StarGiftAttribute.starGiftAttributeModel,
  backdrop?: StarGiftAttribute.starGiftAttributeBackdrop,
  pattern?: StarGiftAttribute.starGiftAttributePattern,
  original?: StarGiftAttribute.starGiftAttributeOriginalDetails
};

export default function getUniqueGiftAttributes(gift: StarGift.starGiftUnique) {
  const attributes: UniqueGiftAttributes = {};
  for(const attribute of gift.attributes) {
    switch(attribute._) {
      case 'starGiftAttributeModel':
        attributes.model = attribute;
        break;
      case 'starGiftAttributeBackdrop':
        attributes.backdrop = attribute;
        break;
      case 'starGiftAttributePattern':
        attributes.pattern = attribute;
        break;
      case 'starGiftAttributeOriginalDetails':
        attributes.original = attribute;
        break;
    }
  }

  return attributes;
}
