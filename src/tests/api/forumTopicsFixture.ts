import {DraftMessage, MessagesForumTopics} from '@layer';
import {createTestClient} from './harness';
import {loadSeed} from './dualHarness';

export type ForumTestClient = Awaited<ReturnType<typeof createTestClient>>;

// A client with the fake forum channel saved, ready for topic list tests.
export async function makeForumTestClient({seedPath, channelId, title}: {
  seedPath: string,
  channelId: number,
  title: string
}): Promise<ForumTestClient> {
  const seed = loadSeed(seedPath);
  const client = await createTestClient({seed, accountNumber: 1, testDc: false});
  client.managers.appChatsManager.saveApiChats([{
    _: 'channel', id: channelId, access_hash: '0', title,
    date: 0, version: 0, photo: {_: 'chatPhotoEmpty'}, pFlags: {megagroup: true, forum: true}
  } as any]);
  return client;
}

// Page through the topic list the way the chatlist does — by the smallest index of the previous
// page — until the storage reports the end.
export async function loadWholeTopicList(storage: ForumTestClient['managers']['dialogsStorage'], filterId: PeerId) {
  let offsetIndex = 0;
  for(let i = 0; i < 30; ++i) {
    const result = await storage.getDialogs({offsetIndex, limit: 20, filterId});
    const dialogs = result.dialogs;
    if(!dialogs.length || result.isEnd) break;

    const nextIndex = dialogs.reduce((prev, dialog) => {
      const index = storage.getDialogIndex(dialog, storage.getDialogIndexKeyByFilterId(filterId));
      return index < prev ? index : prev;
    }, offsetIndex || Infinity);
    if(nextIndex === offsetIndex || nextIndex === Infinity) break;
    offsetIndex = nextIndex;
  }
}

// Shared fake-server fixture for the forum topic paging tests: a forum with `totalTopics` topics,
// newest first — topic i (0-based) has id `1000 - i`, top message `5000 - i`, date
// `firstDate - i * 60`. `draftAt` lets a test attach a draft to chosen topics, the way the real
// server includes `forumTopic.draft` in every response that contains the topic.
export function makeForumTopicsFixture({channelId, totalTopics, serverPage, firstDate, draftAt}: {
  channelId: number,
  totalTopics: number,
  serverPage: number,
  firstDate: number,
  draftAt?: (topicIndex: number) => DraftMessage
}) {
  const topicIdAt = (i: number) => 1000 - i;
  const topMessageAt = (i: number) => 5000 - i;
  const dateAt = (i: number) => firstDate - i * 60;
  const topicIndexOf = (topicServerId: number) => 1000 - topicServerId;

  const makeTopic = (i: number): any => ({
    _: 'forumTopic',
    pFlags: {},
    id: topicIdAt(i),
    date: dateAt(i),
    title: `topic ${i}`,
    icon_color: 0,
    top_message: topMessageAt(i),
    read_inbox_max_id: topMessageAt(i),
    read_outbox_max_id: topMessageAt(i),
    unread_count: 0,
    unread_mentions_count: 0,
    unread_reactions_count: 0,
    from_id: {_: 'peerUser', user_id: 1},
    notify_settings: {_: 'peerNotifySettings', pFlags: {}},
    draft: draftAt?.(i)
  });

  const makeMessage = (i: number): any => ({
    _: 'message',
    pFlags: {post: true},
    id: topMessageAt(i),
    peer_id: {_: 'peerChannel', channel_id: channelId},
    date: dateAt(i),
    message: `message ${i}`,
    reply_to: {_: 'messageReplyHeader', pFlags: {forum_topic: true}, reply_to_top_id: topicIdAt(i)}
  });

  const makeResult = (indices: number[]): Partial<MessagesForumTopics> => ({
    _: 'messages.forumTopics',
    flags: 0,
    count: totalTopics,
    topics: indices.map(makeTopic),
    messages: indices.map(makeMessage),
    chats: [],
    users: []
  });

  const makePage = (from: number) => {
    const indices: number[] = [];
    for(let i = from, to = Math.min(from + serverPage, totalTopics); i < to; ++i) {
      indices.push(i);
    }

    return makeResult(indices);
  };

  return {topicIdAt, topMessageAt, dateAt, topicIndexOf, makeTopic, makeMessage, makeResult, makePage};
}
