import {Message, RichMessage} from '@layer';
import {getSolidMessageBodyStructure} from '@components/chat/bubbleParts/solidMessageShell';

const peerId = 10 as PeerId;

function rich(value: string): RichMessage {
  return {
    _: 'richMessage',
    pFlags: {},
    blocks: [{_: 'pageBlockParagraph', text: {_: 'textPlain', text: value}}],
    photos: [],
    documents: []
  };
}

function message(overrides: Partial<Message.message> = {}): Message.message {
  return {
    _: 'message',
    id: 1,
    mid: 1,
    peer_id: {_: 'peerUser', user_id: peerId},
    peerId,
    from_id: {_: 'peerUser', user_id: peerId},
    fromId: peerId,
    pFlags: {},
    date: 1,
    message: 'draft',
    ...overrides
  };
}

describe('Solid message legacy-shell compatibility', () => {
  test('ignores identity, text/rich revisions, summary and read-delivery metadata', () => {
    const draft = message({
      id: 1.0001,
      mid: 1.0001,
      random_id: '100',
      pFlags: {currentlyTyping: true},
      message: 'hel',
      rich_message: rich('step')
    });
    const final = message({
      id: 77,
      mid: 77,
      date: 2,
      pFlags: {unread: true, mentioned: true, silent: true},
      message: 'hello',
      entities: [{_: 'messageEntityBold', offset: 0, length: 5}],
      rich_message: rich('step complete'),
      summary_from_language: 'en'
    });

    expect(getSolidMessageBodyStructure(final)).toEqual(getSolidMessageBodyStructure(draft));
  });

  test('keeps shell-affecting media and reply markup structural', () => {
    const source = message();
    const withMedia = message({media: {_: 'messageMediaEmpty'}});
    const withMarkup = message({
      reply_markup: {_: 'replyInlineMarkup', rows: []}
    });

    expect(getSolidMessageBodyStructure(withMedia)).not.toEqual(getSolidMessageBodyStructure(source));
    expect(getSolidMessageBodyStructure(withMarkup)).not.toEqual(getSolidMessageBodyStructure(source));
  });

  test('treats the final big-emoji presentation as a shell change', () => {
    const emojiEntity = [{_: 'messageEntityEmoji', offset: 0, length: 2}] as Message.message['entities'];
    const draft = message({
      pFlags: {currentlyTyping: true},
      message: '👍',
      entities: emojiEntity
    });
    const final = message({message: '👍', entities: emojiEntity});

    expect(getSolidMessageBodyStructure(final)).not.toEqual(getSolidMessageBodyStructure(draft));
  });

  test('treats adding or removing the body as a shell change', () => {
    expect(getSolidMessageBodyStructure(message({message: ''})))
    .not.toEqual(getSolidMessageBodyStructure(message({message: 'caption'})));
  });

  test('keeps an empty streamed body compatible with its first final text', () => {
    const draft = message({
      pFlags: {currentlyTyping: true},
      message: ''
    });
    const final = message({message: 'complete'});

    expect(getSolidMessageBodyStructure(final)).toEqual(getSolidMessageBodyStructure(draft));
  });

  test('keeps spoiler entity changes inside the Solid body', () => {
    const source = message({message: 'hidden'});
    const withSpoiler = message({
      message: 'hidden',
      entities: [{_: 'messageEntitySpoiler', offset: 0, length: 6}]
    });

    expect(getSolidMessageBodyStructure(withSpoiler)).toEqual(getSolidMessageBodyStructure(source));
  });
});
