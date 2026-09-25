import type {DraftMessage, Message, MessageMedia, PageBlock, RichMessage, RichText} from '@layer';
import getMessagePreviewIcon, {
  getTodoItemReplyPreview,
  MESSAGE_PREVIEW_ICON_FALLBACKS
} from '@components/wrappers/messagePreviewIcon';
import getMessageForReplyContent from '@components/wrappers/messageForReplyContent';

const text = (value: string): RichText => ({_: 'textPlain', text: value});

function richMessage(blocks: PageBlock[]): RichMessage {
  return {
    _: 'richMessage',
    pFlags: {},
    blocks,
    photos: [],
    documents: []
  };
}

function message(overrides: Partial<Message.message> = {}): Message.message {
  return {
    _: 'message',
    pFlags: {},
    id: 1,
    peer_id: {_: 'peerUser', user_id: 1},
    date: 1,
    message: '',
    ...overrides
  } as Message.message;
}

function draft(overrides: Partial<DraftMessage.draftMessage> = {}): DraftMessage.draftMessage {
  return {
    _: 'draftMessage',
    pFlags: {},
    date: 1,
    message: '',
    ...overrides
  };
}

describe('getMessageForReplyContent', () => {
  it('uses the structured rich summary when the legacy message text is empty', () => {
    const result = getMessageForReplyContent(
      message({
        rich_message: richMessage([
          {_: 'pageBlockHeading1', text: text('Title')},
          {_: 'pageBlockParagraph', text: text('Body')}
        ])
      })
    );

    expect(result.text).toBe('Title\nBody');
  });

  it('treats the rich document as canonical even if a stale legacy summary is present', () => {
    const result = getMessageForReplyContent(message({
      message: 'Stale legacy text',
      rich_message: richMessage([{
        _: 'pageBlockParagraph',
        text: {_: 'textBold', text: text('Canonical rich text')}
      }])
    }));

    expect(result.text).toBe('Canonical rich text');
    expect(result.entities).toContainEqual({
      _: 'messageEntityBold',
      offset: 0,
      length: 19
    });
  });

  it('does not replace an explicit quote or search excerpt with the whole rich message', () => {
    const result = getMessageForReplyContent(
      message({
        rich_message: richMessage([
          {_: 'pageBlockParagraph', text: text('Whole document')}
        ])
      }),
      'Selected excerpt'
    );

    expect(result.text).toBe('Selected excerpt');
  });

  it('uses the structured rich summary for a draft with empty legacy text', () => {
    const result = getMessageForReplyContent(draft({
      rich_message: richMessage([
        {_: 'pageBlockHeading1', text: text('Draft title')},
        {_: 'pageBlockParagraph', text: text('Draft body')}
      ])
    }));

    expect(result.text).toBe('Draft title\nDraft body');
  });
});

describe('getMessagePreviewIcon', () => {
  it.each([
    ['poll', {_: 'messageMediaPoll'} as any, 'poll'],
    ['checklist', {_: 'messageMediaToDo'} as any, 'checklist_done'],
    ['location', {_: 'messageMediaGeo'} as any, 'location'],
    ['contact', {_: 'messageMediaContact'} as any, MESSAGE_PREVIEW_ICON_FALLBACKS.contact],
    ['invoice', {_: 'messageMediaInvoice'} as any, MESSAGE_PREVIEW_ICON_FALLBACKS.invoice],
    ['giveaway', {_: 'messageMediaGiveaway'} as any, MESSAGE_PREVIEW_ICON_FALLBACKS.giveaway],
    ['story', {_: 'messageMediaStory'} as any, 'story'],
    ['audio file', {
      _: 'messageMediaDocument',
      pFlags: {},
      document: {type: 'audio'}
    } as any, 'music_filled'],
    ['generic file', {
      _: 'messageMediaDocument',
      pFlags: {},
      document: {type: 'document'}
    } as any, 'document']
  ])('classifies %s previews', (_name, media, expected) => {
    expect(getMessagePreviewIcon(message({media}))).toBe(expected);
  });

  it('classifies call service messages', () => {
    const call = {
      _: 'messageService',
      pFlags: {},
      id: 1,
      peer_id: {_: 'peerUser', user_id: 1},
      date: 1,
      action: {_: 'messageActionPhoneCall'}
    } as Message.messageService;

    expect(getMessagePreviewIcon(call)).toBe('phone');
  });

  it.each([
    [{_: 'pageBlockMath', source: 'x^2'} as PageBlock, MESSAGE_PREVIEW_ICON_FALLBACKS.richMath],
    [{
      _: 'pageBlockTable',
      pFlags: {},
      title: {_: 'textEmpty'},
      rows: []
    } as PageBlock, MESSAGE_PREVIEW_ICON_FALLBACKS.richTable],
    [{_: 'pageBlockAudio', audio_id: 1, caption: {_: 'pageCaption', text: {_: 'textEmpty'}, credit: {_: 'textEmpty'}}} as PageBlock, 'music_filled']
  ])('classifies structured rich blocks', (block, expected) => {
    expect(getMessagePreviewIcon(message({rich_message: richMessage([block])}))).toBe(expected);
  });

  it('does not duplicate type icons for media that already uses a thumbnail or its own service icon', () => {
    expect(getMessagePreviewIcon(message({
      media: {
        _: 'messageMediaDocument',
        pFlags: {},
        document: {type: 'video'}
      } as any
    }))).toBeUndefined();

    expect(getMessagePreviewIcon({
      _: 'messageService',
      pFlags: {},
      id: 1,
      peer_id: {_: 'peerUser', user_id: 1},
      date: 1,
      action: {_: 'messageActionTodoAppendTasks'}
    } as Message.messageService)).toBeUndefined();
  });
});

describe('getTodoItemReplyPreview', () => {
  const media = {
    _: 'messageMediaToDo',
    todo: {
      _: 'todoList',
      pFlags: {},
      title: {_: 'textWithEntities', text: 'List', entities: []},
      list: [
        {_: 'todoItem', id: 1, title: {_: 'textWithEntities', text: 'Open', entities: []}},
        {_: 'todoItem', id: 2, title: {_: 'textWithEntities', text: 'Done', entities: []}}
      ]
    },
    completions: [{
      _: 'todoCompletion',
      id: 2,
      completed_by: {_: 'peerUser', user_id: 1},
      date: 1
    }]
  } as MessageMedia.messageMediaToDo;

  it('returns the selected item with its current checkbox state', () => {
    expect(getTodoItemReplyPreview(media, 1)).toEqual({
      icon: 'checkboxempty',
      text: media.todo.list[0].title
    });
    expect(getTodoItemReplyPreview(media, 2)).toEqual({
      icon: 'checkboxon',
      text: media.todo.list[1].title
    });
  });

  it('does not fall back to the full checklist for a missing item', () => {
    expect(getTodoItemReplyPreview(media, 3)).toBeUndefined();
  });
});
