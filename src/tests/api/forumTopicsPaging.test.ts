import {createTestClient} from './harness';
import {loadSeed} from './dualHarness';
import {MessagesForumTopics} from '@layer';

// Regression test: "in a big forum the topic list stops loading after the first ~100 topics".
//
// Root cause: forum topics were paginated with the folder's global offset DATE
// (`dialogsStorage.getOffsetDate(peerId)`) and `offset_id`/`offset_topic` left at 0. That offset
// date is derived from the peer's own history — which a forum's topic list has nothing to do with —
// so for forums it stayed 0 (or held an unrelated date). Every next page therefore repeated the
// very first request, the response brought no new topics, and the list froze at one page.
//
// The fix paginates like the official clients do: the offsets of the LAST topic of the previous
// page (its top message's date and id + the topic id). No real network here — the fake server below
// only answers a page when the offsets point at the previous page's last topic.

const ENABLED = process.env.TG_API_TEST === '1';
const seedPath = process.env.TG_API_SEED || './tmp/seed.json';
const describeOrSkip = ENABLED ? describe : describe.skip;

const CHANNEL_ID = 700000002 as any;
const PEER_ID = (-CHANNEL_ID) as PeerId;
const TOTAL_TOPICS = 197;
const SERVER_PAGE = 100;
const FIRST_DATE = 1700000000;

// topic i (0-based, newest first): id = 1000 - i, top_message = 5000 - i, date = FIRST_DATE - i * 60
const topicIdAt = (i: number) => 1000 - i;
const topMessageAt = (i: number) => 5000 - i;
const dateAt = (i: number) => FIRST_DATE - i * 60;

function makePage(from: number): Partial<MessagesForumTopics> {
  const to = Math.min(from + SERVER_PAGE, TOTAL_TOPICS);
  const topics: any[] = [];
  const messages: any[] = [];
  for(let i = from; i < to; ++i) {
    topics.push({
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
      notify_settings: {_: 'peerNotifySettings', pFlags: {}}
    });

    messages.push({
      _: 'message',
      pFlags: {post: true},
      id: topMessageAt(i),
      peer_id: {_: 'peerChannel', channel_id: CHANNEL_ID},
      date: dateAt(i),
      message: `message ${i}`,
      reply_to: {_: 'messageReplyHeader', pFlags: {forum_topic: true}, reply_to_top_id: topicIdAt(i)}
    });
  }

  return {
    _: 'messages.forumTopics',
    flags: 0,
    count: TOTAL_TOPICS,
    topics,
    messages,
    chats: [],
    users: []
  };
}

async function makeClient() {
  const seed = loadSeed(seedPath);
  const client = await createTestClient({seed, accountNumber: 1, testDc: false});
  client.managers.appChatsManager.saveApiChats([{
    _: 'channel', id: CHANNEL_ID, access_hash: '0', title: 'Forum paging test',
    date: 0, version: 0, photo: {_: 'chatPhotoEmpty'}, pFlags: {megagroup: true, forum: true}
  } as any]);
  return client;
}

describeOrSkip('forum topic list pages past the first server page', () => {
  test('every page is requested with the previous page\'s last topic as the offset', async() => {
    const client = await makeClient();
    const requests: {offset_date: number, offset_id: number, offset_topic: number}[] = [];

    const realInvoke = client.apiManager.invokeApi.bind(client.apiManager);
    (client.apiManager as any).invokeApi = (method: string, params: any, opts: any) => {
      if(method === 'messages.getForumTopics') {
        requests.push({
          offset_date: params.offset_date,
          offset_id: params.offset_id,
          offset_topic: params.offset_topic
        });

        // the server only moves forward when the offsets point at a real topic; anything else
        // (including the all-zeroes cursor) means "start from the top"
        const from = params.offset_topic ?
          (1000 - params.offset_topic) + 1 :
          0;
        return Promise.resolve(makePage(from));
      }

      return realInvoke(method as any, params, opts);
    };

    const storage = client.managers.dialogsStorage;
    let offsetIndex = 0;
    for(let i = 0; i < 30; ++i) {
      const result = await storage.getDialogs({offsetIndex, limit: 20, filterId: PEER_ID});
      const dialogs = result.dialogs;
      if(!dialogs.length || result.isEnd) break;

      const nextIndex = dialogs.reduce((prev, dialog) => {
        const index = storage.getDialogIndex(dialog, storage.getDialogIndexKeyByFilterId(PEER_ID));
        return index < prev ? index : prev;
      }, offsetIndex || Infinity);
      if(nextIndex === offsetIndex || nextIndex === Infinity) break;
      offsetIndex = nextIndex;
    }

    expect(storage.getForumTopicsCache(PEER_ID).topics.size).toBe(TOTAL_TOPICS);

    expect(requests[0]).toEqual({offset_date: 0, offset_id: 0, offset_topic: 0});
    // the second page must carry the last topic of the first one, otherwise the list would freeze
    const lastOfFirstPage = SERVER_PAGE - 1;
    expect(requests[1]).toEqual({
      offset_date: dateAt(lastOfFirstPage),
      offset_id: topMessageAt(lastOfFirstPage),
      offset_topic: topicIdAt(lastOfFirstPage)
    });

    client.dispose();
  }, 60_000);
});
