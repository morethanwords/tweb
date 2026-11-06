import {beforeAll, describe, expect, test} from 'vitest';
import I18n from '@lib/langPack';
import lang from '@/lang';
import {
  formatAiSendStyleLabel,
  getAiSendStyleKey,
  getAiSendStyleOfRequest,
  hasTextToRewrite,
  isSameAiSendStyle,
  keepAiSendStyle,
  readKeptAiSendStyle
} from '@components/chat/aiSendStyles';

const text = {_: 'textWithEntities' as const, text: 'Hello there', entities: [] as any[]};

beforeAll(() => {
  I18n.applyLangPack({_: 'langPackDifference', from_version: 0, version: 0, lang_code: undefined, strings: I18n.formatLocalStrings(lang)} as any);
});

describe('the request the AI editor saves for sending', () => {
  test('keeps what was asked, never the text or what it was asked of', () => {
    expect(getAiSendStyleOfRequest({
      text,
      richMessage: {_: 'inputRichMessage', pFlags: {}, blocks: []} as any,
      toneNameOrId: 'formal',
      emojify: true,
      proofRead: false,
      translateTo: undefined
    }, 'Formal')).toEqual({toneNameOrId: 'formal', emojify: true, toneTitle: 'Formal'});
    expect(getAiSendStyleOfRequest({text, translateTo: 'en', emojify: false})).toEqual({translateTo: 'en'});
    expect(getAiSendStyleOfRequest({text, proofRead: true})).toEqual({proofRead: true});
  });

  test('names a tone only, and a prompt never by a tone it does not use', () => {
    expect(getAiSendStyleOfRequest({text, translateTo: 'en'}, 'Formal')).toEqual({translateTo: 'en'});
    expect(getAiSendStyleOfRequest({text, customPrompt: 'Be brief', toneNameOrId: 'formal'}, 'Formal'))
    .toEqual({customPrompt: 'Be brief', toneNameOrId: 'formal'});
  });

  test('is nothing for a request that changes nothing', () => {
    expect(getAiSendStyleOfRequest({text})).toBeUndefined();
    expect(getAiSendStyleOfRequest(undefined)).toBeUndefined();
  });

  test('compares by what is asked, whatever it is called', () => {
    expect(isSameAiSendStyle({toneNameOrId: 'formal', toneTitle: 'Formal'}, {toneNameOrId: 'formal'})).toBe(true);
    expect(isSameAiSendStyle({translateTo: 'en', emojify: false}, {translateTo: 'en'})).toBe(true);
    expect(isSameAiSendStyle({translateTo: 'en'}, {translateTo: 'en', emojify: true})).toBe(false);
    expect(isSameAiSendStyle({proofRead: true}, undefined)).toBe(false);
    expect(isSameAiSendStyle(undefined, undefined)).toBe(true);
  });

  test('is kept by account and chat, and by topic in a forum', () => {
    expect(getAiSendStyleKey(1 as PeerId, 42 as PeerId)).toBe('1:42');
    expect(getAiSendStyleKey(2 as PeerId, 42 as PeerId)).toBe('2:42');
    expect(getAiSendStyleKey(1 as PeerId, -1001 as PeerId, 7)).toBe('1:-1001_7');
    expect(getAiSendStyleKey(1 as PeerId, -1001 as PeerId, 0)).toBe('1:-1001');
  });
});

describe('what the AI editor rewrites on sending', () => {
  test.each([
    'Привет, как дела?',
    'see https://telegram.org first',
    '@durov hi',
    '@gif cats',
    '@durov,привет',
    '#tweb、こんにちは',
    'see:https://telegram.org',
    'use /start to begin',
    'مرحبا، كيف حالك؟',
    'ok 👍'
  ])('rewrites a message with words: %s', (message) => {
    expect(hasTextToRewrite(message)).toBe(true);
  });

  test.each([
    '',
    '   ',
    '/start',
    '/remind купить хлеб',
    '/help@SomeBot',
    '/open:https://telegram.org please',
    '👍👍',
    '123 456',
    'https://telegram.org',
    'www.telegram.org',
    'telegram.org',
    't.me/durov',
    'mail@telegram.org',
    '@durov',
    '@gif',
    '#tweb $TON',
    '#日本語',
    '#日本語,#中文',
    '@durov,@telegram',
    '#cafe\u0301ine',
    '#سلام\u200cدنیا',
    'https://telegram.org/' + 'a'.repeat(300),
    '(https://telegram.org/' + 'a'.repeat(300) + ')',
    'example.com/#getting-started',
    'user@www.example.com',
    '(tg://resolve?domain=durov)',
    '(https://localhost/path)',
    '«www.telegram.org»'
  ])('sends as it is a message with nothing to rewrite: %s', (message) => {
    expect(hasTextToRewrite(message)).toBe(false);
  });
});

test('reads a long message once over, whatever it is made of', () => {
  for(const message of [
    'a-'.repeat(32768),
    '@'.repeat(65536),
    'x'.repeat(65536),
    '#a,'.repeat(21845),
    'a.co '.repeat(16384),
    '(a'.repeat(32768)
  ]) {
    const started = performance.now();
    hasTextToRewrite(message);
    // * a pass over 64 KiB takes milliseconds; one that rescans it from every character takes seconds
    expect(performance.now() - started).toBeLessThan(1000);
  }
});

describe('the name of a saved request', () => {
  test.each([
    [{toneNameOrId: 'formal', toneTitle: 'Formal'}, 'Formal style'],
    [{toneNameOrId: 'formal', toneTitle: 'Formal', emojify: true}, 'Formal style with emoji'],
    [{customPrompt: 'Be brief'}, 'Custom prompt'],
    [{translateTo: 'en'}, 'Translation to English'],
    [{proofRead: true}, 'Spelling fix'],
    [{emojify: true}, 'Emoji']
  ])('%j is called %s', (style, label) => {
    expect(formatAiSendStyleLabel(style)).toBe(label);
  });
});

test('a kept style is a string that replaces the one before whole, and what is not one reads as none', () => {
  const kept = keepAiSendStyle({translateTo: 'de', emojify: true});
  expect(typeof(kept)).toBe('string');
  expect(readKeptAiSendStyle(kept)).toEqual({translateTo: 'de', emojify: true});
  expect(keepAiSendStyle(undefined)).toBeUndefined();
  expect(readKeptAiSendStyle(undefined)).toBeUndefined();
  expect(readKeptAiSendStyle('{')).toBeUndefined();
  expect(readKeptAiSendStyle({proofRead: true} as any)).toBeUndefined();
});
