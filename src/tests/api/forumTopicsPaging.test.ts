import {loadWholeTopicList, makeForumTestClient, makeForumTopicsFixture} from './forumTopicsFixture';

// Regression test: "in a big forum the topic list stops loading after the first ~100 topics".
//
// Root cause: forum topics were paginated with the folder's global offset DATE
// (`dialogsStorage.getOffsetDate(peerId)`) and `offset_id`/`offset_topic` left at 0. That offset
// date is derived from the peer's own history — which a forum's topic list has nothing to do with —
// so for forums it stayed 0 (or held an unrelated date). Every next page therefore repeated the
// very first request, the response brought no new topics, and the list froze at one page.
//
// The fix paginates like the official clients do: the offsets of the LAST topic of the previous
// page (its top message's date and id + the topic id), advanced strictly in the server's response
// order (`DialogsStorage.updateForumTopicsPaginationOffsets`). No real network here — the fake
// server below only answers a page when the offsets point at the previous page's last topic.

const ENABLED = process.env.TG_API_TEST === '1';
const seedPath = process.env.TG_API_SEED || './tmp/seed.json';
const describeOrSkip = ENABLED ? describe : describe.skip;

const CHANNEL_ID = 700000002 as any;
const PEER_ID = (-CHANNEL_ID) as PeerId;
const TOTAL_TOPICS = 197;
const SERVER_PAGE = 100;
const FIRST_DATE = 1700000000;

const fixture = makeForumTopicsFixture({
  channelId: CHANNEL_ID,
  totalTopics: TOTAL_TOPICS,
  serverPage: SERVER_PAGE,
  firstDate: FIRST_DATE
});

describeOrSkip('forum topic list pages past the first server page', () => {
  test('every page is requested with the previous page\'s last topic as the offset', async() => {
    const client = await makeForumTestClient({seedPath, channelId: CHANNEL_ID, title: 'Forum paging test'});
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
          fixture.topicIndexOf(params.offset_topic) + 1 :
          0;
        return Promise.resolve(fixture.makePage(from));
      }

      return realInvoke(method as any, params, opts);
    };

    const storage = client.managers.dialogsStorage;
    await loadWholeTopicList(storage, PEER_ID);

    expect(storage.getForumTopicsCache(PEER_ID).topics.size).toBe(TOTAL_TOPICS);

    expect(requests[0]).toEqual({offset_date: 0, offset_id: 0, offset_topic: 0});
    // the second page must carry the last topic of the first one, otherwise the list would freeze
    const lastOfFirstPage = SERVER_PAGE - 1;
    expect(requests[1]).toEqual({
      offset_date: fixture.dateAt(lastOfFirstPage),
      offset_id: fixture.topMessageAt(lastOfFirstPage),
      offset_topic: fixture.topicIdAt(lastOfFirstPage)
    });

    client.dispose();
  }, 60_000);
});
