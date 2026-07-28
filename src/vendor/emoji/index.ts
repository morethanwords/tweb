export function encodeEmoji(emojiText: string) {
  const codepoints = toCodePoints(removeVS16s(emojiText)).join('-');
  return codepoints;
}

const vs16RegExp = /\uFE0F/g;
// avoid using a string literal like '\u200D' here because minifiers expand it inline
const zeroWidthJoiner = String.fromCharCode(0x200d);

const removeVS16s = (rawEmoji: string) => (rawEmoji.indexOf(zeroWidthJoiner) < 0 ? rawEmoji.replace(vs16RegExp, '') : rawEmoji);

export function toCodePoints(unicodeSurrogates: string): Array<string> {
  const points = [];
  let char = 0;
  let previous = 0;
  let i = 0;
  while(i < unicodeSurrogates.length) {
    char = unicodeSurrogates.charCodeAt(i++);
    if(previous) {
      points.push((0x10000 + ((previous - 0xd800) << 10) + (char - 0xdc00)).toString(16));
      previous = 0;
    } else if(char > 0xd800 && char <= 0xdbff) {
      previous = char;
    } else {
      points.push(char.toString(16));
    }
  }

  if(points.length && points[0].length === 2) {
    points[0] = '00' + points[0];
  }

  return points;
}

export const EMOJI_TONE_MODIFIERS = ['🏻', '🏼', '🏽', '🏾', '🏿'] as const;
const emojiToneRegExp = /🏻|🏼|🏽|🏾|🏿/g;
const singleEmojiToneRegExp = /🏻|🏼|🏽|🏾|🏿/;

export function getEmojiToneIndexes(input: string) {
  return (input.match(emojiToneRegExp) || [])
  .map((tone) => EMOJI_TONE_MODIFIERS.indexOf(tone as typeof EMOJI_TONE_MODIFIERS[number]) + 1);
}

export function getEmojiToneIndex(input: string) {
  const match = input.match(singleEmojiToneRegExp);
  return match ? EMOJI_TONE_MODIFIERS.indexOf(match[0] as typeof EMOJI_TONE_MODIFIERS[number]) + 1 : 0;
}

export function removeEmojiTone(input: string) {
  return input.replace(emojiToneRegExp, '');
}

const VIRTUAL_COUNTRIES_EMOJIS: Map<string, string> = new Map([
  ['FT', '🏴‍☠']
]);

export function getCountryEmoji(iso2: string) {
  return VIRTUAL_COUNTRIES_EMOJIS.get(iso2) ??
    String.fromCharCode(55356, 56741 + iso2.charCodeAt(0), 55356, 56741 + iso2.charCodeAt(1));
}

export function emojiFromCodePoints(codePoints: string) {
  return codePoints.split('-').reduce((prev, curr) => prev + String.fromCodePoint(parseInt(curr, 16)), '');
}
