import {afterEach, describe, expect, it, vi} from 'vitest';
import AppStoriesManager from '@appManagers/appStoriesManager';
import ApiManagerMethods from '@appManagers/apiManagerMethods';
import {canCopyStoryLink} from '@appManagers/utils/stories/storyLink';
import {copyPendingTextToClipboard} from '@helpers/clipboard';
import noop from '@helpers/noop';
import {PEER_STORIES_POLL_INTERVAL} from '@appManagers/utils/stories/canPollPeerStories';
import {Chat, PeerStories, RecentStory, StoryItem, Update, User} from '@layer';
import '@helpers/peerIdPolyfill';

const self = (1 as UserId).toPeerId();
const stranger = (2 as UserId).toPeerId();
const named = (3 as UserId).toPeerId();
const channelPeer = (10 as ChatId).toPeerId(true);

const story = (id: number, pFlags: StoryItem.storyItem['pFlags'] = {}) =>
  ({_: 'storyItem', id, date: 100 + id, expire_date: 2e9, pFlags, media: {_: 'messageMediaEmpty'}} as StoryItem.storyItem);
const recent = (max_id?: number): RecentStory => ({_: 'recentStory', pFlags: {}, max_id});
const peerOf = (peerId: PeerId) => peerId.isUser() ?
  {_: 'peerUser' as const, user_id: peerId.toUserId()} :
  {_: 'peerChannel' as const, channel_id: peerId.toChatId()};

function withServer(answer: (method: string, params: any) => any) {
  const sent: {method: string, params: any}[] = [];
  const dispatchEvent = vi.fn();
  const peers = new Map<PeerId, User.user | Chat.channel>([
    [stranger, {_: 'user', id: stranger.toUserId(), pFlags: {}, status: {_: 'userStatusRecently', pFlags: {}}} as User.user],
    [named, {_: 'user', id: named.toUserId(), username: 'named', pFlags: {}, status: {_: 'userStatusRecently', pFlags: {}}} as User.user],
    [channelPeer, {_: 'channel', id: channelPeer.toChatId(), title: 'c', pFlags: {left: true}} as Chat.channel]
  ]);
  const savePeer = (peer: User.user | Chat.channel) => peers.set(peer.id.toPeerId(peer._ !== 'user'), peer);
  // * a difference being applied: updates that come meanwhile are dropped, but for those told to go through
  const sync = {loading: false};

  const apiManager = {
    invokeApi: vi.fn((method: string, params: any) => {
      sent.push({method, params});
      return Promise.resolve().then(() => answer(method, params));
    }),
    // * the real one: a request asked for again while it is on its way joins it
    apiPromisesSingleProcess: {},
    invokeApiSingleProcess: ApiManagerMethods.prototype.invokeApiSingleProcess
  };

  const manager = new AppStoriesManager();
  manager.clear(true);
  Object.assign(manager, {
    apiManager,
    rootScope: {dispatchEvent},
    apiUpdatesManager: {
      processUpdateMessage: vi.fn((updates: any, options?: {ignoreSyncLoading?: boolean}) => {
        if(sync.loading && !options?.ignoreSyncLoading) {
          return;
        }

        updates.updates.forEach((update: Update) => (manager as any).onUpdateReadStories(update));
      })
    },
    appPeersManager: {
      peerId: self,
      getPeer: (peerId: PeerId) => peers.get(peerId),
      getPeerId: (peer: any) => peer.user_id ? (peer.user_id as UserId).toPeerId() : (peer.channel_id as ChatId).toPeerId(true),
      getOutputPeer: peerOf,
      getInputPeerById: (peerId: PeerId) => ({_: 'inputPeer', peerId}),
      getPeerUsername: (peerId: PeerId) => (peers.get(peerId) as User.user)?.username || '',
      saveApiPeers: vi.fn()
    },
    appUsersManager: {isContact: () => false, isPremium: () => false, saveApiUsers: vi.fn((users: User.user[]) => users.forEach(savePeer))},
    appChatsManager: {isBroadcast: () => true, isMegagroup: () => false, isInChat: () => false, saveApiChats: vi.fn((chats: Chat.channel[]) => chats.forEach(savePeer))},
    appMessagesManager: {saveMessageMedia: vi.fn()},
    appDocsManager: {saveDoc: (doc: any) => doc},
    appMessagesIdsManager: {generateMessageId: (id: number) => id}
  });

  return {manager, sent, dispatchEvent, peers, apiManager, sync};
}

const peerStories = (peerId: PeerId, stories: StoryItem[], max_read_id?: number): PeerStories =>
  ({_: 'peerStories', peer: peerOf(peerId), stories, max_read_id});

describe('the link to a story', () => {
  it('is the username\'s at once, while the server is asked for its own, which is given after', async() => {
    const {manager, sent} = withServer(() => ({_: 'exportedStoryLink', link: 'https://t.me/named/s/5?from=server'}));
    expect(manager.getStoryLink(named, 5)).toBe('https://t.me/named/s/5');
    expect(sent).toEqual([{method: 'stories.exportStoryLink', params: {peer: {_: 'inputPeer', peerId: named}, id: 5}}]);

    await vi.waitFor(() => expect(manager.getStoryLink(named, 5)).toBe('https://t.me/named/s/5?from=server'));
    expect(sent.length).toBe(1);
  });

  it('is asked again once the peer has another username', async() => {
    const {manager, sent, peers} = withServer(() => ({_: 'exportedStoryLink', link: `https://t.me/${(peers.get(named) as User.user).username}/s/5?from=server`}));
    manager.getStoryLink(named, 5);
    await vi.waitFor(() => expect(manager.getStoryLink(named, 5)).toBe('https://t.me/named/s/5?from=server'));

    peers.set(named, {...peers.get(named), username: 'renamed'} as User.user);
    expect(manager.getStoryLink(named, 5)).toBe('https://t.me/renamed/s/5');
    await vi.waitFor(() => expect(manager.getStoryLink(named, 5)).toBe('https://t.me/renamed/s/5?from=server'));
    expect(sent.length).toBe(2);
  });

  it('of a peer without a username is the server\'s, or none', async() => {
    const {manager} = withServer((method, params) => {
      if(params.id === 6) throw {type: 'USER_PUBLIC_MISSING'};
      return {_: 'exportedStoryLink', link: 'https://t.me/s/xyz'};
    });
    await expect(manager.getStoryLink(stranger, 5)).resolves.toBe('https://t.me/s/xyz');
    await expect(manager.getStoryLink(stranger, 6)).rejects.toEqual({type: 'USER_PUBLIC_MISSING'});
  });

  it('is offered for a public story of a peer with a username, or of any where the server exports one', () => {
    const user = {_: 'user', id: 1, pFlags: {}} as User.user;
    const withUsername = {...user, username: 'a'} as User.user;
    expect(canCopyStoryLink(story(1, {public: true}), withUsername, {} as MTAppConfig)).toBe(true);
    expect(canCopyStoryLink(story(1, {public: true}), user, {} as MTAppConfig)).toBe(false);
    expect(canCopyStoryLink(story(1, {public: true}), user, {stories_export_nopublic_link: true} as MTAppConfig)).toBe(true);
    expect(canCopyStoryLink(story(1), withUsername, {stories_export_nopublic_link: true} as MTAppConfig)).toBe(false);
    expect(canCopyStoryLink({_: 'storyItemSkipped', id: 1, date: 1, expire_date: 2, pFlags: {}}, withUsername, {} as MTAppConfig)).toBe(false);
  });

  describe('is copied', () => {
    const clipboard = Object.getOwnPropertyDescriptor(navigator, 'clipboard');
    const useClipboard = (value: Partial<Clipboard>) => Object.defineProperty(navigator, 'clipboard', {configurable: true, value});
    afterEach(() => {
      vi.unstubAllGlobals();
      vi.restoreAllMocks();
      if(clipboard) Object.defineProperty(navigator, 'clipboard', clipboard);
      else delete (navigator as any).clipboard;
    });

    it('by a write started within the click, before the worker has answered, with the link to come', async() => {
      const write = vi.fn((_items: ClipboardItem[]) => Promise.resolve());
      useClipboard({write});
      vi.stubGlobal('ClipboardItem', class {
        constructor(public data: Record<string, Promise<Blob>>) {}
      });

      let answer: (link: string) => void;
      const copied = copyPendingTextToClipboard(new Promise((resolve) => answer = resolve));
      expect(write).toHaveBeenCalledTimes(1);
      answer('https://t.me/named/s/5');
      await copied;
      const blob = await (write.mock.calls[0][0][0] as any).data['text/plain'] as Blob;
      expect(blob.type).toBe('text/plain');
      expect(blob.size).toBe('https://t.me/named/s/5'.length);
    });

    it('once the link has come, when the browser refuses the write of a ClipboardItem', async() => {
      const writeText = vi.fn((_text: string) => Promise.resolve());
      useClipboard({write: () => Promise.reject(new Error('NotAllowedError')), writeText});
      vi.stubGlobal('ClipboardItem', class {
        constructor(public data: Record<string, Promise<Blob>>) {}
      });
      vi.spyOn(console, 'error').mockImplementation(() => {});

      await copyPendingTextToClipboard(Promise.resolve('https://t.me/named/s/5'));
      expect(writeText).toHaveBeenCalledWith('https://t.me/named/s/5');
    });

    it('once the link has come where a ClipboardItem cannot be written, and not said to be when it is not', async() => {
      const writeText = vi.fn((_text: string) => Promise.resolve());
      useClipboard({writeText});
      await copyPendingTextToClipboard(Promise.resolve('https://t.me/named/s/5'));
      expect(writeText).toHaveBeenCalledWith('https://t.me/named/s/5');

      await expect(copyPendingTextToClipboard(Promise.reject({type: 'USER_PUBLIC_MISSING'}))).rejects.toEqual({type: 'USER_PUBLIC_MISSING'});
    });
  });
});

describe('how far the stories of every peer are read', () => {
  const tills = {_: 'updates', updates: [
    {_: 'updateReadStories', peer: peerOf(stranger), max_id: 4},
    {_: 'updateReadStories', peer: peerOf(named), max_id: 2}
  ], users: [] as User[], chats: [] as Chat[], date: 0, seq: 0};

  it('is asked once a session, once the feed has come', async() => {
    const {manager, sent} = withServer((method) => method === 'stories.getAllStories' ?
      {_: 'stories.allStories', pFlags: {}, count: 0, state: 's', peer_stories: [], chats: [], users: [], stealth_mode: {_: 'storiesStealthMode'}} :
      tills);
    await manager.getAllStories();
    await manager.getAllStories(false, undefined, true);
    await vi.waitFor(() => expect(sent.filter(({method}) => method === 'stories.getAllReadPeerStories').length).toBe(1));
    expect(manager.getPeerStoriesCache(stranger).maxReadId).toBe(4);
  });

  it('is taken even while a difference is being applied, since it is not asked again', async() => {
    const {manager, sent, sync} = withServer((method) => method === 'stories.getAllStories' ?
      {_: 'stories.allStories', pFlags: {}, count: 0, state: 's', peer_stories: [], chats: [], users: [], stealth_mode: {_: 'storiesStealthMode'}} :
      tills);
    sync.loading = true;
    await manager.getAllStories();
    await vi.waitFor(() => expect(sent.filter(({method}) => method === 'stories.getAllReadPeerStories').length).toBe(1));
    await vi.waitFor(() => expect(manager.getPeerStoriesCache(named).maxReadId).toBe(2));
  });

  it('of a peer none of whose stories are held tells nothing on screen, and the stories are still read whole', async() => {
    const {manager, sent, dispatchEvent} = withServer(() => ({_: 'stories.peerStories', stories: peerStories(stranger, [story(3), story(5)], 2), chats: [], users: []}));
    (manager as any).onUpdateReadStories(tills.updates[0]);
    expect(dispatchEvent).not.toHaveBeenCalled();

    // * the newer of the two stands
    const result = await manager.getPeerStories(stranger);
    expect(sent.map(({method}) => method)).toEqual(['stories.getPeerStories']);
    expect(result.max_read_id).toBe(4);
    expect(manager.getUnreadType(stranger, 5)).toBe('unread');
    expect(manager.getUnreadType(stranger, 3)).toBe('read');
  });

  it('of a peer whose stories are held is told when it grows, and only then', async() => {
    const {manager, dispatchEvent} = withServer(() => ({_: 'stories.peerStories', stories: peerStories(stranger, [story(3), story(5)], 3), chats: [], users: []}));
    await manager.getPeerStories(stranger);
    (manager as any).onUpdateReadStories({_: 'updateReadStories', peer: peerOf(stranger), max_id: 2});
    expect(dispatchEvent).not.toHaveBeenCalledWith('stories_read', expect.anything());
    (manager as any).onUpdateReadStories({_: 'updateReadStories', peer: peerOf(stranger), max_id: 5});
    expect(dispatchEvent).toHaveBeenCalledWith('stories_read', {peerId: stranger, maxReadId: 5});
  });

  it('of a story not held yet is known for it', () => {
    const {manager} = withServer(() => undefined);
    (manager as any).onUpdateReadStories({_: 'updateReadStories', peer: peerOf(stranger), max_id: 4});
    expect(manager.getUnreadType(stranger, 6)).toBe('unread');
    expect(manager.getUnreadType(stranger, 4)).toBe('read');
  });

  it('known of a peer one comes to follow, does not stand for its stories: they are read then', async() => {
    const {manager, sent, peers, dispatchEvent} = withServer(() => ({_: 'stories.peerStories', stories: peerStories(stranger, [story(5)], 0), chats: [], users: []}));
    peers.set(stranger, {...peers.get(stranger), stories_max_id: recent(5)} as User.user);
    (manager as any).onUpdateReadStories({_: 'updateReadStories', peer: peerOf(stranger), max_id: 4});

    (manager as any).appUsersManager.isContact = () => true;
    (manager as any).onSubscriptionUpdate(stranger);
    await vi.waitFor(() => expect(dispatchEvent).toHaveBeenCalledWith('stories_stories', expect.objectContaining({max_read_id: 4})));
    expect(sent.map(({method}) => method)).toEqual(['stories.getPeerStories']);
    expect(manager.getPeerStoriesCache(stranger).stories).toEqual([5]);
  });
});

describe('what the peers on screen have in stories', () => {
  it('is asked of the server once an interval, for the peers the feed does not follow, up to 100 a request', async() => {
    const {manager, sent, peers} = withServer((method, params) => params.id.map(() => recent()));
    const many: PeerId[] = [];
    for(let i = 100; i < 205; ++i) {
      many.push((i as UserId).toPeerId());
      peers.set(many[many.length - 1], {_: 'user', id: i, pFlags: {}, status: {_: 'userStatusRecently', pFlags: {}}} as User.user);
    }

    peers.set(self, {_: 'user', id: self.toUserId(), pFlags: {self: true}, status: {_: 'userStatusRecently', pFlags: {}}} as User.user);
    await manager.pollPeersStories([self, stranger, stranger, channelPeer, ...many]);
    expect(sent.map(({params}) => params.id.length)).toEqual([100, 7]);
    expect(sent[0].params.id.slice(0, 2)).toEqual([{_: 'inputPeer', peerId: stranger}, {_: 'inputPeer', peerId: channelPeer}]);

    await manager.pollPeersStories([stranger]);
    expect(sent.length).toBe(2);

    vi.useFakeTimers({toFake: ['Date']});
    vi.setSystemTime(Date.now() + PEER_STORIES_POLL_INTERVAL + 1);
    await manager.pollPeersStories([stranger]);
    vi.useRealTimers();
    expect(sent.length).toBe(3);
  });

  it('given anew, reads again the stories held of the peer, and says so', async() => {
    const maxIds: RecentStory[] = [];
    const {manager, peers, dispatchEvent, sent} = withServer((method) => method === 'stories.getPeerMaxIDs' ?
      maxIds :
      {_: 'stories.peerStories', stories: peerStories(stranger, [story(5), story(7)], 5), chats: [], users: []});
    peers.set(stranger, {...peers.get(stranger), stories_max_id: recent(5)} as User.user);
    manager.savePeerStories(peerStories(stranger, [story(5)], 0));

    maxIds.push(recent(7));
    await manager.pollPeersStories([stranger]);
    expect((peers.get(stranger) as User.user).stories_max_id.max_id).toBe(7);
    expect(dispatchEvent).toHaveBeenCalledWith('peer_stories', {peerId: stranger, available: true});

    const result = await manager.getPeerStoriesSegments(stranger);
    expect(sent.map(({method}) => method)).toEqual(['stories.getPeerMaxIDs', 'stories.getPeerStories']);
    expect(result).toEqual([{length: 1, type: 'read'}, {length: 1, type: 'unread'}]);
  });

  it('given anew, keeps among them the stories held whole that the server names by id only', async() => {
    const skipped: StoryItem.storyItemSkipped = {_: 'storyItemSkipped', id: 5, date: 105, expire_date: 2e9, pFlags: {}};
    const {manager, peers} = withServer((method) => method === 'stories.getPeerMaxIDs' ?
      [recent(7)] :
      {_: 'stories.peerStories', stories: peerStories(stranger, [skipped, story(7)], 0), chats: [], users: []});
    peers.set(stranger, {...peers.get(stranger), stories_max_id: recent(5)} as User.user);
    manager.savePeerStories(peerStories(stranger, [story(5)], 0));

    await manager.pollPeersStories([stranger]);
    const result = await manager.getPeerStories(stranger);
    expect(manager.getPeerStoriesCache(stranger).stories).toEqual([5, 7]);
    expect(result.stories.map(({_, id}) => [_, id])).toEqual([['storyItem', 5], ['storyItem', 7]]);
  });

  it('named by id only, of one held whole from elsewhere, leaves them when it expires', () => {
    const {manager} = withServer(() => undefined);
    const cache = manager.getPeerStoriesCache(stranger);
    // * one story read by itself (a link, the profile) is no list's
    manager.saveStoryItems([story(5)], cache);
    manager.savePeerStories(peerStories(stranger, [{_: 'storyItemSkipped', id: 5, date: 105, expire_date: 2e9, pFlags: {}}], 0));
    expect(cache.stories).toEqual([5]);

    vi.useFakeTimers({toFake: ['Date']});
    vi.setSystemTime(2e12 + 1000);
    (manager as any).checkExpired();
    vi.useRealTimers();
    expect(cache.stories).toEqual([]);
  });

  it('given anew while they are being read, has them read again, and what was on its way is not kept', async() => {
    const answers: ((stories: StoryItem[]) => void)[] = [];
    const {manager, peers, sent} = withServer((method) => method === 'stories.getPeerMaxIDs' ?
      [recent(7)] :
      new Promise((resolve) => answers.push((stories) => resolve({_: 'stories.peerStories', stories: peerStories(stranger, stories, 0), chats: [], users: []}))));
    peers.set(stranger, {...peers.get(stranger), stories_max_id: recent(5)} as User.user);
    const before = manager.getPeerStories(stranger);
    await manager.pollPeersStories([stranger]);
    // * the avatars, told of the new story, ask for the stories again
    const after = manager.getPeerStories(stranger);
    await vi.waitFor(() => expect(answers.length).toBe(2));

    answers[0]([story(5)]);
    answers[1]([story(5), story(7)]);
    expect((await before).stories.map(({id}) => id)).toEqual([5, 7]);
    expect((await after).stories.map(({id}) => id)).toEqual([5, 7]);
    expect(manager.getPeerStoriesCache(stranger).stories).toEqual([5, 7]);
    expect(sent.map(({method}) => method)).toEqual(['stories.getPeerStories', 'stories.getPeerMaxIDs', 'stories.getPeerStories']);
  });

  it('given as the peer already has it, still reads again the stories held that are older', async() => {
    const {manager, peers, sent, dispatchEvent} = withServer((method) => method === 'stories.getPeerMaxIDs' ?
      [recent(7)] :
      {_: 'stories.peerStories', stories: peerStories(stranger, [story(5), story(7)], 0), chats: [], users: []});
    manager.savePeerStories(peerStories(stranger, [story(5)], 0));
    // * a profile told of story 7 meanwhile, without the stories being read again
    const told = {...peers.get(stranger), stories_max_id: recent(7)} as User.user;
    peers.set(stranger, told);

    await manager.pollPeersStories([stranger]);
    expect(peers.get(stranger)).toBe(told);
    expect(dispatchEvent).toHaveBeenCalledWith('peer_stories', {peerId: stranger, available: true});
    const result = await manager.getPeerStories(stranger);
    expect(result.stories.map(({id}) => id)).toEqual([5, 7]);
    expect(sent.map(({method}) => method)).toEqual(['stories.getPeerMaxIDs', 'stories.getPeerStories']);
  });

  it('given as none to a question asked before the stories were read, takes nothing away', async() => {
    let answerPoll: (recentStories: RecentStory[]) => void;
    const {manager, peers} = withServer((method) => method === 'stories.getPeerMaxIDs' ?
      new Promise((resolve) => answerPoll = resolve) :
      {_: 'stories.peerStories', stories: peerStories(stranger, [story(5)], 0), chats: [], users: []});
    peers.set(stranger, {...peers.get(stranger), stories_max_id: recent(5)} as User.user);
    const polled = manager.pollPeersStories([stranger]);
    await manager.getPeerStories(stranger);

    answerPoll([recent()]);
    await polled;
    expect(manager.getPeerStoriesCache(stranger).stories).toEqual([5]);
    expect((peers.get(stranger) as User.user).stories_max_id.max_id).toBe(5);
  });

  it('as the feed has them, asked before a poll found them changed, are not taken for them', async() => {
    let answerFeed: () => void;
    const {manager} = withServer((method) => {
      if(method === 'stories.getPeerMaxIDs') return [recent(7)];
      if(method === 'stories.getAllReadPeerStories') return {_: 'updates', updates: [], users: [], chats: [], date: 0, seq: 0};
      // * the stories read again once the poll has found them changed are still on their way
      if(method === 'stories.getPeerStories') return new Promise(noop);
      return new Promise((resolve) => answerFeed = () => resolve({
        _: 'stories.allStories', pFlags: {}, count: 1, state: 's', peer_stories: [peerStories(stranger, [story(5)], 0)],
        chats: [], users: [], stealth_mode: {_: 'storiesStealthMode'}
      }));
    });
    manager.savePeerStories(peerStories(stranger, [story(5)], 0));
    const feed = manager.getAllStories();
    await manager.pollPeersStories([stranger]);
    expect(manager.getPeerStoriesCache(stranger).loaded).toBe(false);

    answerFeed();
    await feed;
    expect(manager.getPeerStoriesCache(stranger).loaded).toBe(false);
  });

  it('given as none, takes them away without asking the server again, from an open viewer too', async() => {
    const {manager, peers, sent, dispatchEvent} = withServer(() => [recent()]);
    peers.set(stranger, {...peers.get(stranger), stories_max_id: recent(5)} as User.user);
    manager.savePeerStories(peerStories(stranger, [story(5)], 0));

    await manager.pollPeersStories([stranger]);
    const peer = peers.get(stranger) as User.user;
    expect(peer.stories_max_id).toBeUndefined();
    expect(peer.pFlags.stories_unavailable).toBe(true);
    expect(manager.getPeerStoriesSegments(stranger)).toBeUndefined();
    expect(sent.length).toBe(1);
    expect(dispatchEvent).toHaveBeenCalledWith('story_expired', {peerId: stranger, id: 5});
  });

  it('given anew, takes from an open viewer those no longer there and tells it of those there are', async() => {
    const {manager, peers, dispatchEvent} = withServer((method) => method === 'stories.getPeerMaxIDs' ?
      [recent(7)] :
      {_: 'stories.peerStories', stories: peerStories(stranger, [story(5), story(7)], 0), chats: [], users: []});
    peers.set(stranger, {...peers.get(stranger), stories_max_id: recent(5)} as User.user);
    manager.savePeerStories(peerStories(stranger, [story(3), story(5)], 0));

    await manager.pollPeersStories([stranger]);
    await vi.waitFor(() => expect(dispatchEvent).toHaveBeenCalledWith('stories_stories', expect.objectContaining({
      stories: [expect.objectContaining({id: 5}), expect.objectContaining({id: 7})]
    })));
    const expired = dispatchEvent.mock.calls.filter(([type]) => type === 'story_expired');
    expect(expired).toEqual([['story_expired', {peerId: stranger, id: 3}]]);
    // * at their expiry, the one already taken away is not told of again
    vi.useFakeTimers({toFake: ['Date']});
    vi.setSystemTime(2e12 + 1000);
    (manager as any).checkExpired();
    vi.useRealTimers();
    const expiredIds = dispatchEvent.mock.calls.filter(([type]) => type === 'story_expired').map(([, data]) => data.id);
    expect(expiredIds.sort((a, b) => a - b)).toEqual([3, 5, 7]);
  });

  it('given as it was, changes nothing', async() => {
    const {manager, peers, dispatchEvent} = withServer(() => [recent(), recent(5)]);
    peers.set(named, {...peers.get(named), stories_max_id: recent(5)} as User.user);
    const before = [peers.get(stranger), peers.get(named)];
    await manager.pollPeersStories([stranger, named]);
    expect([peers.get(stranger), peers.get(named)]).toEqual(before);
    expect(dispatchEvent).not.toHaveBeenCalled();
  });
});
