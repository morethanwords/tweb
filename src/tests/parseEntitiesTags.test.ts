import {describe, expect, test} from 'vitest';
import parseEntities from '@lib/richTextProcessor/parseEntities';

describe('parseEntities tags', () => {
  test('keeps a chat-specific hashtag in one entity', () => {
    const text = '#test@username';

    expect(parseEntities(text)).toEqual([{
      _: 'messageEntityHashtag',
      offset: 0,
      length: text.length
    }]);
  });

  test('keeps a chat-specific cashtag in one entity', () => {
    const text = '$TON@public_channel';

    expect(parseEntities(text)).toEqual([{
      _: 'messageEntityCashtag',
      offset: 0,
      length: text.length
    }]);
  });

  test('keeps an adjacent mention separate when it is not part of the tag', () => {
    expect(parseEntities('#test @username')).toEqual([{
      _: 'messageEntityHashtag',
      offset: 0,
      length: 5
    }, {
      _: 'messageEntityMention',
      offset: 6,
      length: 9
    }]);
  });

  test('only recognizes uppercase cashtags', () => {
    expect(parseEntities('$ton@username')).toEqual([]);
  });
});
