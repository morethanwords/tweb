import {describe, expect, test} from 'vitest';
import parseChatSpecificTag from '@lib/richTextProcessor/parseChatSpecificTag';

describe('parseChatSpecificTag', () => {
  test('keeps a regular tag unchanged', () => {
    expect(parseChatSpecificTag('tag')).toEqual({query: '#tag'});
    expect(parseChatSpecificTag('$TON')).toEqual({query: '$TON'});
  });

  test('separates the target chat username', () => {
    expect(parseChatSpecificTag('tag@public_channel')).toEqual({
      query: '#tag',
      username: 'public_channel'
    });
    expect(parseChatSpecificTag('$TON@public_channel')).toEqual({
      query: '$TON',
      username: 'public_channel'
    });
  });

  test('supports unicode tags', () => {
    expect(parseChatSpecificTag('телеграм@тест')).toEqual({query: '#телеграм@тест'});
    expect(parseChatSpecificTag('телеграм@telegram')).toEqual({
      query: '#телеграм',
      username: 'telegram'
    });
  });

  test('does not treat an invalid username suffix as a chat target', () => {
    expect(parseChatSpecificTag('tag@invalid_')).toEqual({query: '#tag@invalid_'});
    expect(parseChatSpecificTag('$TON@valid@extra')).toEqual({query: '$TON@valid@extra'});
  });
});
