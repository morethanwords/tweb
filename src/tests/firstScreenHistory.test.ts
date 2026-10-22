import {Message, MessageEntity, MessageMedia} from '@layer';
import {countFirstScreen, estimateBubbleHeight, getBubbleHeightAtLeast, joinHistories, keepFrom, keepRange} from '@components/chat/firstScreenHistory';

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
  describe('at the end of the chat', () => {
    it('takes the newest messages until they surely fill the screen', () => {
      const messages = Array.from({length: 10}, () => message({media: photo(720, 1280)})); // * 240 each
      expect(countFirstScreen(messages, 0, 'end', 1000, 0, {})).toEqual({newest: 0, oldest: 4});
    });

    it('takes them all when they may not fill it', () => {
      const messages = Array.from({length: 10}, () => message({text: 'short'}));
      expect(countFirstScreen(messages, 0, 'end', 1000, 0, {})).toEqual({newest: 0, oldest: 9});
    });

    it('counts by the heights it is given', () => {
      const messages = Array.from({length: 10}, () => message({text: 'short'}));
      expect(countFirstScreen(messages, 0, 'end', 1000, 0, {}, () => 300)).toEqual({newest: 0, oldest: 3});
    });

    it('counts the margin from the screen\'s top: a message taller than the screen covers part of it', () => {
      const messages = Array.from({length: 10}, () => message({text: 'short'}));
      // * 300 px in a screen of 200: 100 px above the screen already
      expect(countFirstScreen(messages, 0, 'end', 200, 50, {}, () => 300)).toEqual({newest: 0, oldest: 0});
      expect(countFirstScreen(messages, 0, 'end', 200, 150, {}, () => 300)).toEqual({newest: 0, oldest: 1});
    });

    it('counts an album once and never splits it', () => {
      const album = Array.from({length: 4}, () => message({media: photo(720, 1280), groupedId: '7'}));
      const messages = [message({media: photo(720, 1280)}), ...album, ...Array.from({length: 5}, () => message({media: photo(720, 1280)}))];
      // * 240 + one album tile of 120: the album is in, whole, and one more post is needed after it
      expect(countFirstScreen(messages, 0, 'end', 500, 0, {})).toEqual({newest: 0, oldest: 5});
      expect(countFirstScreen(messages, 0, 'end', 300, 0, {})).toEqual({newest: 0, oldest: 4});
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
      countFirstScreen(album([caption, '', caption]).reverse(), 0, 'end', 1, 0, {}, getHeight);
      countFirstScreen(album(['', '', caption]).reverse(), 0, 'end', 1, 0, {}, getHeight);
      expect(heights).toEqual([120, 120 + 20 * 16]);
    });
  });

  // * newest first, as the history comes; 100 px each by the heights given below
  const history = (length: number) => Array.from({length}, () => message({text: 'post'})).reverse();
  const getHeight = () => 100;

  describe('at a message jumped to', () => {
    it('keeps what its middle leaves of the screen on each side, and the margin', () => {
      expect(countFirstScreen(history(21), 10, {center: 200}, 400, 100, {}, getHeight)).toEqual({newest: 7, oldest: 13});
    });

    it('keeps all a side has when it may not fill its part', () => {
      expect(countFirstScreen(history(21), 1, {center: 200}, 400, 100, {}, getHeight)).toEqual({newest: 0, oldest: 4});
    });

    it('fills the rest of the screen from the other side where one side ends with the chat', () => {
      // * one newer message and the end of the chat: the scroll stops at the end, the message is below the middle, and
      // * the older side fills what the message and the newer one leave of the screen
      expect(countFirstScreen(history(21), 1, {center: 400}, 800, 0, {bottom: true}, getHeight)).toEqual({newest: 0, oldest: 7});
      expect(countFirstScreen(history(21), 1, {center: 400}, 800, 0, {}, getHeight)).toEqual({newest: 0, oldest: 5});
      // * the same at the start of the chat, the other way
      expect(countFirstScreen(history(21), 19, {center: 400}, 800, 0, {top: true}, getHeight)).toEqual({newest: 13, oldest: 20});
    });

    it('keeps the whole album the message is in, and splits none at the edges', () => {
      const album = () => {
        const groupedId = 'album' + nextId;
        return Array.from({length: 3}, () => message({media: photo(720, 1280), groupedId}));
      };

      // * oldest first: two posts, an album, a post, the album of the message, two posts - each a bubble of 100 px
      const messages = [...history(2), ...album(), ...history(1), ...album(), ...history(2)].reverse();
      // * the message is the middle item of the newer album: 150 px each way end inside the other album
      expect(countFirstScreen(messages, 3, {center: 150}, 300, 0, {}, getHeight)).toEqual({newest: 0, oldest: 8});
    });
  });

  describe('at a message with its top in place', () => {
    it('keeps the screen below it and what stands above it', () => {
      // * the first unread message under bars of 50 px: one older message for them, the rest of the screen below
      expect(countFirstScreen(history(21), 10, {top: 50}, 800, 0, {}, getHeight)).toEqual({newest: 3, oldest: 11});
    });

    it('fills the rest of the screen above it where the chat ends below it', () => {
      expect(countFirstScreen(history(21), 2, {top: 50}, 800, 0, {bottom: true}, getHeight)).toEqual({newest: 0, oldest: 7});
    });

    it('keeps nothing above a message that starts above the screen', () => {
      // * the one a chat was left at, scrolled 50 px past its top: of a margin of 100 px, it covers half itself
      expect(countFirstScreen(history(21), 10, {top: -50}, 800, 0, {}, getHeight)).toEqual({newest: 2, oldest: 10});
      expect(countFirstScreen(history(21), 10, {top: -50}, 800, 100, {}, getHeight)).toEqual({newest: 1, oldest: 11});
    });
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

describe('keepRange', () => {
  it('keeps a range by the order of the history, not by the ids: a message being sent stands after newer ones', () => {
    const result = keepRange({
      history: [100.0002, 102, 101, 100, 99],
      messages: [100.0002, 102, 101, 100, 99].map((mid) => ({mid})),
      isEnd: {top: true, bottom: true, both: true}
    }, 1, 3);
    expect(result.history).toEqual([102, 101, 100]);
    expect(result.messages).toEqual([{mid: 102}, {mid: 101}, {mid: 100}]);
    expect(result.isEnd).toEqual({top: false, bottom: false, both: false});
  });

  it('keeps an end nothing past which is left out, an empty range included', () => {
    const history = {history: [5, 4, 3, 2, 1], isEnd: {top: true, bottom: true, both: true}};
    expect(keepRange(history, 0, 2).isEnd).toEqual({top: false, bottom: true, both: false});
    expect(keepRange(history, 3, 4).isEnd).toEqual({top: true, bottom: false, both: false});
    // * nothing newer than the first part: the newest kept is still the end
    expect(keepRange(history, 0, -1)).toEqual({history: [], isEnd: {top: false, bottom: true, both: false}});
  });
});

describe('joinHistories', () => {
  it('puts the newer part first and ends where each part does on its side', () => {
    const result = joinHistories(
      {history: [9, 8], isEnd: {top: false, bottom: true, both: false}},
      {history: [3, 2], isEnd: {top: true, bottom: false, both: false}}
    );
    expect(result.history).toEqual([9, 8, 3, 2]);
    expect(result.isEnd).toEqual({top: true, bottom: true, both: false});
  });

  it('ends where the other part does on the side of an empty one', () => {
    // * nothing newer is left to render: what was newer than the older part is not in the join, so it is no end
    const result = joinHistories(
      {history: [], isEnd: {top: false, bottom: true, both: false}},
      {history: [3, 2], isEnd: {top: true, bottom: false, both: false}}
    );
    expect(result.history).toEqual([3, 2]);
    expect(result.isEnd).toEqual({top: true, bottom: false, both: false});
  });
});
