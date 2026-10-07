import type {Message, PageBlock, PageCaption, RichMessage, RichText} from '@layer';
import I18n from '@lib/langPack';
import {stubBrowserGlobals} from '@/tests/helpers/browserGlobals';
import getRichMessagePreview, {getRichMessagePreviewMedia} from '@components/wrappers/richMessagePreview';

// wrapRichText's graph starts the app's workers on import, messageForReply's builds the sidebars
vi.mock('@lib/apiManagerProxy', () => ({default: new Proxy({}, {get: () => vi.fn()})}));
vi.mock('@components/sidebarLeft', () => ({default: new Proxy({}, {get: () => vi.fn()})}));
vi.mock('@components/sidebarRight', () => ({default: new Proxy({}, {get: () => vi.fn()})}));

const text = (value: string): RichText => ({_: 'textPlain', text: value});
// the separator between blocks: two spaces, the first unbreakable
const _ = '\u00A0 ';
const caption: PageCaption = {_: 'pageCaption', text: {_: 'textEmpty'}, credit: {_: 'textEmpty'}};

function richMessage(blocks: PageBlock[], media: Partial<RichMessage> = {}): RichMessage {
  return {
    _: 'richMessage',
    pFlags: {},
    blocks,
    photos: [],
    documents: [],
    ...media
  };
}

const labels = {
  AttachPhoto: 'Photo',
  AttachVideo: 'Video',
  AttachDocument: 'File',
  AccDescrCollage: 'Collage',
  AccDescrIVSlideshow: 'Slideshow',
  AccDescrIVTable: 'Table',
  AccDescrIVFormula: 'Formula',
  Map: 'Map'
};

beforeAll(() => {
  for(const key in labels) {
    I18n.strings.set(key as keyof typeof labels, {_: 'langPackString', key, value: labels[key as keyof typeof labels]});
  }
});

describe('getRichMessagePreview', () => {
  it('writes the blocks in one line two spaces apart, headings in bold', () => {
    const preview = getRichMessagePreview(richMessage([
      {_: 'pageBlockHeading1', text: text('Title')},
      {_: 'pageBlockDivider'},
      {_: 'pageBlockParagraph', text: text('Body\nmore')}
    ]));

    expect(preview.text).toBe(`Title${_}Body more`);
    expect(preview.entities).toEqual([{_: 'messageEntityBold', offset: 0, length: 5}]);
  });

  it('puts list items behind their bullets, numbers and checkboxes', () => {
    const preview = getRichMessagePreview(richMessage([
      {_: 'pageBlockList', items: [
        {_: 'pageListItemText', pFlags: {}, text: text('a')},
        {_: 'pageListItemText', pFlags: {checkbox: true, checked: true}, text: text('b')}
      ]},
      {_: 'pageBlockOrderedList', pFlags: {}, items: [
        {_: 'pageListOrderedItemText', pFlags: {checkbox: true}, text: text('c')},
        {_: 'pageListOrderedItemText', pFlags: {}, text: text('d')}
      ]}
    ]));

    expect(preview.text).toBe(`• a${_}✅ b${_}1. ☑️ c${_}2. d`);
    expect(preview.entities).toEqual([
      {_: 'messageEntityIcon', offset: 5, length: 1, icon: 'checkboxon'},
      {_: 'messageEntityIcon', offset: 13, length: 2, icon: 'checkboxempty'}
    ]);
  });

  it('names a table, a formula and media, an icon before the first two', () => {
    const preview = getRichMessagePreview(richMessage([
      {_: 'pageBlockTable', pFlags: {}, title: {_: 'textEmpty'}, rows: []},
      {_: 'pageBlockTable', pFlags: {}, title: text('Scores'), rows: []},
      {_: 'pageBlockMath', source: 'x^2'},
      {_: 'pageBlockPhoto', pFlags: {}, photo_id: 1, caption},
      {_: 'pageBlockSlideshow', items: [], caption},
      {_: 'pageBlockDetails', pFlags: {}, title: text('More'), blocks: [{_: 'pageBlockParagraph', text: text('hidden')}]}
    ]));

    expect(preview.text).toBe(`⊞ Table${_}⊞ Scores${_}fx Formula${_}Photo${_}Slideshow${_}More`);
    expect(preview.entities.map((entity) => entity._ === 'messageEntityIcon' && entity.icon)).toEqual(['table', 'table', 'formula']);
  });

  it('writes an audio by its performer and title', () => {
    const preview = getRichMessagePreview(richMessage([
      {_: 'pageBlockAudio', audio_id: 7, caption}
    ], {
      documents: [{
        _: 'document',
        id: 7,
        attributes: [{_: 'documentAttributeAudio', pFlags: {}, duration: 1, title: 'Song', performer: 'Band'}]
      } as any]
    }));

    expect(preview.text).toBe('🎵 Band – Song');
    expect(preview.entities).toEqual([{_: 'messageEntityIcon', offset: 0, length: 2, icon: 'note_filled'}]);
  });

  it('drops the blank the text starts with, its entities moving along', () => {
    const preview = getRichMessagePreview(richMessage([
      {_: 'pageBlockParagraph', text: {_: 'textConcat', texts: [text('\n  '), {_: 'textBold', text: text('Hi')}]}}
    ]));

    expect(preview.text).toBe('Hi');
    expect(preview.entities).toEqual([{_: 'messageEntityBold', offset: 0, length: 2}]);
  });

  // the first import of messageForReply's graph is most of this test: ~20 s on a cold cache
  it('is not cut a second time on its way to a reply', {timeout: 60_000}, async() => {
    stubBrowserGlobals();
    const {default: wrapMessageForReply} = await import('@components/wrappers/messageForReply');
    const reply = await wrapMessageForReply({
      message: {
        _: 'message',
        pFlags: {},
        id: 1,
        date: 1,
        message: '',
        peer_id: {_: 'peerUser', user_id: 1},
        rich_message: richMessage([{_: 'pageBlockParagraph', text: text('word '.repeat(40))}])
      } as Message.message,
      managers: {} as any, // * a message with no media asks them nothing
      plain: true
    });

    expect(reply).toBe('word '.repeat(30).trimEnd() + '…');
  });

  it('cuts a long text with an ellipsis, never through an icon', () => {
    const preview = getRichMessagePreview(richMessage([
      {_: 'pageBlockParagraph', text: text('x'.repeat(9))},
      {_: 'pageBlockMath', source: 'y'}
    ]), 12);

    expect(preview.text).toBe('x'.repeat(9) + '…');
    expect(preview.entities).toEqual([]);
  });

  it('cuts a long text never through an emoji or a custom one', () => {
    const flag = getRichMessagePreview(richMessage([{_: 'pageBlockParagraph', text: text('aaa🇺🇸 more')}]), 5);
    expect(flag.text).toBe('aaa…');

    const custom = getRichMessagePreview(richMessage([{_: 'pageBlockParagraph', text: {
      _: 'textConcat',
      texts: [text('aa'), {_: 'textCustomEmoji', document_id: 7, alt: '👨‍👩‍👧'}, text(' more')]
    }}]), 5);
    expect(custom.text).toBe('aa…');
    expect(custom.entities).toEqual([]);
  });
});

describe('getRichMessagePreviewMedia', () => {
  const photo = {_: 'photo', id: 1, sizes: []} as any;
  const video = {_: 'document', id: 2, thumbs: [{_: 'photoSize'}]} as any;

  it('takes the first video before any photo, inside the first slideshow too', () => {
    const media = getRichMessagePreviewMedia(richMessage([
      {_: 'pageBlockPhoto', pFlags: {}, photo_id: 1, caption},
      {_: 'pageBlockSlideshow', caption, items: [{_: 'pageBlockVideo', pFlags: {spoiler: true}, video_id: 2, caption}]}
    ], {photos: [photo], documents: [video]}));

    expect(media).toEqual({_: 'messageMediaDocument', pFlags: {spoiler: true}, document: video});
  });

  it('takes the photo when there is no video, and nothing for a video without a thumbnail', () => {
    expect(getRichMessagePreviewMedia(richMessage([
      {_: 'pageBlockParagraph', text: text('a')},
      {_: 'pageBlockPhoto', pFlags: {}, photo_id: 1, caption}
    ], {photos: [photo]}))).toEqual({_: 'messageMediaPhoto', pFlags: {spoiler: undefined}, photo});

    expect(getRichMessagePreviewMedia(richMessage([
      {_: 'pageBlockVideo', pFlags: {}, video_id: 3, caption},
      {_: 'pageBlockPhoto', pFlags: {}, photo_id: 1, caption}
    ], {photos: [photo], documents: [{_: 'document', id: 3, thumbs: []} as any]}))).toBeUndefined();
  });
});

describe('messageEntityIcon', () => {
  it('draws an icon over its text and keeps the text for a screen reader', async() => {
    stubBrowserGlobals();
    const {default: wrapRichText} = await import('@lib/richTextProcessor/wrapRichText');

    const container = document.createElement('div');
    // the emoji parsed over the icon's text (a translatable text gets them) is not drawn a second time
    container.append(wrapRichText('✅ done', {
      entities: [
        {_: 'messageEntityIcon', offset: 0, length: 1, icon: 'checkboxon'},
        {_: 'messageEntityEmoji', offset: 0, length: 1, unicode: '2705'}
      ]
    }));

    const icon = container.querySelector('.inline-icon');
    expect(icon.getAttribute('aria-hidden')).toBe('true');
    expect(container.querySelector('.sr-only').textContent).toBe('✅');
    expect(container.textContent).toBe(icon.textContent + '✅ done');
  });
});
