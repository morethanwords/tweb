import {InputStickerSet, StickerSet} from '@layer';
import {STICKERS_LOCAL_IDS_SET, STICKER_LOCAL_SET_ID, STICKER_LOCAL_SET_INPUT} from '@lib/appManagers/utils/stickers/constants';

export function getStickerSetInputByLocalId(localId: STICKER_LOCAL_SET_ID): STICKER_LOCAL_SET_INPUT {
  return {
    _: localId
  };
}

export function getStickerSetInputByStickerSet(stickerSet: StickerSet.stickerSet) {
  if(STICKERS_LOCAL_IDS_SET.has(stickerSet.id as any)) {
    return getStickerSetInputByLocalId(stickerSet.id as any);
  }

  return getStickerSetInputById(stickerSet);
}

export function getStickerSetInputById(
  {id, access_hash}: Pick<InputStickerSet.inputStickerSetID, 'id' | 'access_hash'>
): InputStickerSet.inputStickerSetID {
  return {
    _: 'inputStickerSetID',
    id,
    access_hash
  };
}

export function getStickerSetInputByShortName(shortName: string): InputStickerSet.inputStickerSetShortName {
  return {
    _: 'inputStickerSetShortName',
    short_name: shortName
  };
}

export function getStickerSetInputByDice(emoticon: string): InputStickerSet.inputStickerSetDice {
  return {
    _: 'inputStickerSetDice',
    emoticon
  };
}
