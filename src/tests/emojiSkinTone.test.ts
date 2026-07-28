import Emoji from '@config/emoji';
import EmojiSkinToneTemplates from '@config/emojiSkinTone';
import {
  getEmojiSkinToneBase,
  getEmojiSkinTone,
  getEmojiSkinToneVariants
} from '@helpers/emojiSkinTone';
import filterUnique from '@helpers/array/filterUnique';
import {
  emojiFromCodePoints,
  encodeEmoji,
  getEmojiToneIndexes,
  removeEmojiTone,
  toCodePoints
} from '@vendor/emoji';

const withoutVariationSelectors = (emoji: string) => {
  return toCodePoints(emoji).filter((codePoint) => codePoint !== 'fe0f').join('-');
};

describe('emoji skin tones', () => {
  test('returns the base emoji and five Fitzpatrick variants', () => {
    const result = getEmojiSkinToneVariants('👍');

    expect(result.variants).toEqual(['👍', '👍🏻', '👍🏼', '👍🏽', '👍🏾', '👍🏿']);
  });

  test('canonicalizes an already colored emoji', () => {
    const result = getEmojiSkinToneVariants('👍🏽');

    expect(result.baseEmoji).toBe('👍');
    expect(getEmojiSkinTone('👍🏽')).toBe(3);
    expect(getEmojiToneIndexes('🫱🏻‍🫲🏿')).toEqual([1, 5]);
    expect(getEmojiSkinTone('🫱🏻‍🫲🏿')).toBe(0);
  });

  test('inserts the modifier before the rest of a ZWJ sequence', () => {
    const result = getEmojiSkinToneVariants('🏃‍♀️');

    expect(withoutVariationSelectors(result.variants[3])).toBe('1f3c3-1f3fd-200d-2640');
  });

  test('does not offer colors for an emoji without skin-tone variants', () => {
    expect(getEmojiSkinToneVariants('😂')).toBeUndefined();
    expect(getEmojiSkinToneVariants('🏻')).toBeUndefined();
  });

  test('uses the base emoji as the identity for recent deduplication', () => {
    const recent = filterUnique(['👍', '👍🏽', '😂'].map(getEmojiSkinToneBase));

    expect(recent).toEqual(['👍', '😂']);
  });

  test('generates templates for every complete single-tone family in the emoji config', () => {
    const tonesByBase = new Map<string, Set<number>>();
    for(const emojiKey in Emoji) {
      const emoji = emojiFromCodePoints(emojiKey);
      const tones = getEmojiToneIndexes(emoji);
      if(!tones.length || !tones.every((tone) => tone === tones[0])) {
        continue;
      }

      const baseKey = encodeEmoji(removeEmojiTone(emoji)).replace(/-?fe0f/g, '');
      if(!baseKey) {
        continue;
      }

      let tonesForBase = tonesByBase.get(baseKey);
      if(!tonesForBase) {
        tonesForBase = new Set();
        tonesByBase.set(baseKey, tonesForBase);
      }

      tonesForBase.add(tones[0]);
    }

    const expectedBases = [...tonesByBase]
    .filter(([, tones]) => tones.size === 5)
    .map(([base]) => base)
    .sort();
    expect(Object.keys(EmojiSkinToneTemplates).sort()).toEqual(expectedBases);
  });
});
