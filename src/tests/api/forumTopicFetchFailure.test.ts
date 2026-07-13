import {createTestClient} from './harness';
import {loadSeed} from './dualHarness';
import {MessagesForumTopics} from '@layer';

// Regression test for bug 2: "a new topic created on another account never appears, even after
// reopening the forum or sending messages into that topic — until a full app reload".
//
// Root cause: dialogsStorage.getForumTopicById permanently blacklisted a topic in `deletedTopics`
// whenever `messages.getForumTopicsByID` failed to return it — both on a request ERROR and on a
// mere OMISSION. The killer case is the omission: a brand-new topic isn't queryable by id for a
// moment right after creation (replication lag), so the topic-create message arrives, the by-id
// fetch comes back empty, and the topic is hidden forever (every later by-id fetch short-circuits
// on `deletedTopics`). Only a full reload (drops the in-memory cache) recovered it.
//
// The fix marks a topic deleted ONLY when the server explicitly returns it as `forumTopicDeleted`.
// A request error or an absent-from-response topic stays refetchable. No real network.

const ENABLED = process.env.TG_API_TEST === '1';
const seedPath = process.env.TG_API_SEED || './tmp/seed.json';
const describeOrSkip = ENABLED ? describe : describe.skip;

const CHANNEL_ID = 700000001 as any;
const PEER_ID = (-CHANNEL_ID) as PeerId;
const SERVER_TOPIC_ID = 5;

// NB: no `pts` field — processTopics would call addChannelState(pts) and kick off a real channel
// sync. The fetch path doesn't need it for this test.
const emptyForumTopics = (): Partial<MessagesForumTopics> => ({
  _: 'messages.forumTopics', flags: 0, count: 0,
  topics: [], messages: [], chats: [], users: []
});

const deletedForumTopics = (): Partial<MessagesForumTopics> => ({
  _: 'messages.forumTopics', flags: 0, count: 0,
  topics: [{_: 'forumTopicDeleted', id: SERVER_TOPIC_ID}],
  messages: [], chats: [], users: []
});

async function makeClient() {
  const seed = loadSeed(seedPath);
  const client = await createTestClient({seed, accountNumber: 1, testDc: false});
  client.managers.appChatsManager.saveApiChats([{
    _: 'channel', id: CHANNEL_ID, access_hash: '0', title: 'Forum fetch-failure test',
    date: 0, version: 0, photo: {_: 'chatPhotoEmpty'}, pFlags: {megagroup: true, forum: true}
  } as any]);
  const encodedTopicId = client.managers.appMessagesIdsManager.generateMessageId(SERVER_TOPIC_ID, CHANNEL_ID);
  return {client, encodedTopicId};
}

describeOrSkip('forum getForumTopicById only blacklists topics the server says are deleted', () => {
  test('a request ERROR does not poison deletedTopics (topic stays refetchable)', async() => {
    const {client, encodedTopicId} = await makeClient();
    let byIdCalls = 0;
    const realInvoke = client.apiManager.invokeApi.bind(client.apiManager);
    (client.apiManager as any).invokeApi = (method: string, params: any, opts: any) => {
      if(method === 'messages.getForumTopicsByID') {
        byIdCalls++;
        return Promise.reject({type: 'TIMEOUT'});
      }
      if(method === 'messages.getForumTopics') return Promise.reject({type: 'TIMEOUT'});
      return realInvoke(method as any, params, opts);
    };

    expect(await client.managers.dialogsStorage.getForumTopicById(PEER_ID, encodedTopicId)).toBeUndefined();
    expect(byIdCalls).toBe(1);
    // retry must hit the network again (not short-circuited by deletedTopics)
    expect(await client.managers.dialogsStorage.getForumTopicById(PEER_ID, encodedTopicId)).toBeUndefined();
    expect(byIdCalls).toBe(2);
    client.dispose();
  }, 60_000);

  test('a topic merely OMITTED from a successful response (replication lag) stays refetchable', async() => {
    const {client, encodedTopicId} = await makeClient();
    let byIdCalls = 0;
    const realInvoke = client.apiManager.invokeApi.bind(client.apiManager);
    (client.apiManager as any).invokeApi = (method: string, params: any, opts: any) => {
      if(method === 'messages.getForumTopicsByID') {
        byIdCalls++;
        return Promise.resolve(emptyForumTopics());
      }
      if(method === 'messages.getForumTopics') return Promise.resolve(emptyForumTopics());
      return realInvoke(method as any, params, opts);
    };

    expect(await client.managers.dialogsStorage.getForumTopicById(PEER_ID, encodedTopicId)).toBeUndefined();
    expect(byIdCalls).toBe(1);
    // the topic wasn't reported deleted, just absent -> the next fetch must retry (this is what makes
    // the topic appear once replication catches up / a new message arrives)
    expect(await client.managers.dialogsStorage.getForumTopicById(PEER_ID, encodedTopicId)).toBeUndefined();
    expect(byIdCalls).toBe(2);
    client.dispose();
  }, 60_000);

  test('a topic the server reports as forumTopicDeleted IS blacklisted (no needless refetch)', async() => {
    const {client, encodedTopicId} = await makeClient();
    let byIdCalls = 0;
    const realInvoke = client.apiManager.invokeApi.bind(client.apiManager);
    (client.apiManager as any).invokeApi = (method: string, params: any, opts: any) => {
      if(method === 'messages.getForumTopicsByID') {
        byIdCalls++;
        return Promise.resolve(deletedForumTopics());
      }
      if(method === 'messages.getForumTopics') return Promise.resolve(emptyForumTopics());
      return realInvoke(method as any, params, opts);
    };

    expect(await client.managers.dialogsStorage.getForumTopicById(PEER_ID, encodedTopicId)).toBeUndefined();
    expect(byIdCalls).toBe(1);
    // genuinely deleted -> short-circuit on deletedTopics, no second network call
    expect(await client.managers.dialogsStorage.getForumTopicById(PEER_ID, encodedTopicId)).toBeUndefined();
    expect(byIdCalls).toBe(1);
    client.dispose();
  }, 60_000);
});
