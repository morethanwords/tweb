import type {JSONContent} from '@tiptap/core';
import type {Document, PageBlock, Photo, RichMessage, RichText} from '@layer';
import {
  richMessageToTiptap,
  tiptapToRichMessage
} from '@components/chat/inputEditor/richMessage';
import {MESSAGES_ALBUM_MAX_SIZE} from '@appManagers/constants';

function findBlock<T extends PageBlock['_']>(blocks: PageBlock[], type: T) {
  return blocks.find((block): block is Extract<PageBlock, {_?: T}> => block._ === type);
}

function outputMessage(blocks: PageBlock[]): RichMessage.richMessage {
  return {
    _: 'richMessage',
    pFlags: {},
    blocks,
    photos: [],
    documents: []
  };
}

describe('Tiptap rich-message conversion', () => {
  test('converts supported inline marks and atoms without flattening them to MessageEntity', () => {
    const document: JSONContent = {
      type: 'doc',
      content: [{
        type: 'paragraph',
        content: [
          {type: 'text', text: 'مرحبا BI', marks: [{type: 'bold'}, {type: 'italic'}]},
          {type: 'text', text: ' U', marks: [{type: 'underline'}]},
          {type: 'text', text: ' S', marks: [{type: 'strike'}]},
          {type: 'text', text: ' C', marks: [{type: 'code'}]},
          {type: 'text', text: ' X', marks: [{type: 'spoiler'}]},
          {type: 'text', text: ' L', marks: [{type: 'link', attrs: {href: 'https://example.com'}}]},
          {type: 'text', text: ' M', marks: [{type: 'mentionName', attrs: {userId: '42'}}]},
          {
            type: 'text',
            text: ' D',
            marks: [{
              type: 'formattedDate',
              attrs: {date: 1784635200, pFlags: {long_date: true, day_of_week: true}}
            }]
          },
          {type: 'text', text: ' 2', marks: [{type: 'subscript'}]},
          {type: 'text', text: ' 3', marks: [{type: 'superscript'}]},
          {type: 'inlineMath', attrs: {source: 'x^2'}},
          {type: 'customEmoji', attrs: {documentId: '777', emoji: '🥳'}}
        ]
      }]
    };

    const converted = tiptapToRichMessage(document, {noAutolink: true, rtl: true});
    expect(converted.input.blocks).toBe(converted.output.blocks);
    expect(converted.input.pFlags).toEqual({rtl: true, noautolink: true});
    expect(converted.output.pFlags).toEqual({rtl: true});

    const paragraph = findBlock(converted.input.blocks, 'pageBlockParagraph');
    expect(paragraph?.text._).toBe('textConcat');
    const serialized = JSON.stringify(paragraph?.text);
    [
      'textBold',
      'textItalic',
      'textUnderline',
      'textStrike',
      'textFixed',
      'textSpoiler',
      'textUrl',
      'textMentionName',
      'textDate',
      'textSubscript',
      'textSuperscript',
      'textMath',
      'textCustomEmoji'
    ].forEach((type) => expect(serialized).toContain(`"_":"${type}"`));

    const restored = richMessageToTiptap(converted.output);
    const restoredInline = restored.content?.[0].content || [];
    expect(restoredInline.find((node) => node.type === 'inlineMath')?.attrs).toEqual({source: 'x^2'});
    expect(restoredInline.find((node) => node.type === 'customEmoji')?.attrs).toMatchObject({
      documentId: '777',
      emoji: '🥳'
    });
    expect(restoredInline.find((node) => node.text === ' M')?.marks).toContainEqual({
      type: 'mentionName',
      attrs: {userId: '42'}
    });
    expect(restoredInline.find((node) => node.text === ' D')?.marks).toContainEqual({
      type: 'formattedDate',
      attrs: {
        date: 1784635200,
        pFlags: {long_date: true, day_of_week: true}
      }
    });
  });

  test('round-trips rich photo and video resources with an editable collage caption', () => {
    const photo = {
      _: 'photo',
      id: '101',
      access_hash: '201',
      file_reference: new Uint8Array([1, 2, 3])
    } as Photo.photo;
    const video = {
      _: 'document',
      id: '102',
      access_hash: '202',
      file_reference: new Uint8Array([4, 5, 6])
    } as Document.document;
    const emptyCaption = {
      _: 'pageCaption' as const,
      text: {_: 'textEmpty' as const},
      credit: {_: 'textEmpty' as const}
    };
    const block: PageBlock.pageBlockCollage = {
      _: 'pageBlockCollage',
      items: [{
        _: 'pageBlockPhoto',
        pFlags: {spoiler: true},
        photo_id: photo.id,
        caption: emptyCaption
      }, {
        _: 'pageBlockVideo',
        pFlags: {},
        video_id: video.id,
        caption: emptyCaption
      }],
      caption: {
        _: 'pageCaption',
        text: {_: 'textBold', text: {_: 'textPlain', text: 'Caption'}},
        credit: {
          _: 'textItalic',
          text: {_: 'textBold', text: {_: 'textPlain', text: 'Photographer'}}
        }
      }
    };
    const message: RichMessage.richMessage = {
      _: 'richMessage',
      pFlags: {},
      blocks: [block],
      photos: [photo],
      documents: [video]
    };

    const document = richMessageToTiptap(message);
    expect(document.content?.[0]).toMatchObject({
      type: 'richMedia',
      attrs: {
        block,
        captionCredit: block.caption.credit,
        photos: [photo],
        documents: [video]
      },
      content: [{
        type: 'text',
        text: 'Caption',
        marks: [{type: 'bold'}]
      }]
    });

    const converted = tiptapToRichMessage(document);
    expect(converted.input.blocks).toEqual([block]);
    expect(converted.input.photos).toEqual([{
      _: 'inputPhoto',
      id: photo.id,
      access_hash: photo.access_hash,
      file_reference: photo.file_reference
    }]);
    expect(converted.input.documents).toEqual([{
      _: 'inputDocument',
      id: video.id,
      access_hash: video.access_hash,
      file_reference: video.file_reference
    }]);
    expect(converted.output.photos).toEqual([photo]);
    expect(converted.output.documents).toEqual([video]);
  });

  test('normalizes oversized incoming and raw editor collages without limiting slideshows', () => {
    const emptyCaption = {
      _: 'pageCaption' as const,
      text: {_: 'textEmpty' as const},
      credit: {_: 'textEmpty' as const}
    };
    const items = Array.from({length: MESSAGES_ALBUM_MAX_SIZE * 2 + 1}, (_, index) => ({
      _: 'pageBlockPhoto' as const,
      pFlags: {},
      photo_id: String(index + 1),
      caption: emptyCaption
    }));
    const caption = {
      ...emptyCaption,
      text: {_: 'textPlain' as const, text: 'Final group'}
    };
    const source = outputMessage([{
      _: 'pageBlockCollage',
      items,
      caption
    }]);

    const document = richMessageToTiptap(source);
    expect(document.content?.map((node) => node.attrs?.block._)).toEqual([
      'pageBlockCollage',
      'pageBlockCollage',
      'pageBlockPhoto'
    ]);
    expect(document.content?.slice(0, 2).map((node) => node.attrs?.block.items.length))
    .toEqual([MESSAGES_ALBUM_MAX_SIZE, MESSAGES_ALBUM_MAX_SIZE]);
    expect(document.content?.slice(0, 2).every((node) => !node.content?.length)).toBe(true);
    expect(document.content?.[2].content).toEqual([{type: 'text', text: 'Final group'}]);

    const roundTrip = tiptapToRichMessage(document).input.blocks;
    expect(roundTrip.map((block) => block._)).toEqual([
      'pageBlockCollage',
      'pageBlockCollage',
      'pageBlockPhoto'
    ]);
    expect((roundTrip[2] as PageBlock.pageBlockPhoto).caption.text).toEqual(caption.text);

    const slideshow = richMessageToTiptap(outputMessage([{
      _: 'pageBlockSlideshow',
      items,
      caption
    }]));
    expect(slideshow.content).toHaveLength(1);
    expect(slideshow.content?.[0].attrs?.block.items).toHaveLength(items.length);
  });

  test('round-trips audio as editable rich media with its document and formatted caption', () => {
    const audio = {
      _: 'document',
      id: '151',
      access_hash: '251',
      file_reference: new Uint8Array([1, 2, 3]),
      mime_type: 'audio/mpeg',
      attributes: [{
        _: 'documentAttributeAudio',
        pFlags: {},
        duration: 42,
        title: 'Track',
        performer: 'Artist'
      }]
    } as Document.document;
    const block: PageBlock.pageBlockAudio = {
      _: 'pageBlockAudio',
      audio_id: audio.id,
      caption: {
        _: 'pageCaption',
        text: {_: 'textBold', text: {_: 'textPlain', text: 'Listen'}},
        credit: {_: 'textItalic', text: {_: 'textPlain', text: 'Artist'}}
      }
    };
    const message: RichMessage.richMessage = {
      _: 'richMessage',
      pFlags: {},
      blocks: [block],
      photos: [],
      documents: [audio]
    };

    const document = richMessageToTiptap(message);
    expect(document.content?.[0]).toMatchObject({
      type: 'richMedia',
      attrs: {
        block,
        captionCredit: block.caption.credit,
        documents: [audio],
        photos: []
      },
      content: [{
        type: 'text',
        text: 'Listen',
        marks: [{type: 'bold'}]
      }]
    });

    const converted = tiptapToRichMessage(document);
    expect(converted.input.blocks).toEqual([block]);
    expect(converted.input.documents).toEqual([{
      _: 'inputDocument',
      id: audio.id,
      access_hash: audio.access_hash,
      file_reference: audio.file_reference
    }]);
    expect(converted.output.blocks).toEqual([block]);
    expect(converted.output.documents).toEqual([audio]);
  });

  test.each([
    ['photo', {
      _: 'pageBlockPhoto',
      pFlags: {},
      photo_id: '301',
      caption: {
        _: 'pageCaption',
        text: {_: 'textPlain', text: 'Photo caption'},
        credit: {
          _: 'textItalic',
          text: {_: 'textBold', text: {_: 'textPlain', text: 'Photo credit'}}
        }
      }
    } satisfies PageBlock.pageBlockPhoto],
    ['video', {
      _: 'pageBlockVideo',
      pFlags: {},
      video_id: '302',
      caption: {
        _: 'pageCaption',
        text: {_: 'textPlain', text: 'Video caption'},
        credit: {
          _: 'textItalic',
          text: {_: 'textBold', text: {_: 'textPlain', text: 'Video credit'}}
        }
      }
    } satisfies PageBlock.pageBlockVideo],
    ['collage', {
      _: 'pageBlockCollage',
      items: [{
        _: 'pageBlockPhoto',
        pFlags: {},
        photo_id: '303',
        caption: {
          _: 'pageCaption',
          text: {_: 'textEmpty'},
          credit: {_: 'textEmpty'}
        }
      }],
      caption: {
        _: 'pageCaption',
        text: {_: 'textPlain', text: 'Collage caption'},
        credit: {
          _: 'textItalic',
          text: {_: 'textBold', text: {_: 'textPlain', text: 'Collage credit'}}
        }
      }
    } satisfies PageBlock.pageBlockCollage],
    ['slideshow', {
      _: 'pageBlockSlideshow',
      items: [{
        _: 'pageBlockVideo',
        pFlags: {},
        video_id: '304',
        caption: {
          _: 'pageCaption',
          text: {_: 'textEmpty'},
          credit: {_: 'textEmpty'}
        }
      }],
      caption: {
        _: 'pageCaption',
        text: {_: 'textPlain', text: 'Slideshow caption'},
        credit: {
          _: 'textItalic',
          text: {_: 'textBold', text: {_: 'textPlain', text: 'Slideshow credit'}}
        }
      }
    } satisfies PageBlock.pageBlockSlideshow]
  ])('preserves formatted %s caption credit in input and output conversion', (_name, block) => {
    const message = outputMessage([block]);
    const document = richMessageToTiptap(message);
    expect(document.content?.[0].attrs?.captionCredit).toEqual(block.caption.credit);

    const converted = tiptapToRichMessage(document);
    const inputBlock = converted.input.blocks[0] as typeof block;
    const outputBlock = converted.output.blocks[0] as typeof block;
    expect(inputBlock.caption.credit).toEqual(block.caption.credit);
    expect(outputBlock.caption.credit).toEqual(block.caption.credit);
  });

  test('derives rtl from the first non-empty structural text instead of stale message flags', () => {
    const rtl = tiptapToRichMessage({
      type: 'doc',
      content: [
        {type: 'paragraph'},
        {type: 'heading', attrs: {level: 2}, content: [{type: 'text', text: 'مرحبا'}]},
        {type: 'paragraph', content: [{type: 'text', text: 'English'}]}
      ]
    });
    expect(rtl.input.pFlags.rtl).toBe(true);
    expect(rtl.output.pFlags.rtl).toBe(true);

    const ltr = tiptapToRichMessage({
      type: 'doc',
      content: [
        {type: 'paragraph', content: [{type: 'text', text: 'English'}]},
        {type: 'paragraph', content: [{type: 'text', text: 'مرحبا'}]}
      ]
    }, {rtl: true});
    expect(ltr.input.pFlags.rtl).toBeUndefined();
    expect(ltr.output.pFlags.rtl).toBeUndefined();
  });

  test('preserves nested lists, tasks, code, table spans, and quotes as PageBlocks', () => {
    const document: JSONContent = {
      type: 'doc',
      content: [
        {
          type: 'bulletList',
          content: [{
            type: 'listItem',
            content: [
              {type: 'paragraph', content: [{type: 'text', text: 'outer'}]},
              {
                type: 'orderedList',
                attrs: {start: 4},
                content: [{
                  type: 'listItem',
                  content: [{type: 'paragraph', content: [{type: 'text', text: 'nested'}]}]
                }]
              }
            ]
          }]
        },
        {
          type: 'taskList',
          content: [
            {
              type: 'taskItem',
              attrs: {checked: true},
              content: [{type: 'paragraph', content: [{type: 'text', text: 'done'}]}]
            },
            {
              type: 'taskItem',
              attrs: {checked: false},
              content: [{type: 'paragraph', content: [{type: 'text', text: 'todo'}]}]
            }
          ]
        },
        {
          type: 'codeBlock',
          attrs: {language: 'typescript'},
          content: [{type: 'text', text: 'const x = 1;\nreturn x;'}]
        },
        {
          type: 'chatTableWrapper',
          content: [
            {
              type: 'chatTableTitle',
              content: [{
                type: 'text',
                text: 'Status',
                marks: [{type: 'bold'}]
              }]
            },
            {
              type: 'table',
              attrs: {bordered: true, striped: true},
              content: [
                {
                  type: 'tableRow',
                  content: [
                    {
                      type: 'tableHeader',
                      attrs: {colspan: 2, rowspan: 1},
                      content: [{type: 'paragraph', content: [{type: 'text', text: 'Build'}]}]
                    }
                  ]
                },
                {
                  type: 'tableRow',
                  content: [
                    {
                      type: 'tableCell',
                      attrs: {colspan: 1, rowspan: 2},
                      content: [{type: 'paragraph', content: [{type: 'text', text: 'Ready'}]}]
                    },
                    {
                      type: 'tableCell',
                      attrs: {colspan: 1, rowspan: 1},
                      content: [{type: 'paragraph', content: [{type: 'text', text: 'Now'}]}]
                    }
                  ]
                }
              ]
            }
          ]
        },
        {
          type: 'blockquote',
          attrs: {collapsed: false},
          content: [{type: 'paragraph', content: [{type: 'text', text: 'visible'}]}]
        },
        {
          type: 'blockquote',
          attrs: {collapsed: true},
          content: [{type: 'paragraph', content: [{type: 'text', text: 'hidden'}]}]
        }
      ]
    };

    const {output} = tiptapToRichMessage(document);
    expect(output.blocks.map((block) => block._)).toEqual([
      'pageBlockList',
      'pageBlockList',
      'pageBlockPreformatted',
      'pageBlockTable',
      'pageBlockBlockquote',
      'pageBlockBlockquote'
    ]);

    const nestedList = output.blocks[0] as PageBlock.pageBlockList;
    expect(nestedList.items[0]._).toBe('pageListItemBlocks');
    expect((nestedList.items[0] as Extract<typeof nestedList.items[number], {_?: 'pageListItemBlocks'}>)
    .blocks[1]).toMatchObject({_: 'pageBlockOrderedList', start: 4});

    const tasks = output.blocks[1] as PageBlock.pageBlockList;
    expect(tasks.items.map((item) => item.pFlags)).toEqual([
      {checkbox: true, checked: true},
      {checkbox: true, checked: undefined}
    ]);

    expect(output.blocks[2]).toMatchObject({
      _: 'pageBlockPreformatted',
      language: 'typescript',
      text: {_: 'textPlain', text: 'const x = 1;\nreturn x;'}
    });
    const table = output.blocks[3] as PageBlock.pageBlockTable;
    expect(table.pFlags).toEqual({bordered: true, striped: true});
    expect(table.title).toEqual({
      _: 'textBold',
      text: {_: 'textPlain', text: 'Status'}
    });
    expect(table.rows[0].cells[0]).toMatchObject({
      pFlags: {header: true},
      colspan: 2
    });
    expect(table.rows[1].cells[0].rowspan).toBe(2);
    expect((output.blocks[5] as PageBlock.pageBlockBlockquote).text).toEqual({
      _: 'textPlain',
      text: 'hidden'
    });
    // layer 229: the quote says it is collapsed itself
    expect((output.blocks[4] as PageBlock.pageBlockBlockquote).pFlags.collapsed).toBeUndefined();
    expect((output.blocks[5] as PageBlock.pageBlockBlockquote).pFlags.collapsed).toBe(true);

    const restored = richMessageToTiptap(output);
    expect(restored.content?.map((node) => node.type)).toEqual([
      'bulletList',
      'taskList',
      'codeBlock',
      'chatTableWrapper',
      'blockquote',
      'blockquote'
    ]);
    expect(restored.content?.[1].content?.map((node) => node.type)).toEqual(['taskItem', 'taskItem']);
    expect(restored.content?.[1].content?.map((node) => node.attrs?.checked)).toEqual([true, false]);
    expect(restored.content?.[2].attrs?.language).toBe('typescript');
    expect(restored.content?.[3].content?.[0]).toMatchObject({
      type: 'chatTableTitle',
      content: [{
        type: 'text',
        text: 'Status',
        marks: [{type: 'bold'}]
      }]
    });
    expect(restored.content?.[3].content?.[1].content?.[0].content?.[0].attrs)
    .toMatchObject({colspan: 2, rowspan: 1});
    expect(restored.content?.[4].attrs?.collapsed).toBe(false);
    expect(restored.content?.[5].attrs?.collapsed).toBe(true);
  });

  test('splits partial inline quotes into real rich-message blocks', () => {
    const document: JSONContent = {
      type: 'doc',
      content: [{
        type: 'paragraph',
        content: [
          {type: 'text', text: 'before '},
          {
            type: 'text',
            text: 'quoted',
            marks: [{type: 'inlineQuote'}, {type: 'bold'}]
          },
          {type: 'text', text: ' middle '},
          {
            type: 'text',
            text: 'collapsed',
            marks: [{type: 'inlineQuote', attrs: {collapsed: true}}]
          },
          {type: 'text', text: ' after'}
        ]
      }]
    };

    const {output} = tiptapToRichMessage(document);
    expect(output.blocks.map((block) => block._)).toEqual([
      'pageBlockParagraph',
      'pageBlockBlockquote',
      'pageBlockParagraph',
      'pageBlockBlockquote',
      'pageBlockParagraph'
    ]);
    expect((output.blocks[1] as PageBlock.pageBlockBlockquote).text).toEqual({
      _: 'textBold',
      text: {_: 'textPlain', text: 'quoted'}
    });
    expect((output.blocks[3] as PageBlock.pageBlockBlockquote).text).toEqual({
      _: 'textPlain',
      text: 'collapsed'
    });
    expect((output.blocks[1] as PageBlock.pageBlockBlockquote).pFlags.collapsed).toBeUndefined();
    expect((output.blocks[3] as PageBlock.pageBlockBlockquote).pFlags.collapsed).toBe(true);

    const restored = richMessageToTiptap(output);
    expect(restored.content?.map((node) => node.type)).toEqual([
      'paragraph',
      'blockquote',
      'paragraph',
      'blockquote',
      'paragraph'
    ]);
    expect(restored.content?.[1].attrs?.collapsed).toBe(false);
    expect(restored.content?.[3].attrs?.collapsed).toBe(true);
  });

  test('keeps heading levels and block math structurally distinct', () => {
    const blocks: PageBlock[] = [
      {_: 'pageBlockHeading1', text: {_: 'textPlain', text: 'H1'}},
      {_: 'pageBlockHeading2', text: {_: 'textPlain', text: 'H2'}},
      {_: 'pageBlockHeading3', text: {_: 'textPlain', text: 'H3'}},
      {_: 'pageBlockHeading4', text: {_: 'textPlain', text: 'H4'}},
      {_: 'pageBlockHeading5', text: {_: 'textPlain', text: 'H5'}},
      {_: 'pageBlockHeading6', text: {_: 'textPlain', text: 'H6'}},
      {_: 'pageBlockMath', source: '\\int_0^1 x^2 dx'}
    ];

    const restored = richMessageToTiptap(outputMessage(blocks));
    expect(restored.content?.map((node) => node.type)).toEqual([
      'heading',
      'heading',
      'heading',
      'heading',
      'heading',
      'heading',
      'blockMath'
    ]);
    expect(restored.content?.slice(0, 6).map((node) => node.attrs?.level)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(restored.content?.[6].attrs).toEqual({source: '\\int_0^1 x^2 dx'});

    const roundTrip = tiptapToRichMessage(restored).output;
    expect(roundTrip.blocks.map((block) => block._)).toEqual(blocks.map((block) => block._));
    expect(roundTrip.blocks[6]).toEqual(blocks[6]);
  });

  test('round-trips pullquotes and generic open and closed details without flattening', () => {
    const blocks: PageBlock[] = [
      {
        _: 'pageBlockPullquote',
        text: {
          _: 'textBold',
          text: {_: 'textPlain', text: 'A highlighted thought'}
        },
        caption: {
          _: 'textConcat',
          texts: [
            {_: 'textPlain', text: '— '},
            {
              _: 'textItalic',
              text: {_: 'textPlain', text: 'Ada'}
            }
          ]
        }
      },
      {
        _: 'pageBlockDetails',
        pFlags: {open: true},
        title: {
          _: 'textBold',
          text: {_: 'textPlain', text: 'Open details'}
        },
        blocks: [
          {
            _: 'pageBlockHeading2',
            text: {
              _: 'textItalic',
              text: {_: 'textPlain', text: 'Nested heading'}
            }
          },
          {
            _: 'pageBlockDetails',
            pFlags: {},
            title: {
              _: 'textItalic',
              text: {_: 'textPlain', text: 'Nested closed details'}
            },
            blocks: [{
              _: 'pageBlockParagraph',
              text: {
                _: 'textStrike',
                text: {_: 'textPlain', text: 'Nested body'}
              }
            }]
          }
        ]
      },
      {
        _: 'pageBlockDetails',
        pFlags: {},
        title: {_: 'textPlain', text: 'Closed details'},
        blocks: [{
          _: 'pageBlockHeading6',
          text: {
            _: 'textBold',
            text: {_: 'textPlain', text: 'Small nested heading'}
          }
        }]
      }
    ];

    const restored = richMessageToTiptap(outputMessage(blocks));
    expect(restored.content?.map((node) => node.type)).toEqual(['pullquote', 'details', 'details']);
    expect(restored.content?.[0].content?.map((node) => node.type)).toEqual([
      'pullquoteText',
      'pullquoteCaption'
    ]);
    expect(restored.content?.[1].attrs?.open).toBe(true);
    expect(restored.content?.[1].content?.map((node) => node.type)).toEqual([
      'detailsSummary',
      'detailsBody'
    ]);
    expect(restored.content?.[1].content?.[1].content?.map((node) => node.type)).toEqual([
      'heading',
      'details'
    ]);
    expect(restored.content?.[2].attrs?.open).toBe(false);

    const roundTrip = tiptapToRichMessage(restored).output;
    expect(JSON.parse(JSON.stringify(roundTrip.blocks))).toEqual(blocks);
  });

  test('keeps closed empty-title details as real details', () => {
    const details: PageBlock.pageBlockDetails = {
      _: 'pageBlockDetails',
      pFlags: {},
      title: {_: 'textEmpty'},
      blocks: [{
        _: 'pageBlockBlockquote',
        pFlags: {},
        text: {
          _: 'textBold',
          text: {_: 'textPlain', text: 'Hidden quote'}
        },
        caption: {_: 'textEmpty'}
      }]
    };

    const restored = richMessageToTiptap(outputMessage([details]));
    expect(restored.content?.[0]).toMatchObject({
      type: 'details',
      attrs: {open: false},
      content: [
        {type: 'detailsSummary'},
        {
          type: 'detailsBody',
          content: [{type: 'blockquote'}]
        }
      ]
    });

    const roundTrip = tiptapToRichMessage(restored).output;
    expect(JSON.parse(JSON.stringify(roundTrip.blocks))).toEqual([details]);
  });

  test('preserves table alignment and ordered and mixed checkbox list metadata', () => {
    const markedTitle: RichText = {
      _: 'textBold',
      text: {_: 'textPlain', text: 'Metrics'}
    };
    const blocks: PageBlock[] = [
      {
        _: 'pageBlockTable',
        pFlags: {striped: true},
        title: markedTitle,
        rows: [{
          _: 'pageTableRow',
          cells: [
            {
              _: 'pageTableCell',
              pFlags: {header: true, align_right: true, valign_bottom: true},
              text: {_: 'textPlain', text: 'Revenue'},
              colspan: 2,
              rowspan: 3
            },
            {
              _: 'pageTableCell',
              pFlags: {align_center: true, valign_middle: true},
              text: {_: 'textPlain', text: 'Growth'}
            }
          ]
        }]
      },
      {
        _: 'pageBlockOrderedList',
        pFlags: {reversed: true},
        start: 7,
        type: 'A',
        items: [
          {
            _: 'pageListOrderedItemText',
            pFlags: {checkbox: true, checked: true},
            num: 'VII',
            text: {_: 'textPlain', text: 'seven'},
            value: 7,
            type: 'A'
          },
          {
            _: 'pageListOrderedItemBlocks',
            pFlags: {checkbox: true},
            num: 'VIII',
            blocks: [{_: 'pageBlockParagraph', text: {_: 'textPlain', text: 'eight'}}],
            value: 8,
            type: 'A'
          }
        ]
      },
      {
        _: 'pageBlockList',
        items: [
          {_: 'pageListItemText', pFlags: {}, text: {_: 'textPlain', text: 'plain'}},
          {
            _: 'pageListItemText',
            pFlags: {checkbox: true},
            text: {_: 'textPlain', text: 'unchecked'}
          }
        ]
      }
    ];

    const restored = richMessageToTiptap(outputMessage(blocks));
    const wrapper = restored.content?.[0];
    const title = wrapper?.content?.[0];
    const table = wrapper?.content?.[1];
    expect(wrapper?.type).toBe('chatTableWrapper');
    expect(title).toEqual({
      type: 'chatTableTitle',
      content: [{
        type: 'text',
        text: 'Metrics',
        marks: [{type: 'bold'}]
      }]
    });
    expect(table?.attrs).toEqual({
      bordered: false,
      striped: true,
      compact: false
    });
    expect(table?.content?.[0].content?.map((cell) => cell.attrs)).toEqual([
      {
        colspan: 2,
        rowspan: 3,
        colwidth: null,
        align: 'right',
        verticalAlign: 'bottom'
      },
      {
        colspan: 1,
        rowspan: 1,
        colwidth: null,
        align: 'center',
        verticalAlign: 'middle'
      }
    ]);

    const ordered = restored.content?.[1];
    expect(ordered?.attrs).toEqual({
      start: 7,
      startExplicit: true,
      type: 'A',
      reversed: true
    });
    expect(ordered?.content?.map((item) => item.attrs)).toEqual([
      {checkbox: true, checked: true, value: 7, type: 'A'},
      {checkbox: true, checked: false, value: 8, type: 'A'}
    ]);
    expect(restored.content?.[2]).toMatchObject({
      type: 'bulletList',
      content: [
        {type: 'listItem'},
        {type: 'listItem', attrs: {checkbox: true, checked: false}}
      ]
    });

    const roundTrip = tiptapToRichMessage(restored).output;
    const roundTripTable = roundTrip.blocks[0] as PageBlock.pageBlockTable;
    expect(roundTripTable.pFlags).toEqual({bordered: undefined, striped: true});
    expect(roundTripTable.title).toEqual(markedTitle);
    expect(roundTripTable.rows[0].cells[0]).toMatchObject({
      pFlags: {header: true, align_right: true, valign_bottom: true},
      colspan: 2,
      rowspan: 3
    });
    expect(roundTripTable.rows[0].cells[1].pFlags).toEqual({
      header: undefined,
      align_center: true,
      align_right: undefined,
      valign_middle: true,
      valign_bottom: undefined
    });

    const roundTripOrdered = roundTrip.blocks[1] as PageBlock.pageBlockOrderedList;
    expect(roundTripOrdered).toMatchObject({
      pFlags: {reversed: true},
      start: 7,
      type: 'A'
    });
    expect(roundTripOrdered.items.map((item) => ({
      pFlags: item.pFlags,
      num: item.num,
      value: item.value,
      type: item.type
    }))).toEqual([
      {pFlags: {checkbox: true, checked: true}, num: undefined, value: 7, type: 'A'},
      {pFlags: {checkbox: true, checked: undefined}, num: undefined, value: 8, type: 'A'}
    ]);
    const mixed = roundTrip.blocks[2] as PageBlock.pageBlockList;
    expect(mixed.items.map((item) => item.pFlags)).toEqual([
      {},
      {checkbox: true, checked: undefined}
    ]);
  });

  test('keeps future blocks opaque and uses visible inline fallbacks', () => {
    const futureBlock = {_: 'pageBlockFuture'} as unknown as PageBlock;
    const futureText = {_: 'textFuture'} as unknown as RichText;
    const restored = richMessageToTiptap(outputMessage([
      futureBlock,
      {_: 'pageBlockParagraph', text: futureText}
    ]));

    expect(restored.content?.[0]).toEqual({
      type: 'opaqueRichBlock',
      attrs: {block: futureBlock}
    });
    expect(restored.content?.[1]).toMatchObject({
      type: 'paragraph',
      content: [{type: 'text', text: '[textFuture]'}]
    });
  });

  test('strips output-only rich fields from opaque blocks before re-sending', () => {
    const caption = {
      _: 'pageCaption' as const,
      text: {
        _: 'textAutoUrl' as const,
        text: {_: 'textPlain' as const, text: 'https://example.com'}
      },
      credit: {
        _: 'textDiff' as const,
        text: {_: 'textPlain' as const, text: 'new'},
        old_text: {_: 'textPlain' as const, text: 'old'}
      }
    };
    const blocks: PageBlock[] = [
      {
        _: 'pageBlockPhoto',
        pFlags: {spoiler: true},
        photo_id: 1,
        caption,
        url: 'https://example.com/photo',
        webpage_id: 2
      },
      {
        _: 'pageBlockVideo',
        pFlags: {autoplay: true, loop: true, spoiler: true},
        video_id: 3,
        caption
      },
      {
        _: 'pageBlockMap',
        geo: {_: 'geoPoint', long: 55, lat: 25, access_hash: 0},
        zoom: 10,
        w: 320,
        h: 180,
        caption
      }
    ];

    const roundTrip = tiptapToRichMessage(richMessageToTiptap(outputMessage(blocks))).input.blocks;
    expect(roundTrip[0]).toEqual({
      _: 'pageBlockPhoto',
      pFlags: {spoiler: true},
      photo_id: 1,
      caption: {
        _: 'pageCaption',
        text: {_: 'textPlain', text: 'https://example.com'},
        credit: {_: 'textPlain', text: 'new'}
      }
    });
    expect(roundTrip[1]).toMatchObject({
      _: 'pageBlockVideo',
      pFlags: {spoiler: true}
    });
    expect(roundTrip[2]).toMatchObject({
      _: 'inputPageBlockMap',
      geo: {_: 'inputGeoPoint', long: 55, lat: 25}
    });
  });

  test('preserves empty list-item positions while dropping empty containers', () => {
    const converted = tiptapToRichMessage({
      type: 'doc',
      content: [
        {
          type: 'bulletList',
          content: [{type: 'listItem', content: [{type: 'paragraph'}]}]
        },
        {
          type: 'orderedList',
          content: [{type: 'listItem', content: [{type: 'paragraph'}]}]
        },
        {
          type: 'blockquote',
          content: [{type: 'paragraph'}]
        }
      ]
    }).input.blocks;

    expect(converted).toEqual([
      {
        _: 'pageBlockList',
        items: [{_: 'pageListItemText', pFlags: {}, text: {_: 'textEmpty'}}]
      },
      {
        _: 'pageBlockOrderedList',
        pFlags: {reversed: undefined},
        start: undefined,
        type: undefined,
        items: [{_: 'pageListOrderedItemText', pFlags: {}, text: {_: 'textEmpty'}, value: undefined, type: undefined}]
      }
    ]);
  });

  test('trims blank paragraph edges but preserves blank paragraphs between content', () => {
    const converted = tiptapToRichMessage({
      type: 'doc',
      content: [
        {type: 'paragraph'},
        {type: 'paragraph', content: [{type: 'text', text: 'first'}]},
        {type: 'paragraph'},
        {type: 'paragraph'},
        {type: 'paragraph', content: [{type: 'text', text: 'last'}]},
        {type: 'paragraph'}
      ]
    }).input.blocks;

    expect(converted).toEqual([
      {_: 'pageBlockParagraph', text: {_: 'textPlain', text: 'first'}},
      {_: 'pageBlockParagraph', text: {_: 'textEmpty'}},
      {_: 'pageBlockParagraph', text: {_: 'textEmpty'}},
      {_: 'pageBlockParagraph', text: {_: 'textPlain', text: 'last'}}
    ]);
  });

  test('drops a table that has no cell content', () => {
    const document: JSONContent = {
      type: 'doc',
      content: [{
        type: 'chatTableWrapper',
        content: [
          {type: 'chatTableTitle'},
          {
            type: 'table',
            content: [{
              type: 'tableRow',
              content: [{
                type: 'tableCell',
                content: [{type: 'paragraph'}]
              }]
            }]
          }
        ]
      }]
    };
    const converted = tiptapToRichMessage(document).input.blocks;

    expect(converted).toEqual([]);
    const draft = tiptapToRichMessage(document, {draft: true}).input.blocks;
    expect(draft).toHaveLength(1);
    expect(draft[0]._).toBe('pageBlockTable');
    expect((draft[0] as PageBlock.pageBlockTable).rows[0].cells[0].text).toEqual({
      _: 'textEmpty'
    });

    const titled = tiptapToRichMessage({
      ...document,
      content: [{
        ...document.content![0],
        content: [
          {
            type: 'chatTableTitle',
            content: [{
              type: 'text',
              text: 'Only a title',
              marks: [{type: 'italic'}]
            }]
          },
          document.content![0].content![1]
        ]
      }]
    }).input.blocks;
    expect(titled).toMatchObject([{
      _: 'pageBlockTable',
      title: {
        _: 'textItalic',
        text: {_: 'textPlain', text: 'Only a title'}
      }
    }]);
  });

  test('drops whitespace-only required containers while keeping an internal blank paragraph', () => {
    const converted = tiptapToRichMessage({
      type: 'doc',
      content: [
        {type: 'heading', attrs: {level: 2}, content: [{type: 'text', text: '   '}]},
        {type: 'paragraph', content: [{type: 'text', text: 'first'}]},
        {type: 'paragraph', content: [{type: 'text', text: '   '}]},
        {type: 'paragraph', content: [{type: 'text', text: 'last'}]},
        {type: 'blockMath', attrs: {source: '   '}}
      ]
    }).input.blocks;

    expect(converted).toEqual([
      {_: 'pageBlockParagraph', text: {_: 'textPlain', text: 'first'}},
      {_: 'pageBlockParagraph', text: {_: 'textPlain', text: '   '}},
      {_: 'pageBlockParagraph', text: {_: 'textPlain', text: 'last'}}
    ]);
  });

  test('keeps edge blanks and incomplete containers in draft mode only', () => {
    const document = {
      type: 'doc',
      content: [
        {type: 'paragraph'},
        {type: 'heading', attrs: {level: 2}},
        {
          type: 'details',
          attrs: {open: false},
          content: [
            {type: 'detailsSummary'},
            {type: 'detailsBody', content: [{type: 'paragraph'}]}
          ]
        },
        {type: 'paragraph'}
      ]
    };

    expect(tiptapToRichMessage(document).input.blocks).toEqual([]);
    expect(tiptapToRichMessage(document, {draft: true}).input.blocks).toEqual([
      {_: 'pageBlockParagraph', text: {_: 'textEmpty'}},
      {_: 'pageBlockHeading2', text: {_: 'textEmpty'}},
      {
        _: 'pageBlockDetails',
        pFlags: {open: undefined},
        title: {_: 'textEmpty'},
        blocks: [{_: 'pageBlockParagraph', text: {_: 'textEmpty'}}]
      },
      {_: 'pageBlockParagraph', text: {_: 'textEmpty'}}
    ]);
  });

  test('uses only a current Auto detection for preformatted block serialization', () => {
    const code = 'const answer = 42;';
    const serializeLanguage = (attrs: Record<string, unknown>) => {
      const message = tiptapToRichMessage({
        type: 'doc',
        content: [{
          type: 'codeBlock',
          attrs,
          content: [{type: 'text', text: code}]
        }]
      });
      const block = message.input.blocks[0];
      return block._ === 'pageBlockPreformatted' ? block.language : undefined;
    };

    expect(serializeLanguage({
      detectedLanguage: 'JavaScript',
      detectedLanguageCode: code,
      language: ''
    })).toBe('JavaScript');
    expect(serializeLanguage({
      detectedLanguage: 'JavaScript',
      detectedLanguageCode: 'const old = true;',
      language: ''
    })).toBe('');
    expect(serializeLanguage({
      detectedLanguage: 'JavaScript',
      detectedLanguageCode: code,
      language: 'typescript'
    })).toBe('typescript');
  });
});
