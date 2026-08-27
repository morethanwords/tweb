import {loadWholeTopicList, makeForumTestClient, makeForumTopicsFixture} from './forumTopicsFixture';

// Regression test: "drafts mixed into the forum topic list poison its pagination".
//
// A draft in a topic the paged list hasn't reached injects that topic into the topic-list folder
// before/without any page load: on startup `messages.getAllDrafts` dispatches 'draft_updated' per
// topic draft, the topic is unknown, so `getForumTopicById` fetches it by id and `applyDialogs`
// pushes it into the folder at its draft/message date. The next-page offsets were then derived
// from the LAST topic of the locally sorted list — i.e. from that injected topic — so even the
// FIRST `messages.getForumTopics` request started deep in the list and everything newer than the
// drafted topic never loaded; a mid-list draft likewise punched a permanent hole between the real
// frontier and the drafted topic. The offsets must instead advance strictly with the server's
// response order (`DialogsStorage.updateForumTopicsPaginationOffsets`), unaffected by any locally
// injected or reordered entries.
//
// Also covered: `folder.count` for a forum holds the SERVER total (set by the count peek in
// `getForumTopicById` and by paged responses) — an injected topic is already part of that total,
// so `processDialogForFilter` must not increment the count for it (it used to, inflating the
// list's virtual size).

const ENABLED = process.env.TG_API_TEST === '1';
const seedPath = process.env.TG_API_SEED || './tmp/seed.json';
const describeOrSkip = ENABLED ? describe : describe.skip;

const CHANNEL_ID = 700000003 as any;
const PEER_ID = (-CHANNEL_ID) as PeerId;
const TOTAL_TOPICS = 197;
const SERVER_PAGE = 100;
const FIRST_DATE = 1700000000;
// the drafted topics sit below the first server page, and their drafts are fresher than their top
// messages but still older than the first page's tail, so locally they land mid-list — the exact
// shape that used to poison the tail-derived offsets. Injecting the second one AFTER the count
// peek has run also used to bump `folder.count` past the server total
const DRAFTED_TOPICS: {topicIndex: number, positionIndex: number}[] = [
  {topicIndex: 150, positionIndex: 120},
  {topicIndex: 160, positionIndex: 130}
];

const makeDraft = (topicIndex: number): any => {
  const {positionIndex} = DRAFTED_TOPICS.find((entry) => entry.topicIndex === topicIndex) || {};
  return positionIndex === undefined ? undefined : {
    _: 'draftMessage',
    pFlags: {},
    date: fixture.dateAt(positionIndex),
    message: `unsent reply ${topicIndex}`
  };
};

const fixture = makeForumTopicsFixture({
  channelId: CHANNEL_ID,
  totalTopics: TOTAL_TOPICS,
  serverPage: SERVER_PAGE,
  firstDate: FIRST_DATE,
  draftAt: makeDraft
});

describeOrSkip('forum topic list paging with drafted below-frontier topics', () => {
  test('topics injected by their drafts poison neither the pagination offsets nor the count', async() => {
    const client = await makeForumTestClient({seedPath, channelId: CHANNEL_ID, title: 'Forum draft paging test'});
    const managers = client.managers;

    const pageRequests: {offset_date: number, offset_id: number, offset_topic: number}[] = [];
    const realInvoke = client.apiManager.invokeApi.bind(client.apiManager);
    (client.apiManager as any).invokeApi = (method: string, params: any, opts: any) => {
      if(method === 'messages.getForumTopics') {
        // the folder-count peek from `getForumTopicById` uses limit 1 — it is not a page request
        if(params.limit > 1) {
          pageRequests.push({
            offset_date: params.offset_date,
            offset_id: params.offset_id,
            offset_topic: params.offset_topic
          });
        }

        const from = params.offset_topic ?
          fixture.topicIndexOf(params.offset_topic) + 1 :
          0;
        return Promise.resolve(fixture.makePage(from));
      }

      if(method === 'messages.getForumTopicsByID') {
        return Promise.resolve(fixture.makeResult((params.topics as number[]).map(fixture.topicIndexOf)));
      }

      return realInvoke(method as any, params, opts);
    };

    const storage = managers.dialogsStorage;

    // the startup path: 'draft_updated' for an unknown topic makes appMessagesManager fetch the
    // topic by id, which injects it into the topic-list folder before any page was loaded
    for(const {topicIndex} of DRAFTED_TOPICS) {
      const topicMid = managers.appMessagesIdsManager.generateMessageId(
        fixture.topicIdAt(topicIndex),
        CHANNEL_ID
      );

      managers.appDraftsManager.saveDraft({
        peerId: PEER_ID,
        threadId: topicMid,
        draft: makeDraft(topicIndex),
        notify: true
      });
      const injected = await storage.getForumTopicById(PEER_ID, topicMid);
      expect(injected?.id).toBe(topicMid);
    }

    expect(storage.getFolderDialogs(PEER_ID, false).length).toBe(DRAFTED_TOPICS.length);
    // the injected topics are already part of the server total the count peek stored — they must
    // not be counted on top of it
    expect(storage.getFolder(PEER_ID).count).toBe(TOTAL_TOPICS);

    await loadWholeTopicList(storage, PEER_ID);

    // the first page must start from the top even though the folder already held the injected
    // topics — their offsets used to leak into the request, skipping every topic above the draft
    expect(pageRequests[0]).toEqual({offset_date: 0, offset_id: 0, offset_topic: 0});
    // the second page continues from the SERVER frontier (last topic of page one), not from the
    // injected topics that sit below it in the locally sorted list
    const lastOfFirstPage = SERVER_PAGE - 1;
    expect(pageRequests[1]).toEqual({
      offset_date: fixture.dateAt(lastOfFirstPage),
      offset_id: fixture.topMessageAt(lastOfFirstPage),
      offset_topic: fixture.topicIdAt(lastOfFirstPage)
    });

    // no holes and no duplicates: every topic loaded exactly once, count stays the server total
    expect(storage.getForumTopicsCache(PEER_ID).topics.size).toBe(TOTAL_TOPICS);
    expect(storage.getFolderDialogs(PEER_ID, false).length).toBe(TOTAL_TOPICS);
    expect(storage.getFolder(PEER_ID).count).toBe(TOTAL_TOPICS);

    // the draft survived the topic's page arriving, and it places the topic at the draft's date
    const [{topicIndex, positionIndex}] = DRAFTED_TOPICS;
    const draftedTopic = storage.getForumTopic(
      PEER_ID,
      managers.appMessagesIdsManager.generateMessageId(fixture.topicIdAt(topicIndex), CHANNEL_ID)
    );
    expect(draftedTopic.draft?._).toBe('draftMessage');
    const position = storage.getFolderDialogs(PEER_ID, false).indexOf(draftedTopic);
    expect(position).toBeGreaterThanOrEqual(positionIndex - 1);
    expect(position).toBeLessThanOrEqual(positionIndex + 1);

    client.dispose();
  }, 60_000);
});
