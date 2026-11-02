import parseMarkdown from '@lib/richTextProcessor/parseMarkdown';
import {MessageEntity} from '@layer';

// A message goes without the whitespace on its sides (parseMarkdown, on every send). The formatting the composer
// gives keeps the part of the text still there - formatting that was over nothing but that whitespace goes with it.
// It moved instead: off a leading space onto the letter after it, and a trailing one ended at the text's end with
// no length or less than none, which the server refuses the message for.

const bold = (offset: number, length: number): MessageEntity => ({_: 'messageEntityBold', offset, length});
const italic = (offset: number, length: number): MessageEntity => ({_: 'messageEntityItalic', offset, length});

const formatted = (text: string, entities: MessageEntity[]) => {
  const [newText, newEntities] = parseMarkdown(text, entities);
  return {text: newText, parts: newEntities.map((entity) => [entity._, newText.slice(entity.offset, entity.offset + entity.length), entity.length])};
};

describe('the whitespace a message goes without', () => {
  test('takes formatting over nothing but it along', () => {
    expect(formatted('hello  ', [bold(6, 1)])).toEqual({text: 'hello', parts: []});
    expect(formatted('hello ', [bold(5, 1)])).toEqual({text: 'hello', parts: []});
    expect(formatted('hello\n\n', [bold(5, 2)])).toEqual({text: 'hello', parts: []});
    expect(formatted('  hello', [italic(0, 1)])).toEqual({text: 'hello', parts: []});
  });

  test('takes its part off formatting that goes on into the text', () => {
    expect(formatted(' hello', [italic(0, 3)])).toEqual({text: 'hello', parts: [['messageEntityItalic', 'he', 2]]});
    expect(formatted('hello world ', [bold(6, 6)])).toEqual({text: 'hello world', parts: [['messageEntityBold', 'world', 5]]});
    expect(formatted('\n\nhello\n', [bold(0, 8)])).toEqual({text: 'hello', parts: [['messageEntityBold', 'hello', 5]]});
  });

  test('leaves the formatting inside as it is', () => {
    expect(formatted('  say hello  ', [bold(6, 5), italic(2, 3)])).toEqual({
      text: 'say hello',
      parts: [['messageEntityItalic', 'say', 3], ['messageEntityBold', 'hello', 5]]
    });
  });
});
