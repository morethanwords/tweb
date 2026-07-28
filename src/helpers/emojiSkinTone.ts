import EmojiSkinToneTemplates from '@config/emojiSkinTone';
import {
  EMOJI_TONE_MODIFIERS,
  emojiFromCodePoints,
  encodeEmoji,
  getEmojiToneIndex,
  getEmojiToneIndexes,
  removeEmojiTone
} from '@vendor/emoji';

export type EmojiSkinTone = 0 | 1 | 2 | 3 | 4 | 5;
export type EmojiSkinToneVariants = [
  string,
  string,
  string,
  string,
  string,
  string
];

function getNormalizedKey(emoji: string) {
  return encodeEmoji(emoji).replace(/-?fe0f/g, '');
}

export function getEmojiSkinToneVariants(emoji: string) {
  const baseKey = getNormalizedKey(removeEmojiTone(emoji));
  const template = EmojiSkinToneTemplates[baseKey];
  if(!template) {
    return;
  }

  const baseEmoji = emojiFromCodePoints(baseKey);
  const variants = [
    baseEmoji,
    ...EMOJI_TONE_MODIFIERS.map((tone) => template.split(EMOJI_TONE_MODIFIERS[0]).join(tone))
  ] as EmojiSkinToneVariants;

  return {
    baseEmoji,
    variants
  };
}

export function getEmojiSkinToneBase(emoji: string) {
  return getEmojiSkinToneVariants(emoji)?.baseEmoji || emoji;
}

export function getEmojiSkinTone(emoji: string): EmojiSkinTone {
  const tones = getEmojiToneIndexes(emoji);
  if(!tones.length || !tones.every((tone) => tone === tones[0])) {
    return 0;
  }

  return getEmojiToneIndex(emoji) as EmojiSkinTone;
}
