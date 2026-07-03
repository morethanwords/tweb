import parseMarkdown from '@lib/richTextProcessor/parseMarkdown';

const pre = (text: string, entities: ReturnType<typeof parseMarkdown>[1]) =>
  entities.find((e) => e._ === 'messageEntityPre');

describe('parseMarkdown ``` code block language detection', () => {
  test('keeps a leading { when the fence sits on the same line (pretty JSON)', () => {
    const json = '{\n  "hand": "AhKd",\n  "open": 0.99\n}';
    const [text, entities] = parseMarkdown('```' + json + '\n```', [], true);
    const e = pre(text, entities);
    expect(e).toBeTruthy();
    expect(e.language).toBe('');
    expect(text.slice(e.offset, e.offset + e.length)).toBe(json);
  });

  test('keeps a leading { for a merged single-line JSON', () => {
    const json = '{ "hand": "AhKd" }';
    const [text, entities] = parseMarkdown('```' + json + '\n```', [], true);
    const e = pre(text, entities);
    expect(e).toBeTruthy();
    expect(e.language).toBe('');
    expect(text.slice(e.offset, e.offset + e.length)).toBe(json);
  });

  test('proper block with a newline after the fence is unchanged', () => {
    const json = '{\n  "hand": "AhKd"\n}';
    const [text, entities] = parseMarkdown('```\n' + json + '\n```', [], true);
    const e = pre(text, entities);
    expect(e.language).toBe('');
    expect(text.slice(e.offset, e.offset + e.length)).toBe(json);
  });

  test('still detects a real language tag on the fence line', () => {
    const [text, entities] = parseMarkdown('```json\n{"a":1}\n```', [], true);
    const e = pre(text, entities);
    expect(e.language).toBe('json');
    expect(text.slice(e.offset, e.offset + e.length)).toBe('{"a":1}');
  });

  test('detects language tags containing + # - .', () => {
    for(const lang of ['c++', 'c#', 'objective-c', 'f#']) {
      const [text, entities] = parseMarkdown('```' + lang + '\ncode\n```', [], true);
      const e = pre(text, entities);
      expect(e.language).toBe(lang);
      expect(text.slice(e.offset, e.offset + e.length)).toBe('code');
    }
  });

  test('a lone ``` run is emitted verbatim, not duplicated', () => {
    for(const input of ['a ``` b', 'x ``` y', '``` ', 'see ```` here']) {
      const [text] = parseMarkdown(input, [], true);
      expect(text).toBe(input);
    }
  });

  test('keeps entity offsets aligned when the text contains a literal ```', () => {
    const value = 'use ``` and then {x}';
    const entities = [
      {_: 'messageEntityCode', offset: value.indexOf('```'), length: 3},
      {_: 'messageEntityCode', offset: value.indexOf('{x}'), length: 3}
    ] as Parameters<typeof parseMarkdown>[1];
    const [text, out] = parseMarkdown(value, entities, true);
    expect(text).toBe(value);
    for(const e of out) {
      expect(text.slice(e.offset, e.offset + e.length)).toBe(e.offset === value.indexOf('```') ? '```' : '{x}');
    }
  });
});
