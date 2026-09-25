import {InputRichMessage, PageBlock, PageCaption, RichText} from '@layer';
import collectInputRichMessageReferences from '@lib/appManagers/utils/richMessage/collectInputRichMessageReferences';

const emptyText: RichText = {_: 'textEmpty'};
const emptyCaption: PageCaption = {_: 'pageCaption', text: emptyText, credit: emptyText};

function input(blocks: PageBlock[]): InputRichMessage.inputRichMessage {
  return {
    _: 'inputRichMessage',
    pFlags: {},
    blocks
  };
}

describe('collectInputRichMessageReferences', () => {
  test('collects and deduplicates inline references throughout lists, tables, and details', () => {
    const references = collectInputRichMessageReferences(input([{
      _: 'pageBlockDetails',
      pFlags: {},
      title: {
        _: 'textMentionName',
        user_id: 42,
        text: {_: 'textPlain', text: 'Alice'}
      },
      blocks: [
        {
          _: 'pageBlockList',
          items: [{
            _: 'pageListItemBlocks',
            pFlags: {},
            blocks: [{
              _: 'pageBlockParagraph',
              text: {
                _: 'textConcat',
                texts: [
                  {_: 'textCustomEmoji', document_id: '100', alt: '🥳'},
                  {
                    _: 'textBold',
                    text: {
                      _: 'textMentionName',
                      user_id: '42',
                      text: {_: 'textPlain', text: 'Alice again'}
                    }
                  }
                ]
              }
            }]
          }]
        },
        {
          _: 'pageBlockOrderedList',
          pFlags: {},
          items: [{
            _: 'pageListOrderedItemText',
            pFlags: {},
            text: {_: 'textImage', document_id: 200, w: 20, h: 20}
          }]
        },
        {
          _: 'pageBlockTable',
          pFlags: {},
          title: {_: 'textCustomEmoji', document_id: 100, alt: '🥳'},
          rows: [{
            _: 'pageTableRow',
            cells: [{
              _: 'pageTableCell',
              pFlags: {},
              text: {
                _: 'textMentionName',
                user_id: 7,
                text: {_: 'textImage', document_id: '200', w: 20, h: 20}
              }
            }]
          }]
        }
      ]
    }]));

    expect(references).toEqual({
      userIds: [42, 7],
      documentIds: ['100', 200],
      photoIds: []
    });
  });

  test('walks media references through covers, collages, slideshows, and nested captions', () => {
    const mentionCaption: PageCaption = {
      _: 'pageCaption',
      text: {
        _: 'textMentionName',
        user_id: 9,
        text: {_: 'textPlain', text: 'caption'}
      },
      credit: {_: 'textCustomEmoji', document_id: 300, alt: '✨'}
    };

    const references = collectInputRichMessageReferences(input([
      {
        _: 'pageBlockCover',
        cover: {
          _: 'pageBlockVideo',
          pFlags: {},
          video_id: '400',
          caption: mentionCaption
        }
      },
      {
        _: 'pageBlockCollage',
        items: [{
          _: 'pageBlockAudio',
          audio_id: 500,
          caption: emptyCaption
        }],
        caption: emptyCaption
      },
      {
        _: 'pageBlockSlideshow',
        items: [{
          _: 'pageBlockCover',
          cover: {
            _: 'pageBlockAudio',
            audio_id: '500',
            caption: {
              _: 'pageCaption',
              text: {_: 'textCustomEmoji', document_id: '300', alt: '✨'},
              credit: emptyText
            }
          }
        }],
        caption: emptyCaption
      },
      {
        _: 'pageBlockBlockquoteBlocks',
        blocks: [{
          _: 'pageBlockVideo',
          pFlags: {},
          video_id: 600,
          caption: emptyCaption
        }],
        caption: {
          _: 'textMentionName',
          user_id: '9',
          text: {_: 'textPlain', text: 'same user'}
        }
      }
    ]));

    expect(references).toEqual({
      userIds: [9],
      documentIds: ['400', 300, 500, 600],
      photoIds: []
    });
  });

  test('collects photo references without treating webpage IDs as media references', () => {
    const references = collectInputRichMessageReferences(input([
      {
        _: 'pageBlockPhoto',
        pFlags: {},
        photo_id: 1000,
        webpage_id: 2000,
        caption: emptyCaption
      },
      {
        _: 'pageBlockEmbed',
        pFlags: {},
        poster_photo_id: 3000,
        caption: emptyCaption
      },
      {
        _: 'pageBlockEmbedPost',
        url: 'https://example.com/post',
        webpage_id: 4000,
        author_photo_id: '1000',
        author: 'Author',
        date: 0,
        blocks: [{
          _: 'pageBlockPhoto',
          pFlags: {},
          photo_id: 5000,
          caption: emptyCaption
        }],
        caption: emptyCaption
      },
      {
        _: 'pageBlockRelatedArticles',
        title: emptyText,
        articles: [
          {
            _: 'pageRelatedArticle',
            url: 'https://example.com/related',
            webpage_id: 6000,
            photo_id: 7000
          },
          {
            _: 'pageRelatedArticle',
            url: 'https://example.com/no-photo',
            webpage_id: 8000
          }
        ]
      }
    ]));

    expect(references).toEqual({
      userIds: [],
      documentIds: [],
      photoIds: [1000, 3000, 5000, 7000]
    });
  });
});
