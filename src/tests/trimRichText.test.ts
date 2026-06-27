import {describe, expect, test} from 'vitest';
import trimRichText from '@lib/richTextProcessor/trimRichText';
import {MessageEntity} from '@layer';

// Every entity returned by trimRichText must reference a valid range inside the
// trimmed string: 0 <= offset, offset + length <= text.length, length >= 0.
function assertEntitiesInBounds(text: string, entities: MessageEntity[]) {
  for(const entity of entities) {
    expect(entity.offset, `offset >= 0 for ${entity._}`).toBeGreaterThanOrEqual(0);
    expect(entity.length, `length >= 0 for ${entity._}`).toBeGreaterThanOrEqual(0);
    expect(entity.offset + entity.length, `offset+length <= text.length for ${entity._}`).toBeLessThanOrEqual(text.length);
  }
}

describe('trimRichText', () => {
  test('entity fully inside trailing whitespace does not produce a negative length', () => {
    const {text, entities} = trimRichText('hi   ', [{_: 'messageEntityBold', offset: 3, length: 2}]);
    expect(text).toEqual('hi');
    assertEntitiesInBounds(text, entities);
    // the entity no longer references any real text -> it must be dropped
    expect(entities).toHaveLength(0);
  });

  test('entity spanning the trailing boundary shrinks to the trimmed text', () => {
    // 'word ' -> 'word'; bold covers the 'd' + the trailing space
    const {text, entities} = trimRichText('word ', [{_: 'messageEntityBold', offset: 3, length: 2}]);
    expect(text).toEqual('word');
    assertEntitiesInBounds(text, entities);
    const bold = entities.find((e) => e._ === 'messageEntityBold');
    expect(bold).toBeTruthy();
    expect(bold.offset).toEqual(3);
    expect(bold.length).toEqual(1); // only the 'd' survives
  });

  test('entity fully in range is left unchanged', () => {
    const {text, entities} = trimRichText('hello world', [{_: 'messageEntityBold', offset: 0, length: 5}]);
    expect(text).toEqual('hello world');
    assertEntitiesInBounds(text, entities);
    expect(entities[0]).toMatchObject({offset: 0, length: 5});
  });

  test('leading whitespace shifts entity offset and keeps it valid', () => {
    // '  hi' -> 'hi'; bold covers 'hi' at offset 2
    const {text, entities} = trimRichText('  hi', [{_: 'messageEntityBold', offset: 2, length: 2}]);
    expect(text).toEqual('hi');
    assertEntitiesInBounds(text, entities);
    expect(entities[0]).toMatchObject({offset: 0, length: 2});
  });

  test('entity fully inside leading whitespace stays in bounds', () => {
    // '   hi' -> 'hi'; bold covers part of the leading spaces only
    const {text, entities} = trimRichText('   hi', [{_: 'messageEntityBold', offset: 0, length: 2}]);
    expect(text).toEqual('hi');
    assertEntitiesInBounds(text, entities);
  });

  test('both ends trimmed with an entity surviving in the middle', () => {
    // '  abc  ' -> 'abc'; bold covers 'abc'
    const {text, entities} = trimRichText('  abc  ', [{_: 'messageEntityBold', offset: 2, length: 3}]);
    expect(text).toEqual('abc');
    assertEntitiesInBounds(text, entities);
    expect(entities[0]).toMatchObject({offset: 0, length: 3});
  });
});
