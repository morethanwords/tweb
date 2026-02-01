import type {InputStickerSet, MessagesStickerSet} from '@layer';

export type STICKER_LOCAL_SET_INPUT = Extract<InputStickerSet, {_: STICKER_LOCAL_SET_ID}>;

export type STICKER_LOCAL_SET_ID = Extract<
  InputStickerSet['_'],
  'inputStickerSetAnimatedEmoji' | 'inputStickerSetAnimatedEmojiAnimations' |
  'inputStickerSetPremiumGifts' | 'inputStickerSetEmojiGenericAnimations' |
  'inputStickerSetEmojiDefaultStatuses' | 'inputStickerSetEmojiDefaultTopicIcons' | 'inputStickerSetTonGifts'
>;

export type STICKERS_LOCAL_ID = 'EMOJI' | 'EMOJI_ANIMATIONS' | 'PREMIUM_GIFTS' | 'GENERIC_ANIMATIONS' | 'DEFAULT_STATUSES' | 'DEFAULT_TOPIC_ICONS' | 'TON_GIFTS';

export const STICKERS_LOCAL_IDS: {[key in STICKERS_LOCAL_ID]: STICKER_LOCAL_SET_ID} = {
  EMOJI: 'inputStickerSetAnimatedEmoji',
  EMOJI_ANIMATIONS: 'inputStickerSetAnimatedEmojiAnimations',
  PREMIUM_GIFTS: 'inputStickerSetPremiumGifts',
  GENERIC_ANIMATIONS: 'inputStickerSetEmojiGenericAnimations',
  DEFAULT_STATUSES: 'inputStickerSetEmojiDefaultStatuses',
  DEFAULT_TOPIC_ICONS: 'inputStickerSetEmojiDefaultTopicIcons',
  TON_GIFTS: 'inputStickerSetTonGifts'
};

export const STICKERS_LOCAL_IDS_SET: Set<STICKER_LOCAL_SET_ID> = new Set(Object.values(STICKERS_LOCAL_IDS) as any);

// let TEST_FILE_REFERENCE_REFRESH = true;

export type MyStickerSetInput = Exclude<InputStickerSet, InputStickerSet.inputStickerSetEmpty>;

export type MyMessagesStickerSet = MessagesStickerSet.messagesStickerSet;
