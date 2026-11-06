import type {MessageEntity} from '@layer';
import fixEmoji from '@lib/richTextProcessor/fixEmoji';

// The rule: ❤, ♀ and ♂ without U+FE0F get one, and it belongs to the emoji before it — an entity
// holding the emoji holds it too, one starting after the emoji starts after it.
function fix(text: string, ...entities: [MessageEntity['_'], number, number][]) {
  const objects = entities.map(([_, offset, length]) => ({_, offset, length}) as MessageEntity);
  const fixed = fixEmoji(text, objects);
  return {text: fixed, covered: objects.map(({offset, length}) => fixed.slice(offset, offset + length))};
}

describe('fixEmoji', () => {
  test('a heart inside, at the end of, before and after an entity', () => {
    expect(fix('I❤you', ['messageEntityBold', 0, 5]).covered).toEqual(['I❤️you']);
    expect(fix('a❤', ['messageEntityBold', 0, 2]).covered).toEqual(['a❤️']);
    expect(fix('❤ab', ['messageEntityItalic', 1, 2]).covered).toEqual(['ab']);
    expect(fix('ab❤', ['messageEntityItalic', 0, 2]).covered).toEqual(['ab']);
  });

  test('hearts in a row each keep their own', () => {
    const {text, covered} = fix('a❤❤b♂',
      ['messageEntityBold', 0, 2],
      ['messageEntityItalic', 2, 1],
      ['messageEntityUnderline', 3, 1],
      ['messageEntitySpoiler', 0, 5]
    );
    expect(text).toBe('a❤️❤️b♂️');
    expect(covered).toEqual(['a❤️', '❤️', 'b', 'a❤️❤️b♂️']);
  });

  test('leaves an emoji that has its selector, and the text without entities', () => {
    expect(fix('❤️!', ['messageEntityBold', 0, 3]).covered).toEqual(['❤️!']);
    expect(fixEmoji('♀ and ♂')).toBe('♀️ and ♂️');
  });

  test('fixes thousands of hearts among thousands of entities at once', () => {
    // A message's paragraph: every heart moved every entity after it, one by one — seconds of the worker's time.
    const hearts = 32768, entities = 12000;
    const text = '❤'.repeat(hearts) + 'x'.repeat(entities);
    const objects = Array.from({length: entities}, (_, i) => ({_: 'messageEntityBold', offset: hearts + i, length: 1}) as MessageEntity);
    const startedAt = performance.now();
    const fixed = fixEmoji(text, objects);
    expect(performance.now() - startedAt).toBeLessThan(1000);
    expect(objects.every(({offset, length}) => fixed.slice(offset, offset + length) === 'x')).toBe(true);
  });
});
