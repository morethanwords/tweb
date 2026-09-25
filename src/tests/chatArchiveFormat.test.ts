import type {Message} from '@layer';
import {
  ArchiveContext,
  PeerRef,
  archiveMessage,
  collectTopics,
  isDoneStale,
  markDone,
  mergeArchivedMessage,
  parsePeerSpec,
  renderLine,
  renderText,
  renderTranscripts
} from '@/tests/api/chatArchiveFormat';

function makeContext(): ArchiveContext {
  const self = {key: 'user1', name: 'Me'};
  const chat = {key: 'user2', name: 'Alice'};
  return {
    peers: new Map<string, PeerRef>([[self.key, self], [chat.key, chat], ['user3', {key: 'user3', name: 'Bob', username: 'bob'}]]),
    chat,
    self
  };
}

const message = (props: Partial<Message.message>): Message.message => ({
  _: 'message',
  id: 10,
  date: 1758700000,
  message: '',
  peer_id: {_: 'peerUser', user_id: 2},
  pFlags: {},
  ...props
});

describe('chat archive format', () => {
  test('parses every way a peer is named', () => {
    expect(parsePeerSpec('-1001234567890')).toEqual({kind: 'channel', id: '1234567890'});
    expect(parsePeerSpec('-1234567890')).toEqual({kind: 'chatOrChannel', id: '1234567890'});
    expect(parsePeerSpec('https://web.telegram.org/k/#-1234567890')).toEqual({kind: 'chatOrChannel', id: '1234567890'});
    expect(parsePeerSpec('https://t.me/c/1234567890/55')).toEqual({kind: 'channel', id: '1234567890'});
    expect(parsePeerSpec('t.me/durov')).toEqual({kind: 'username', username: 'durov'});
    expect(parsePeerSpec('@durov')).toEqual({kind: 'username', username: 'durov'});
    expect(parsePeerSpec('777000')).toEqual({kind: 'user', id: '777000'});
    expect(parsePeerSpec('me')).toEqual({kind: 'self'});
    expect(() => parsePeerSpec('???')).toThrow();
  });

  test('keeps link targets, offsets counted in UTF-16', () => {
    const text = '🙂 see docs here';
    const offset = text.indexOf('docs');
    expect(renderText(text, [{_: 'messageEntityTextUrl', offset, length: 4, url: 'https://x.y'}]))
    .toBe('🙂 see [docs](https://x.y) here');
  });

  test('attributes senders without from_id', () => {
    const ctx = makeContext();
    expect(archiveMessage(message({}), ctx).from.name).toBe('Alice');
    expect(archiveMessage(message({pFlags: {out: true}}), ctx).from.name).toBe('Me');
    expect(archiveMessage(message({from_id: {_: 'peerUser', user_id: 3}}), ctx).from).toEqual({key: 'user3', name: 'Bob', username: 'bob'});
  });

  test('describes service messages and forum topics', () => {
    const ctx = makeContext();
    const joined = archiveMessage({
      _: 'messageService',
      id: 5,
      date: 1758700000,
      peer_id: {_: 'peerChannel', channel_id: 9},
      from_id: {_: 'peerUser', user_id: 3},
      pFlags: {},
      action: {_: 'messageActionChatAddUser', users: [3]}
    }, ctx);
    expect(joined.service).toBe('joined the group');

    const created = archiveMessage({
      _: 'messageService',
      id: 7,
      date: 1758700000,
      peer_id: {_: 'peerChannel', channel_id: 9},
      from_id: {_: 'peerUser', user_id: 3},
      pFlags: {},
      action: {_: 'messageActionTopicCreate', title: 'Bugs', icon_color: 0, pFlags: {}}
    }, ctx);
    const inTopic = archiveMessage(message({
      id: 8,
      reply_to: {_: 'messageReplyHeader', reply_to_msg_id: 7, pFlags: {forum_topic: true}}
    }), ctx);
    expect(inTopic.topicId).toBe(7);
    expect(collectTopics([joined, created, inTopic])).toEqual({7: 'Bugs'});
  });

  test('keeps a record read again unless the message was edited, and its mark either way', () => {
    const ctx = makeContext();
    const reactions = (count: number): Partial<Message.message> => ({
      reactions: {_: 'messageReactions', pFlags: {}, results: [{_: 'reactionCount', reaction: {_: 'reactionEmoji', emoticon: '👍'}, count}]}
    });
    const stored = markDone(archiveMessage(message({message: 'build X', ...reactions(1)}), ctx), 'X shipped', '2026-09-24T00:00:00.000Z');

    // re-read, not edited: the stored record stands, the counters move, the mark stays fresh
    const reread = mergeArchivedMessage(stored, archiveMessage(message({message: 'build X', ...reactions(3)}), ctx));
    expect(reread.text).toBe('build X');
    expect(reread.reactions).toEqual({'👍': 3});
    expect(reread.done).toEqual({at: '2026-09-24T00:00:00.000Z', note: 'X shipped'});
    expect(isDoneStale(reread)).toBe(false);

    // edited since: the new text wins, the mark is kept and reads as stale — a hidden edit counts
    const edited = mergeArchivedMessage(reread, archiveMessage(message({
      message: 'build X and Y',
      edit_date: 1758700500,
      pFlags: {edit_hide: true}
    }), ctx));
    expect(edited.text).toBe('build X and Y');
    expect(edited.editTs).toBe(1758700500);
    expect(edited.editDate).toBeUndefined();
    expect(isDoneStale(edited)).toBe(true);
    expect(isDoneStale(markDone(edited))).toBe(false);

    // a record archived before editTs existed: its editDate stands in, so a plain re-read of an
    // old edited message is not taken for a new edit
    const legacy = markDone({...archiveMessage(message({message: 'old', edit_date: 1758700400}), ctx), editTs: undefined});
    expect(isDoneStale(legacy)).toBe(false);
    const legacyReread = mergeArchivedMessage(legacy, archiveMessage(message({message: 'old', edit_date: 1758700400}), ctx));
    expect(isDoneStale(legacyReread)).toBe(false);

    // a message read again is not gone from the server
    expect(mergeArchivedMessage({...stored, deleted: true}, archiveMessage(message({message: 'build X'}), ctx)).deleted).toBeUndefined();
  });

  test('shows done marks in the transcript', () => {
    const ctx = makeContext();
    const done = markDone(archiveMessage(message({message: 'do it'}), ctx), 'done in abc123');
    expect(renderLine(done, '10:00')).toBe('#10 10:00 ✔(done in abc123) Alice: do it');
    expect(renderLine({...done, editTs: 1758700500}, '10:00')).toContain('#10 10:00 ✔?(done in abc123) Alice');
    expect(renderLine(archiveMessage(message({message: 'do it'}), ctx), '10:00')).toBe('#10 10:00 Alice: do it');
  });

  test('renders a transcript by month and day', () => {
    const ctx = makeContext();
    const first = archiveMessage(message({id: 1, date: Date.UTC(2026, 7, 31, 23, 0) / 1000, message: 'bye\nAugust'}), ctx);
    const second = archiveMessage(message({
      id: 2,
      date: Date.UTC(2026, 8, 1, 9, 5) / 1000,
      message: 'hi',
      pFlags: {out: true},
      reply_to: {_: 'messageReplyHeader', reply_to_msg_id: 1, pFlags: {}},
      reactions: {_: 'messageReactions', pFlags: {}, results: [{_: 'reactionCount', reaction: {_: 'reactionEmoji', emoticon: '👍'}, count: 2}]}
    }), ctx);

    const months = renderTranscripts([first, second], {title: 'Alice', timeZone: 'UTC'});
    expect([...months.keys()]).toEqual(['2026-08', '2026-09']);
    expect(months.get('2026-08')).toContain('## 2026-08-31, Monday\n\n#1 23:00 Alice: bye\n    August');
    expect(months.get('2026-09')).toContain('#2 09:05 Me ↩1: hi  {👍2}');
  });
});
