import {MessageEntity} from '@layer';
import countEmojiOnly from '@lib/richTextProcessor/countEmojiOnly';
import wrapMessageEntities from '@lib/richTextProcessor/wrapMessageEntities';

function count(text: string, entities?: MessageEntity[]) {
  const wrapped = wrapMessageEntities(text, entities);
  return countEmojiOnly(wrapped.message, wrapped.totalEntities);
}

describe('countEmojiOnly', () => {
  test('counts a text of emoji only, whitespace between them', () => {
    expect(count('😔')).toBe(1);
    expect(count('❤\ufe0f')).toBe(1);
    expect(count(' 👍 \n 🔥🔥 ')).toBe(3);
  });

  test('stray U+FE0F after an emoji is no text', () => {
    expect(count('😔\ufe0f')).toBe(1);
    expect(count('😔\ufe0f\ufe0f\ufe0f\ufe0f\ufe0f\ufe0f')).toBe(1);
    expect(count('❤\ufe0f\ufe0f\ufe0f')).toBe(1);
    expect(count('😔\ufe0f 🔥\ufe0f\ufe0f')).toBe(2);
  });

  test('anything else makes it text', () => {
    expect(count('😔 a')).toBe(0);
    expect(count('a\ufe0f')).toBe(0);
    expect(count('\ufe0f')).toBe(0);
    expect(count('')).toBe(0);
    expect(count('😔\u200b')).toBe(0);
  });

  test('a custom emoji counts once, with the emoji it covers', () => {
    expect(count('😔\ufe0f\ufe0f', [{_: 'messageEntityCustomEmoji', offset: 0, length: 2, document_id: '1'}])).toBe(1);
    expect(count('😔x', [{_: 'messageEntityCustomEmoji', offset: 0, length: 2, document_id: '1'}])).toBe(0);
  });
});
