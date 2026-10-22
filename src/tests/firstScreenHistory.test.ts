import {Message, MessageEntity, MessageMedia} from '@layer';
import {countFirstScreen, estimateBubbleHeight, getBubbleHeightAtLeast, keepFrom} from '@components/chat/firstScreenHistory';

let nextId = 1;
const message = (options: {text?: string, entities?: MessageEntity[], media?: MessageMedia, groupedId?: string} = {}): Message.message => ({
  _: 'message',
  pFlags: {},
  id: nextId,
  mid: nextId++,
  peer_id: {_: 'peerChannel', channel_id: 1},
  date: 0,
  message: options.text ?? '',
  entities: options.entities,
  media: options.media,
  grouped_id: options.groupedId
} as Message.message);

const photo = (w: number, h: number): MessageMedia.messageMediaPhoto => ({
  _: 'messageMediaPhoto',
  pFlags: {},
  photo: {
    _: 'photo',
    pFlags: {},
    id: '1',
    access_hash: '1',
    file_reference: new Uint8Array(),
    date: 0,
    dc_id: 2,
    sizes: [
      {_: 'photoStrippedSize', type: 'i', bytes: new Uint8Array()},
      {_: 'photoSize', type: 'm', w: w / 4, h: h / 4, size: 1},
      {_: 'photoSize', type: 'y', w, h, size: 1}
    ]
  }
});

const video = (w: number, h: number, sticker?: boolean): MessageMedia.messageMediaDocument => ({
  _: 'messageMediaDocument',
  pFlags: {},
  document: {
    _: 'document',
    pFlags: {},
    id: '1',
    access_hash: '1',
    file_reference: new Uint8Array(),
    date: 0,
    mime_type: sticker ? 'video/webm' : 'video/mp4',
    size: 1,
    dc_id: 2,
    attributes: [
      {_: 'documentAttributeVideo', pFlags: {}, duration: 1, w, h},
      ...(sticker ? [{_: 'documentAttributeSticker', pFlags: {}, alt: '', stickerset: {_: 'inputStickerSetEmpty'}} as const] : [])
    ]
  }
});

describe('getBubbleHeightAtLeast', () => {
  it('counts a line for each paragraph, or for each 200 characters', () => {
    expect(getBubbleHeightAtLeast(message({text: 'one'}))).toBe(16);
    expect(getBubbleHeightAtLeast(message({text: 'one\ntwo\n\nfour'}))).toBe(4 * 16);
    expect(getBubbleHeightAtLeast(message({text: 'a'.repeat(1000)}))).toBe(5 * 16);
  });

  it('counts code and a collapsed quote by their lines, at the smaller line', () => {
    const text = 'a'.repeat(1000);
    expect(getBubbleHeightAtLeast(message({text, entities: [{_: 'messageEntityPre', offset: 0, length: 1000, language: ''}]}))).toBe(14);

    const quoted = 'intro\n' + 'b\n'.repeat(20) + 'c'.repeat(800);
    const offset = 'intro\n'.length;
    expect(getBubbleHeightAtLeast(message({
      text: quoted,
      entities: [{_: 'messageEntityBlockquote', pFlags: {collapsed: true}, offset, length: quoted.length - offset}]
    }))).toBe(16 + 14); // * the intro, and a line for the quote
  });

  it('does not take the line breaks around a quote for empty lines', () => {
    const text = 'before\n\nquoted\n\nafter';
    const offset = text.indexOf('quoted');
    expect(getBubbleHeightAtLeast(message({
      text,
      entities: [{_: 'messageEntityBlockquote', pFlags: {}, offset, length: 'quoted'.length}]
    }))).toBe(2 * 16 + 14);
  });

  it('counts a photo or a video no taller than a phone shows it', () => {
    expect(getBubbleHeightAtLeast(message({media: photo(1280, 720)}))).toBe(135);
    expect(getBubbleHeightAtLeast(message({media: photo(720, 1280)}))).toBe(240);
    expect(getBubbleHeightAtLeast(message({media: photo(100, 50)}))).toBe(50);
    expect(getBubbleHeightAtLeast(message({media: video(1920, 1080)}))).toBe(135);
    expect(getBubbleHeightAtLeast(message({media: photo(720, 1280)}), true)).toBe(120);
  });

  it('does not count a self-destructing photo, shown as a line of notice', () => {
    expect(getBubbleHeightAtLeast(message({media: {...photo(720, 1280), ttl_seconds: 10}}))).toBe(0);
  });

  it('does not count a sticker or a service message', () => {
    expect(getBubbleHeightAtLeast(message({media: video(512, 512, true)}))).toBe(0);
    expect(getBubbleHeightAtLeast({_: 'messageService'} as Message.messageService)).toBe(0);
  });
});

describe('estimateBubbleHeight', () => {
  const metrics = {font: '16px Roboto', lineHeight: 21, lineWidth: 400};
  let getContext: ReturnType<typeof vi.spyOn>;
  beforeAll(() => {
    // * jsdom has no canvas: 8 px a character
    getContext = vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      font: '',
      measureText: (text: string) => ({width: text.length * 8})
    } as any);
  });
  afterAll(() => getContext.mockRestore());

  it('wraps each paragraph at the width a line gets', () => {
    expect(estimateBubbleHeight(message({text: 'a'.repeat(100)}), metrics)).toBe(2 * 21); // * 800 px in 400
    expect(estimateBubbleHeight(message({text: 'a'.repeat(40) + '\n\n' + 'b'.repeat(51)}), metrics)).toBe(4 * 21);
  });

  it('counts a quote at four fifths of the size, and a row of reactions', () => {
    const text = 'a'.repeat(10) + '\n' + 'q'.repeat(100);
    expect(estimateBubbleHeight(message({
      text,
      entities: [{_: 'messageEntityBlockquote', pFlags: {}, offset: 11, length: 100}]
    }), metrics)).toBe(21 + 2 * 21 * .8); // * 800 px of the quote at four fifths: 640 in 400
    expect(estimateBubbleHeight({
      ...message({text: 'a'}),
      reactions: {_: 'messageReactions', pFlags: {}, results: [{_: 'reactionCount', count: 1, reaction: {_: 'reactionEmoji', emoticon: '🔥'}}]}
    }, metrics)).toBe(21 + 32);
  });
});

describe('countFirstScreen', () => {
  it('takes the newest messages until they surely fill the height', () => {
    const messages = Array.from({length: 10}, () => message({media: photo(720, 1280)})); // * 240 each
    expect(countFirstScreen(messages, 1000)).toBe(5);
  });

  it('takes them all when they may not fill it', () => {
    const messages = Array.from({length: 10}, () => message({text: 'short'}));
    expect(countFirstScreen(messages, 1000)).toBe(10);
  });

  it('counts by the heights it is given', () => {
    const messages = Array.from({length: 10}, () => message({text: 'short'}));
    expect(countFirstScreen(messages, 1000, () => 300)).toBe(4);
  });

  it('counts an album once and never splits it', () => {
    const album = Array.from({length: 4}, () => message({media: photo(720, 1280), groupedId: '7'}));
    const messages = [message({media: photo(720, 1280)}), ...album, ...Array.from({length: 5}, () => message({media: photo(720, 1280)}))];
    // * 240 + one album tile of 120: the album is in, whole, and one more post is needed after it
    expect(countFirstScreen(messages, 500)).toBe(6);
    expect(countFirstScreen(messages, 300)).toBe(5);
  });

  it('counts an album by the caption its bubble shows: none when more than one item has one', () => {
    const caption = 'a\n'.repeat(20); // * 20 lines
    const album = (texts: string[]) => {
      const groupedId = 'album' + nextId;
      return texts.map((text) => message({text, media: photo(720, 1280), groupedId}));
    };
    const heights: number[] = [];
    const getHeight = (message: Message.message | Message.messageService, inAlbum: boolean) => {
      const height = getBubbleHeightAtLeast(message, inAlbum);
      heights.push(height);
      return height;
    };

    // * newest first, as the history comes
    countFirstScreen(album([caption, '', caption]).reverse(), 1, getHeight);
    countFirstScreen(album(['', '', caption]).reverse(), 1, getHeight);
    expect(heights).toEqual([120, 120 + 20 * 16]);
  });
});

describe('keepFrom', () => {
  it('keeps a range, and neither end with it', () => {
    const result = keepFrom({history: [5, 4, 3, 2, 1], isEnd: {top: true, bottom: true, both: true}}, 2, 4);
    expect(result.history).toEqual([3, 2]);
    expect(result.isEnd).toEqual({top: false, bottom: false, both: false});
  });

  it('drops what is older and the top end with it', () => {
    const result = keepFrom({
      history: [5, 4, 3, 2, 1],
      messages: [5, 4, 3, 2, 1].map((mid) => ({mid})),
      isEnd: {top: true, bottom: true, both: true}
    }, 3);
    expect(result.history).toEqual([5, 4, 3]);
    expect(result.messages).toEqual([{mid: 5}, {mid: 4}, {mid: 3}]);
    expect(result.isEnd).toEqual({top: false, bottom: true, both: false});
  });
});
