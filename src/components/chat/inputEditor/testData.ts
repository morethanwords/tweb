import type {JSONContent} from '@tiptap/core';
import type {ChatInputRichButton} from '@components/chat/inputEditor/types';
import {BUTTON_ROW_NODE_NAME, RICH_BUTTON_NODE_NAME, richButtonAttributes} from '@components/chat/inputEditor/richButtonModel';

export const CHAT_INPUT_EDITOR_TEST_MEDIA_REQUEST_EVENT =
  'chat-input-editor-test-media-request';
export const CHAT_INPUT_EDITOR_TEST_MEDIA_URL = '/assets/img/camomile.jpg';

export type ChatInputEditorTestMediaRequest = {
  uploadMedia?: () => Promise<boolean>
};

export type ChatInputEditorTestDataOptions = {
  includeLocalMediaPreview?: boolean
};

const text = (value: string, marks?: JSONContent['marks']): JSONContent => ({
  type: 'text',
  text: value,
  marks
});

const paragraph = (value: string): JSONContent => ({
  type: 'paragraph',
  content: value ? [text(value)] : undefined
});

const richButtonAttrs = (button: Omit<ChatInputRichButton, 'text'>, label: string) => (
  richButtonAttributes(button, [text(label)])
);

const listItem = (
  value: string,
  attrs?: Record<string, unknown>
): JSONContent => ({
  type: 'listItem',
  attrs,
  content: [paragraph(value)]
});

const table = (): JSONContent => ({
  type: 'chatTableWrapper',
  content: [
    {type: 'chatTableTitle', content: [text('Table title')]},
    {
      type: 'table',
      content: [
        {
          type: 'tableRow',
          content: ['Header A', 'Header B', 'Header C'].map((value) => ({
            type: 'tableHeader',
            content: [paragraph(value)]
          }))
        },
        ...[
          ['Cell A1', 'Cell B1', 'Cell C1'],
          ['Cell A2', 'Cell B2', 'Cell C2']
        ].map((row) => ({
          type: 'tableRow',
          content: row.map((value) => ({
            type: 'tableCell',
            content: [paragraph(value)]
          }))
        }))
      ]
    }
  ]
});

export const CHAT_INPUT_EDITOR_ARTICLE_NODE_TYPES = [
  'blockquote',
  'blockquoteCaption',
  'blockMath',
  'bulletList',
  'buttonRow',
  'chatTableTitle',
  'chatTableWrapper',
  'codeBlock',
  'customEmoji',
  'details',
  'detailsBody',
  'detailsSummary',
  'hardBreak',
  'heading',
  'inlineMath',
  'inlineRichAnchor',
  'listItem',
  'orderedList',
  'paragraph',
  'pullquote',
  'pullquoteCaption',
  'pullquoteText',
  'richAnchor',
  'richDivider',
  'richFooter',
  'richMap',
  'richButton',
  'richMedia',
  'table',
  'tableCell',
  'tableHeader',
  'tableRow',
  'taskItem',
  'taskList',
  'text'
] as const;

export const CHAT_INPUT_EDITOR_ARTICLE_MARK_TYPES = [
  'bold',
  'code',
  'formattedDate',
  'highlight',
  'italic',
  'link',
  'mentionName',
  'spoiler',
  'strike',
  'subscript',
  'superscript',
  'underline'
] as const;

export function createChatInputEditorTestData({
  includeLocalMediaPreview = true
}: ChatInputEditorTestDataOptions = {}): JSONContent {
  const media: JSONContent[] = includeLocalMediaPreview ? [{
    type: 'richMedia',
    attrs: {
      block: {
        _: 'pageBlockPhoto',
        caption: {
          _: 'pageCaption',
          credit: {_: 'textEmpty'},
          text: {_: 'textEmpty'}
        },
        pFlags: {},
        photo_id: 'chat-input-editor-test-photo'
      },
      captionCredit: {_: 'textEmpty'},
      documents: [],
      photos: [],
      previewUrl: CHAT_INPUT_EDITOR_TEST_MEDIA_URL,
      previewUrls: [CHAT_INPUT_EDITOR_TEST_MEDIA_URL],
      uploadGrouped: false,
      uploadId: 'chat-input-editor-test-media',
      uploadItems: [{
        id: 'chat-input-editor-test-media-0',
        progress: 1,
        state: 'ready',
        type: 'photo'
      }],
      uploadPreviewUrls: [CHAT_INPUT_EDITOR_TEST_MEDIA_URL]
    },
    content: [text('Media caption')]
  }] : [];

  return {
    type: 'doc',
    content: [
      {
        type: 'paragraph',
        content: [
          text('Plain '),
          text('bold', [{type: 'bold'}]),
          text(' italic', [{type: 'italic'}]),
          text(' underline', [{type: 'underline'}]),
          text(' strike', [{type: 'strike'}]),
          text(' code', [{type: 'code'}]),
          text(' spoiler', [{type: 'spoiler'}]),
          text(' highlight', [{type: 'highlight'}]),
          text(' H'),
          text('2', [{type: 'subscript'}]),
          text('O x'),
          text('2', [{type: 'superscript'}]),
          text(' link', [{type: 'link', attrs: {href: 'https://telegram.org'}}]),
          text(' mention', [{type: 'mentionName', attrs: {userId: 1}}]),
          text(' date', [{
            type: 'formattedDate',
            attrs: {date: 1_725_120_000, pFlags: {short_date: true}}
          }]),
          {type: 'hardBreak'},
          text('Inline atoms: '),
          {type: 'inlineMath', attrs: {source: 'x^2'}},
          text(' '),
          {type: 'inlineRichAnchor', attrs: {name: 'section'}},
          text(' '),
          {type: 'customEmoji', attrs: {documentId: null, emoji: '🙂'}}
        ]
      },
      ...Array.from({length: 6}, (_, index): JSONContent => ({
        type: 'heading',
        attrs: {level: index + 1},
        content: [text(`Heading ${index + 1}`)]
      })),
      {
        type: 'blockquote',
        attrs: {collapsed: false},
        content: [
          paragraph('Quote body'),
          {type: 'blockquoteCaption', content: [text('Quote author')]}
        ]
      },
      {
        type: 'blockquote',
        attrs: {collapsed: true},
        content: [paragraph('Collapsed quote')]
      },
      {
        type: 'pullquote',
        content: [
          {type: 'pullquoteText', content: [text('Pullquote')]},
          {type: 'pullquoteCaption', content: [text('Pullquote author')]}
        ]
      },
      {
        type: 'details',
        attrs: {open: true},
        content: [
          {type: 'detailsSummary', content: [text('Open details')]},
          {type: 'detailsBody', content: [paragraph('Open details body')]}
        ]
      },
      {
        type: 'details',
        attrs: {open: false},
        content: [
          {type: 'detailsSummary', content: [text('Closed details')]},
          {type: 'detailsBody', content: [paragraph('Hidden details body')]}
        ]
      },
      {
        type: 'bulletList',
        content: [
          listItem('Bullet one'),
          listItem('Bullet checklist', {checkbox: true, checked: true})
        ]
      },
      {
        type: 'orderedList',
        attrs: {start: 3, startExplicit: true},
        content: [listItem('Ordered three'), listItem('Ordered four')]
      },
      {
        type: 'taskList',
        content: [
          {
            type: 'taskItem',
            attrs: {checked: false},
            content: [paragraph('Unchecked task')]
          },
          {
            type: 'taskItem',
            attrs: {checked: true},
            content: [paragraph('Completed task')]
          }
        ]
      },
      {
        type: 'codeBlock',
        attrs: {language: 'javascript'},
        content: [text('const answer = 42;\nconsole.log(answer);')]
      },
      table(),
      {type: 'blockMath', attrs: {source: '\\int_0^1 x^2 dx'}},
      ...media,
      {
        type: 'richMap',
        attrs: {
          block: {
            _: 'inputPageBlockMap',
            caption: {
              _: 'pageCaption',
              credit: {_: 'textEmpty'},
              text: {_: 'textPlain', text: 'Map caption'}
            },
            geo: {
              _: 'inputGeoPoint',
              lat: 25.2048,
              long: 55.2708
            },
            h: 200,
            w: 400,
            zoom: 13
          },
          captionCredit: {_: 'textEmpty'}
        },
        content: [text('Map caption')]
      },
      {
        type: 'paragraph',
        content: [text('Buttons: '), {
          type: RICH_BUTTON_NODE_NAME,
          attrs: richButtonAttrs({action: 'url', url: 'https://telegram.org', color: 'primary'}, 'Open')
        }]
      },
      {
        type: BUTTON_ROW_NODE_NAME,
        attrs: {align: 'center', buttons: [
          richButtonAttrs({action: 'copy', copyText: 'Telegram'}, 'Copy'),
          richButtonAttrs({action: 'disabled', color: 'danger'}, 'Soon')
        ]}
      },
      {type: 'richFooter', content: [text('Footer')]},
      {
        type: 'richAnchor',
        attrs: {name: 'chat-input-editor-test-anchor'}
      },
      {type: 'richDivider'},
      paragraph('Final paragraph')
    ]
  };
}
