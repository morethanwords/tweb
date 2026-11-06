import type {MessageEntity} from '@layer';
import findConflictingEntity, {createEntityConflictCheck} from '@lib/richTextProcessor/findConflictingEntity';
import mergeEntities from '@lib/richTextProcessor/mergeEntities';
import parseEntities from '@lib/richTextProcessor/parseEntities';
import createSeededRandom from '@/tests/helpers/seededRandom';

const entity = (_: MessageEntity['_'], offset: number, length: number) => ({_, offset, length}) as MessageEntity;

describe('mergeEntities', () => {
  test('drops a link found inside code and keeps one found outside it', () => {
    const text = 'see https://a.co and `https://b.co`';
    const code = entity('messageEntityCode', 21, 14);
    const merged = mergeEntities([code], parseEntities(text));
    expect(merged.map(({_, offset, length}) => [_, offset, length])).toEqual([
      ['messageEntityUrl', 4, 12],
      ['messageEntityCode', 21, 14]
    ]);
  });

  test('agrees with findConflictingEntity on every new entity', () => {
    const random = createSeededRandom(0x5EED1E55);
    const TYPES: MessageEntity['_'][] = [
      'messageEntityBold', 'messageEntityItalic', 'messageEntityCode', 'messageEntityPre',
      'messageEntityFormattedDate', 'messageEntityBlockquote', 'messageEntityUrl', 'messageEntityTextUrl',
      'messageEntityEmoji', 'messageEntityLinebreak', 'messageEntityCaret', 'messageEntityMention',
      'messageEntitySpoiler', 'messageEntityCustomEmoji'
    ];
    const randomEntity = () => entity(TYPES[random(TYPES.length)], random(20), random(4) ? random(8) : 0);

    for(let i = 0; i < 2000; ++i) {
      const current = Array.from({length: random(8)}, randomEntity);
      const isConflicting = createEntityConflictCheck(current);
      for(let j = 0; j < 8; ++j) {
        const newEntity = randomEntity();
        expect(isConflicting(newEntity), JSON.stringify({current, newEntity}))
        .toBe(!!findConflictingEntity(current, newEntity));
      }
    }
  });

  test('merges thousands of entities into thousands at once', () => {
    // A paragraph of a message: thousands of bold letters, then line breaks for the text to find. Each
    // break was checked against every bold letter: seconds of the tab's and the worker's time.
    const bold = 4000, breaks = 40000;
    const current = Array.from({length: bold}, (_, i) => entity('messageEntityBold', i, 1));
    const found = Array.from({length: breaks}, (_, i) => entity('messageEntityLinebreak', bold + i, 1));
    const startedAt = performance.now();
    expect(mergeEntities(current, found)).toHaveLength(bold + breaks);
    expect(performance.now() - startedAt).toBeLessThan(1000);
  });
});
