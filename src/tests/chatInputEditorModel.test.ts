import {Editor, JSONContent} from '@tiptap/core';
import '@/tests/mocks/chatInputEditorNodes';
import {CHAT_INPUT_EXTENSIONS, TIPTAP_BASE_EXTENSIONS} from '@components/chat/inputEditor/extensions';
import {telegramTextToTiptap, telegramTextToTiptapInlineContent, tiptapToTelegram} from '@components/chat/inputEditor/model';
import type {MessageEntity} from '@layer';

function collectNodes(node: JSONContent, result: JSONContent[] = []) {
  result.push(node);
  node.content?.forEach((child) => collectNodes(child, result));
  return result;
}

function marksOf(node: JSONContent) {
  return (node.marks || []).map((mark) => mark.type).sort();
}

describe('chat input editor Telegram entity model', () => {
  const editors: Editor[] = [];

  const makeEditor = (text: string, entities: MessageEntity[] = []) => {
    const element = document.createElement('div');
    document.body.append(element);
    const editor = new Editor({
      content: telegramTextToTiptap(text, entities),
      element,
      extensions: [...TIPTAP_BASE_EXTENSIONS, ...CHAT_INPUT_EXTENSIONS],
      injectCSS: false
    });
    editors.push(editor);
    return editor;
  };

  afterEach(() => {
    editors.splice(0).forEach((editor) => editor.destroy());
    document.body.replaceChildren();
  });

  test('round-trips overlapping basic marks, spoilers, and links', () => {
    const text = 'abcdef';
    const source: MessageEntity[] = [
      {_: 'messageEntityBold', offset: 0, length: 6},
      {_: 'messageEntityItalic', offset: 1, length: 4},
      {_: 'messageEntityUnderline', offset: 2, length: 2},
      {_: 'messageEntityStrike', offset: 3, length: 2},
      {_: 'messageEntitySpoiler', offset: 1, length: 3},
      {_: 'messageEntityTextUrl', offset: 2, length: 3, url: 'https://telegram.org'}
    ];
    const editor = makeEditor(text, source);
    const d = collectNodes(editor.getJSON()).find((node) => node.text === 'd');
    const serialized = tiptapToTelegram(editor.state.doc);

    expect(marksOf(d)).toEqual(['bold', 'italic', 'link', 'spoiler', 'strike', 'underline']);
    expect(serialized.text).toBe(text);
    expect(serialized.entities).toHaveLength(source.length);
    source.forEach((entity) => expect(serialized.entities).toContainEqual(entity));
  });

  test('round-trips mention-name and every formatted-date flag', () => {
    const text = 'Alice, next Tuesday';
    const dateOffset = text.indexOf('next Tuesday');
    const dateFlags = {
      relative: true,
      short_time: true,
      long_time: true,
      short_date: true,
      long_date: true,
      day_of_week: true
    } as const;
    const source: MessageEntity[] = [
      {
        _: 'messageEntityMentionName',
        offset: 0,
        length: 5,
        user_id: '777000'
      },
      {
        _: 'messageEntityFormattedDate',
        offset: dateOffset,
        length: 'next Tuesday'.length,
        date: 1784635200,
        pFlags: dateFlags
      }
    ];
    const editor = makeEditor(text, source);
    const nodes = collectNodes(editor.getJSON());
    const mention = nodes.find((node) => node.text === 'Alice');
    const date = nodes.find((node) => node.text === 'next Tuesday');
    const serialized = tiptapToTelegram(editor.state.doc);

    expect(mention?.marks).toEqual([{type: 'mentionName', attrs: {userId: '777000'}}]);
    expect(date?.marks?.[0]).toMatchObject({
      type: 'formattedDate',
      attrs: {
        date: 1784635200,
        pFlags: dateFlags
      }
    });
    expect(serialized).toMatchObject({text, entities: source});
  });

  test('keeps inline code separate from a multiline pre block and its language', () => {
    const inline = 'inline code';
    const pre = 'const x = 1;\nreturn x;';
    const text = `${inline}\n${pre}`;
    const source: MessageEntity[] = [
      {_: 'messageEntityCode', offset: 0, length: inline.length},
      {
        _: 'messageEntityPre',
        offset: inline.length + 1,
        length: pre.length,
        language: 'typescript'
      }
    ];
    const editor = makeEditor(text, source);
    const document = editor.getJSON() as JSONContent;
    const serialized = tiptapToTelegram(editor.state.doc);

    expect(document.content?.map((node) => node.type)).toEqual(['paragraph', 'codeBlock']);
    expect(document.content?.[0].content?.[0]).toMatchObject({
      type: 'text',
      text: inline,
      marks: [{type: 'code'}]
    });
    expect(document.content?.[1]).toMatchObject({
      type: 'codeBlock',
      attrs: {language: 'typescript'},
      content: [{type: 'text', text: pre}]
    });
    expect(serialized).toMatchObject({text, entities: source});
  });

  test('serializes a current Auto detection as the pre language', () => {
    const code = 'const answer = 42;';
    const editor = makeEditor('', []);
    editor.commands.setContent({
      type: 'doc',
      content: [{
        type: 'codeBlock',
        attrs: {
          detectedLanguage: 'JavaScript',
          detectedLanguageCode: code,
          language: ''
        },
        content: [{type: 'text', text: code}]
      }]
    });

    expect(tiptapToTelegram(editor.state.doc).entities).toEqual([{
      _: 'messageEntityPre',
      offset: 0,
      length: code.length,
      language: 'JavaScript'
    }]);
  });

  test('does not duplicate a trailing newline already covered by pre', () => {
    const text = 'code\nnext';
    const source: MessageEntity[] = [{
      _: 'messageEntityPre',
      offset: 0,
      length: 5,
      language: ''
    }];
    const editor = makeEditor(text, source);
    const serialized = tiptapToTelegram(editor.state.doc);

    expect(serialized.text).toBe(text);
    expect(serialized.entities).toEqual(source);
  });

  test.each([
    {
      code: 'code',
      expectedTypes: ['codeBlock', 'paragraph'],
      joinAfter: true,
      joinBefore: false,
      length: 4,
      offset: 0,
      text: 'code tail'
    },
    {
      code: 'code',
      expectedTypes: ['paragraph', 'codeBlock', 'paragraph'],
      joinAfter: true,
      joinBefore: true,
      length: 4,
      offset: 7,
      text: 'before code after'
    },
    {
      code: 'code',
      expectedTypes: ['paragraph', 'codeBlock', 'paragraph'],
      joinAfter: false,
      joinBefore: true,
      length: 4,
      offset: 7,
      text: 'before code\nnext'
    },
    {
      code: 'first\nsecond',
      expectedTypes: ['paragraph', 'codeBlock', 'paragraph'],
      joinAfter: true,
      joinBefore: true,
      length: 12,
      offset: 7,
      text: 'before first\nsecond after'
    }
  ])('keeps a partial-line pre block lossless in "$text"', ({
    code,
    expectedTypes,
    joinAfter,
    joinBefore,
    length,
    offset,
    text
  }) => {
    const source: MessageEntity[] = [{
      _: 'messageEntityPre',
      offset,
      length,
      language: 'typescript'
    }];
    const editor = makeEditor(text, source);
    const document = editor.getJSON();
    const codeBlock = document.content?.find((node) => node.type === 'codeBlock');
    const serialized = tiptapToTelegram(editor.state.doc);

    expect(document.content?.map((node) => node.type)).toEqual(expectedTypes);
    expect(codeBlock).toMatchObject({
      attrs: {joinAfter, joinBefore, language: 'typescript'},
      content: [{type: 'text', text: code}]
    });
    expect(serialized).toMatchObject({text, entities: source});
    for(let textOffset = 0; textOffset <= text.length; ++textOffset) {
      const forward = serialized.positionAtTextOffset(textOffset, 'forward');
      const backward = serialized.positionAtTextOffset(textOffset, 'backward');
      expect(serialized.textOffsetAtPosition(forward, 'forward')).toBe(textOffset);
      expect(serialized.textOffsetAtPosition(backward, 'backward')).toBe(textOffset);
    }
  });

  test('keeps a pre block from a later auto-detected list item lossless', () => {
    const text = '- first\n- before code after';
    const source: MessageEntity[] = [{
      _: 'messageEntityPre',
      offset: text.indexOf('code'),
      length: 4,
      language: 'typescript'
    }];
    const editor = makeEditor(text, source);
    const document = editor.getJSON();
    const serialized = tiptapToTelegram(editor.state.doc);

    expect(document.content?.map((node) => node.type)).toEqual([
      'bulletList',
      'paragraph',
      'codeBlock',
      'paragraph'
    ]);
    expect(serialized).toMatchObject({text, entities: source});
  });

  test('keeps a partial-line pre block nested inside a structural quote lossless', () => {
    const quoted = 'quoted code tail';
    const text = `before\n${quoted}\nafter`;
    const source: MessageEntity[] = [
      {
        _: 'messageEntityBlockquote',
        offset: text.indexOf(quoted),
        length: quoted.length,
        pFlags: {collapsed: undefined}
      },
      {
        _: 'messageEntityPre',
        offset: text.indexOf('code'),
        length: 4,
        language: 'typescript'
      }
    ];
    const editor = makeEditor(text, source);
    const document = editor.getJSON();
    const quote = document.content?.find((node) => node.type === 'blockquote');
    const serialized = tiptapToTelegram(editor.state.doc);

    expect(quote?.content?.map((node) => node.type)).toEqual(['paragraph', 'codeBlock', 'paragraph']);
    expect(serialized).toMatchObject({text, entities: source});
  });

  test('round-trips multiline normal and collapsed blockquotes', () => {
    const normal = 'normal one\nnormal two';
    const collapsed = 'hidden one\nhidden two';
    const text = `before\n${normal}\nafter\n${collapsed}`;
    const normalOffset = text.indexOf(normal);
    const collapsedOffset = text.indexOf(collapsed);
    const source: MessageEntity[] = [
      {
        _: 'messageEntityBlockquote',
        offset: normalOffset,
        length: normal.length,
        pFlags: {}
      },
      {
        _: 'messageEntityBlockquote',
        offset: collapsedOffset,
        length: collapsed.length,
        pFlags: {collapsed: true}
      }
    ];
    const editor = makeEditor(text, source);
    const quotes = editor.getJSON().content?.filter((node) => node.type === 'blockquote') || [];
    const serialized = tiptapToTelegram(editor.state.doc);
    const serializedQuotes = serialized.entities.filter((entity) => entity._ === 'messageEntityBlockquote');

    expect(quotes).toHaveLength(2);
    expect(quotes[0]).toMatchObject({
      attrs: {collapsed: false},
      content: [
        {type: 'paragraph', content: [{type: 'text', text: 'normal one'}]},
        {type: 'paragraph', content: [{type: 'text', text: 'normal two'}]}
      ]
    });
    expect(quotes[1]).toMatchObject({
      attrs: {collapsed: true},
      content: [
        {type: 'paragraph', content: [{type: 'text', text: 'hidden one'}]},
        {type: 'paragraph', content: [{type: 'text', text: 'hidden two'}]}
      ]
    });
    expect(serialized.text).toBe(text);
    expect(serializedQuotes).toHaveLength(2);
    expect(serializedQuotes[0]).toMatchObject({
      offset: normalOffset,
      length: normal.length,
      pFlags: {collapsed: undefined}
    });
    expect(serializedQuotes[1]).toMatchObject({
      offset: collapsedOffset,
      length: collapsed.length,
      pFlags: {collapsed: true}
    });
  });

  test('promotes a partial-line blockquote to a standalone block', () => {
    const text = 'before selected after';
    const offset = text.indexOf('selected');
    const source: MessageEntity[] = [{
      _: 'messageEntityBlockquote',
      offset,
      length: 'selected'.length,
      pFlags: {collapsed: true}
    }];
    const editor = makeEditor(text, source);
    const document = editor.getJSON();
    const serialized = tiptapToTelegram(editor.state.doc);
    const quote = serialized.entities.find((entity) => entity._ === 'messageEntityBlockquote');

    expect(document.content?.map((node) => node.type)).toEqual([
      'paragraph',
      'blockquote',
      'paragraph'
    ]);
    expect(JSON.stringify(document)).not.toContain('inlineQuote');
    expect(serialized.text).toBe('before\nselected\nafter');
    expect(quote).toEqual({
      _: 'messageEntityBlockquote',
      offset: serialized.text.indexOf('selected'),
      length: 'selected'.length,
      pFlags: {collapsed: true}
    });
  });

  test('promotes partial quotes without losing code and formatted dates', () => {
    const text = 'xcode datey';
    const date = 1784635200;
    const source: MessageEntity[] = [
      {_: 'messageEntityBlockquote', offset: 1, length: 4, pFlags: {}},
      {_: 'messageEntityCode', offset: 1, length: 4},
      {_: 'messageEntityBlockquote', offset: 6, length: 4, pFlags: {collapsed: true}},
      {_: 'messageEntityFormattedDate', offset: 6, length: 4, date, pFlags: {relative: true}}
    ];
    const editor = makeEditor(text, source);
    const nodes = collectNodes(editor.getJSON());
    const code = nodes.find((node) => node.text === 'code');
    const formattedDate = nodes.find((node) => node.text === 'date');
    const serialized = tiptapToTelegram(editor.state.doc);

    expect(editor.getJSON().content?.map((node) => node.type)).toEqual([
      'paragraph',
      'blockquote',
      'blockquote',
      'paragraph'
    ]);
    expect(marksOf(code)).toEqual(['code']);
    expect(marksOf(formattedDate)).toEqual(['formattedDate']);
    expect(JSON.stringify(editor.getJSON())).not.toContain('inlineQuote');
    expect(serialized.entities).toHaveLength(source.length);
    expect(serialized.entities.filter((entity) => entity._ === 'messageEntityBlockquote'))
    .toHaveLength(2);
    expect(serialized.entities).toContainEqual({
      _: 'messageEntityCode',
      offset: serialized.text.indexOf('code'),
      length: 4
    });
    expect(serialized.entities).toContainEqual({
      _: 'messageEntityFormattedDate',
      offset: serialized.text.indexOf('date'),
      length: 4,
      date,
      pFlags: {relative: true}
    });
  });

  test('round-trips bullet, ordered, and nested lists with entity offsets after markers', () => {
    const text = [
      'intro',
      '- alpha',
      '- bold',
      '9. nine',
      '10. ten',
      '- parent',
      '  - child',
      '- next',
      'outro'
    ].join('\n');
    const boldOffset = text.indexOf('bold');
    const source: MessageEntity[] = [{
      _: 'messageEntityBold',
      offset: boldOffset,
      length: 'bold'.length
    }];
    const editor = makeEditor(text, source);
    const document = editor.getJSON();
    const serialized = tiptapToTelegram(editor.state.doc);

    expect(document.content?.map((node) => node.type)).toEqual([
      'paragraph',
      'bulletList',
      'orderedList',
      'bulletList',
      'paragraph'
    ]);
    expect(document.content?.[2].attrs).toMatchObject({start: 9});
    expect(collectNodes(document.content?.[3] as JSONContent).filter((node) => node.type === 'bulletList'))
    .toHaveLength(2);
    expect(serialized.text).toBe(text);
    expect(serialized.entities).toEqual(source);
  });

  test('parses unchecked and case-insensitive checked task markers as one task list', () => {
    const text = [
      '- [ ] pending',
      '- [x] done',
      '- [X] also done'
    ].join('\n');
    const boldOffset = text.indexOf('pending');
    const source: MessageEntity[] = [{
      _: 'messageEntityBold',
      offset: boldOffset,
      length: 'pending'.length
    }];
    const editor = makeEditor(text, source);
    const document = editor.getJSON() as JSONContent;
    const list = document.content?.[0];
    const serialized = tiptapToTelegram(editor.state.doc);

    expect(document.content?.map((node) => node.type)).toEqual(['taskList']);
    expect(list?.content?.map((node) => ({
      attrs: node.attrs,
      text: node.content?.[0].content?.[0]?.text,
      type: node.type
    }))).toEqual([
      {attrs: {checked: false}, text: 'pending', type: 'taskItem'},
      {attrs: {checked: true}, text: 'done', type: 'taskItem'},
      {attrs: {checked: true}, text: 'also done', type: 'taskItem'}
    ]);
    expect(serialized.text).toBe(text.replace('[X]', '[x]'));
    expect(serialized.entities).toEqual(source);
  });

  test('keeps ordered checkbox items in one ordered list with item attributes', () => {
    const text = [
      '3. [ ] pending',
      '4. plain',
      '5. [X] done'
    ].join('\n');
    const editor = makeEditor(text);
    const list = (editor.getJSON() as JSONContent).content?.[0];

    expect((editor.getJSON() as JSONContent).content?.map((node) => node.type)).toEqual(['orderedList']);
    expect(list?.attrs).toMatchObject({start: 3});
    expect(list?.content?.map((node) => ({
      checkbox: node.attrs?.checkbox,
      checked: node.attrs?.checked
    }))).toEqual([
      {checkbox: true, checked: false},
      {checkbox: null, checked: null},
      {checkbox: true, checked: true}
    ]);
    expect(tiptapToTelegram(editor.state.doc).text).toBe(text.replace('[X]', '[x]'));
  });

  test('keeps nested task items and separates consecutive marker groups', () => {
    const text = [
      '- [ ] parent',
      '  - [x] child',
      '  - [ ] child two',
      '- [X] next',
      '- bullet',
      '- [ ] final'
    ].join('\n');
    const editor = makeEditor(text);
    const document = editor.getJSON() as JSONContent;

    expect(document.content?.map((node) => node.type)).toEqual([
      'taskList',
      'bulletList',
      'taskList'
    ]);
    expect(collectNodes(document).filter((node) => node.type === 'taskList')).toHaveLength(3);
    expect(document.content?.[0].content?.[0].content?.map((node) => node.type)).toEqual([
      'paragraph',
      'taskList'
    ]);
    expect(tiptapToTelegram(editor.state.doc).text).toBe(text.replace('[X]', '[x]'));
  });

  test('serializes checkbox attributes in mixed bullet and ordered lists', () => {
    const editor = makeEditor('');
    editor.commands.setContent({
      type: 'doc',
      content: [
        {
          type: 'bulletList',
          content: [
            {
              type: 'listItem',
              content: [{type: 'paragraph', content: [{type: 'text', text: 'plain'}]}]
            },
            {
              type: 'listItem',
              attrs: {checkbox: true, checked: false},
              content: [{type: 'paragraph', content: [{type: 'text', text: 'pending'}]}]
            },
            {
              type: 'listItem',
              attrs: {checkbox: true, checked: true},
              content: [{type: 'paragraph', content: [{type: 'text', text: 'done'}]}]
            }
          ]
        },
        {
          type: 'orderedList',
          attrs: {start: 7},
          content: [
            {
              type: 'listItem',
              attrs: {checkbox: true, checked: false},
              content: [{type: 'paragraph', content: [{type: 'text', text: 'seven'}]}]
            },
            {
              type: 'listItem',
              content: [{type: 'paragraph', content: [{type: 'text', text: 'eight'}]}]
            }
          ]
        }
      ]
    });

    expect(tiptapToTelegram(editor.state.doc).text).toBe([
      '- plain',
      '- [ ] pending',
      '- [x] done',
      '7. [ ] seven',
      '8. eight'
    ].join('\n'));
  });

  test('serializes table cells as Telegram-safe rows with exact entity offsets', () => {
    const editor = makeEditor('');
    editor.commands.setContent({
      type: 'doc',
      content: [
        {type: 'paragraph', content: [{type: 'text', text: 'before'}]},
        {
          type: 'chatTableWrapper',
          content: [
            {
              type: 'chatTableTitle'
            },
            {
              type: 'table',
              content: [
                {
                  type: 'tableRow',
                  content: [
                    {
                      type: 'tableHeader',
                      content: [{type: 'paragraph', content: [{type: 'text', text: 'Name'}]}]
                    },
                    {
                      type: 'tableHeader',
                      content: [{
                        type: 'paragraph',
                        content: [{type: 'text', text: 'State', marks: [{type: 'bold'}]}]
                      }]
                    }
                  ]
                },
                {
                  type: 'tableRow',
                  content: [
                    {
                      type: 'tableCell',
                      content: [{type: 'paragraph', content: [{type: 'text', text: 'Build'}]}]
                    },
                    {
                      type: 'tableCell',
                      content: [{
                        type: 'paragraph',
                        content: [{
                          type: 'customEmoji',
                          attrs: {documentId: '123456789', emoji: '🥳'}
                        }]
                      }]
                    }
                  ]
                }
              ]
            }
          ]
        },
        {type: 'paragraph', content: [{type: 'text', text: 'after'}]}
      ]
    });

    const serialized = tiptapToTelegram(editor.state.doc);
    const text = 'before\nName State\nBuild 🥳\nafter';
    const positions = new Map<string, number>();
    editor.state.doc.descendants((node, position) => {
      if(node.isText) positions.set(node.text, position);
      if(node.type.name === 'customEmoji') positions.set('🥳', position);
    });

    expect(serialized.text).toBe(text);
    expect(serialized.entities).toEqual([
      {_: 'messageEntityBold', offset: text.indexOf('State'), length: 5},
      {
        _: 'messageEntityCustomEmoji',
        document_id: '123456789',
        offset: text.indexOf('🥳'),
        length: '🥳'.length
      }
    ]);
    ['Name', 'State', 'Build', '🥳', 'after'].forEach((value) => {
      expect(serialized.textOffsetAtPosition(positions.get(value))).toBe(text.indexOf(value));
    });
  });

  test('keeps non-canonical asterisk and plus lines as plain text', () => {
    const text = '* asterisk\n+ plus';
    const editor = makeEditor(text);

    expect(editor.getJSON().content?.map((node) => node.type)).toEqual(['paragraph', 'paragraph']);
    expect(tiptapToTelegram(editor.state.doc).text).toBe(text);
  });

  test('uses UTF-16 offsets for surrogate pairs and custom emoji atoms', () => {
    const emoji = '😀';
    const customEmoji = '🧑‍💻';
    const text = `A${emoji}B${customEmoji}C`;
    const customOffset = text.indexOf(customEmoji);
    const source: MessageEntity[] = [
      {
        _: 'messageEntityBold',
        offset: customOffset,
        length: customEmoji.length
      },
      {
        _: 'messageEntityCustomEmoji',
        offset: customOffset,
        length: customEmoji.length,
        document_id: '543210987654321'
      }
    ];
    const editor = makeEditor(text, source);
    const customNode = collectNodes(editor.getJSON()).find((node) => node.type === 'customEmoji');
    const serialized = tiptapToTelegram(editor.state.doc);

    expect(emoji.length).toBe(2);
    expect(customEmoji.length).toBe(5);
    expect(customOffset).toBe(4);
    expect(customNode).toMatchObject({
      type: 'customEmoji',
      attrs: {documentId: '543210987654321', emoji: customEmoji},
      marks: [{type: 'bold'}]
    });
    expect(serialized.text).toBe(text);
    expect(serialized.entities).toHaveLength(source.length);
    source.forEach((entity) => expect(serialized.entities).toContainEqual(entity));
  });

  test('preserves leading, consecutive, and trailing blank lines', () => {
    const text = '\nfirst\n\nthird\n';
    const editor = makeEditor(text);
    const document = editor.getJSON();
    const blocks = (document.content || []) as JSONContent[];
    const serialized = tiptapToTelegram(editor.state.doc);

    expect(document.content).toHaveLength(5);
    expect(document.content?.map((node) => node.type)).toEqual([
      'paragraph',
      'paragraph',
      'paragraph',
      'paragraph',
      'paragraph'
    ]);
    expect(blocks.map((node) => node.content?.[0]?.text || '')).toEqual([
      '',
      'first',
      '',
      'third',
      ''
    ]);
    expect(serialized).toMatchObject({text, entities: []});
  });

  test('maps text offsets and ProseMirror positions across UTF-16 text, separators, and atoms', () => {
    const emoji = '😀';
    const customEmoji = '🧑‍💻';
    const text = `${emoji}\n${customEmoji}\nz`;
    const customOffset = text.indexOf(customEmoji);
    const editor = makeEditor(text, [{
      _: 'messageEntityCustomEmoji',
      offset: customOffset,
      length: customEmoji.length,
      document_id: '123'
    }]);
    const serialized = tiptapToTelegram(editor.state.doc);

    for(const offset of [0, 1, 2, 3, customOffset + customEmoji.length, text.length]) {
      const position = serialized.positionAtTextOffset(offset);
      expect(serialized.textOffsetAtPosition(position)).toBe(offset);
    }

    const insideAtom = customOffset + 1;
    const backward = serialized.positionAtTextOffset(insideAtom, 'backward');
    const forward = serialized.positionAtTextOffset(insideAtom, 'forward');
    expect(backward).toBeLessThan(forward);
    expect(serialized.textOffsetAtPosition(backward)).toBe(customOffset);
    expect(serialized.textOffsetAtPosition(forward)).toBe(customOffset + customEmoji.length);
  });

  test('projects block math source into the derived Telegram text value', () => {
    const editor = makeEditor('');
    editor.commands.setContent({
      type: 'doc',
      content: [{type: 'blockMath', attrs: {source: 'x^2 + y^2'}}]
    });

    const serialized = tiptapToTelegram(editor.state.doc);

    expect(serialized.text).toBe('x^2 + y^2');
    expect(serialized.entities).toEqual([]);
  });
});

test('caption parsing preserves literal markers, UTF-16 entity offsets, emoji and empty lines', () => {
  const text = '1. 🔥 link\n\ncode\n';
  const content = telegramTextToTiptapInlineContent(text, [
    {_: 'messageEntityCustomEmoji', offset: 3, length: 2, document_id: '42'},
    {_: 'messageEntityTextUrl', offset: 6, length: 4, url: 'https://example.com'},
    {_: 'messageEntityPre', offset: 12, length: 4, language: 'js'}
  ]);
  expect(content).toMatchObject([
    {type: 'text', text: '1. '},
    {type: 'customEmoji', attrs: {documentId: '42', emoji: '🔥'}},
    {type: 'text', text: ' '},
    {type: 'text', text: 'link', marks: [{type: 'link', attrs: {href: 'https://example.com'}}]},
    {type: 'hardBreak'}, {type: 'hardBreak'},
    {type: 'text', text: 'code', marks: [{type: 'code'}]},
    {type: 'hardBreak'}
  ]);
});
