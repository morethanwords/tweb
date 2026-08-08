import parseEntities from '@lib/richTextProcessor/parseEntities';
import emojiRegExp from '@vendor/emoji/regex';

describe('emoji regexp', () => {
  // * a lone surrogate in the pattern has no UTF-8 representation, so bundlers that fold this
  // * constant into a chunk rewrite it to U+FFFD and every astral emoji silently stops matching
  test('is pure ASCII so a bundler cannot mangle it', () => {
    const offenders = [...emojiRegExp].filter((char) => char.charCodeAt(0) > 0x7f);

    expect(offenders).toEqual([]);
  });

  test('matches astral emoji whole', () => {
    const regExp = new RegExp(`^(?:${emojiRegExp})$`);

    for(const emoji of ['😳', '🔥', '👍', '👍🏽', '🇺🇸', '👨‍👩‍👦', '🫱🏻‍🫲🏿', '❤', '☝', '⌚']) {
      expect(regExp.test(emoji), emoji).toBe(true);
    }
  });

  test('gives an emoji entity spanning the whole emoji', () => {
    // * this is what makes a bubble render big/animated emoji — bubbles.ts compares the summed
    // * emoji-entity length against the trimmed message length
    for(const emoji of ['😳', '🔥', '👍🏽', '❤']) {
      expect(parseEntities(emoji), emoji).toEqual([
        expect.objectContaining({_: 'messageEntityEmoji', offset: 0, length: emoji.length})
      ]);
    }
  });
});
