import {describe, expect, it, vi} from 'vitest';
import AppStoriesManager from '@appManagers/appStoriesManager';
import {AppUsersManager} from '@appManagers/appUsersManager';
import {Message, StoryItem} from '@layer';
import '@helpers/peerIdPolyfill';

const self = (1 as UserId).toPeerId();
const alice = (2 as UserId).toPeerId();
const channelPeer = (10 as ChatId).toPeerId(true);
const repostPeer = (11 as ChatId).toPeerId(true);
const heart = {_: 'reactionEmoji' as const, emoticon: '❤'};

const peerOf = (peerId: PeerId) => peerId.isUser() ?
  {_: 'peerUser' as const, user_id: peerId.toUserId()} :
  {_: 'peerChannel' as const, channel_id: peerId.toChatId()};

const repostStory: StoryItem.storyItem = {_: 'storyItem', id: 5, date: 100, expire_date: 200, pFlags: {}, caption: 'look'} as StoryItem.storyItem;
const forwardMessage = {_: 'message', id: 3, date: 150, pFlags: {}} as Message.message;

function storiesManager(response: any) {
  const invokeApiSingleProcess = vi.fn(({processResult}: {method: string, params: any, processResult: (result: any) => any}) => processResult(response));
  const saveApiPeers = vi.fn();
  const saveStoryItem = vi.fn((story: StoryItem, _cache: object) => story._ === 'storyItem' ? story : undefined);
  const caches = new Map<PeerId, object>();
  const manager = Object.assign(Object.create(AppStoriesManager.prototype), {
    apiManager: {invokeApiSingleProcess},
    appPeersManager: {
      peerId: self,
      getInputPeerById: (peerId: PeerId) => ({_: 'inputPeer', peerId}),
      getPeerId: (peer: any) => peer.user_id ? (peer.user_id as UserId).toPeerId() : (peer.channel_id as ChatId).toPeerId(true),
      saveApiPeers
    },
    appMessagesManager: {
      saveMessage: (message: Message) => message._ === 'message' ? {...message, peerId: channelPeer, mid: 77} : message
    },
    appChatsManager: {hasRights: vi.fn((chatId: ChatId, right: string) => right === 'edit_stories' && chatId === channelPeer.toChatId())},
    getPeerStoriesCache: (peerId: PeerId) => {
      if(!caches.has(peerId)) caches.set(peerId, {peerId});
      return caches.get(peerId);
    },
    saveStoryItem
  }) as AppStoriesManager;
  return {manager, invokeApiSingleProcess, saveApiPeers, saveStoryItem, caches};
}

describe('the views list of one\'s own story', () => {
  it('asks for the tab, order, search and page chosen', async() => {
    const {manager, invokeApiSingleProcess} = storiesManager({_: 'stories.storyViewsList', count: 0, views_count: 0, forwards_count: 0, reactions_count: 0, views: [], chats: [], users: []});
    await manager.getStoryViewsList(self, 7, {limit: 50, offset: '20', q: 'al', justContacts: true, reactionsFirst: true});
    expect(invokeApiSingleProcess.mock.calls[0][0]).toMatchObject({
      method: 'stories.getStoryViewsList',
      params: {peer: {_: 'inputPeer', peerId: self}, id: 7, limit: 50, offset: '20', q: 'al', just_contacts: true, reactions_first: true}
    });

    await manager.getStoryViewsList(self, 7, {limit: 50});
    expect(invokeApiSingleProcess.mock.calls[1][0].params).toEqual({
      peer: {_: 'inputPeer', peerId: self}, id: 7, limit: 50, offset: '', q: undefined, just_contacts: undefined, reactions_first: undefined
    });
  });

  it('keeps reposts and forwards beside the views, each with what it is', async() => {
    const {manager, saveApiPeers, saveStoryItem, caches} = storiesManager({
      _: 'stories.storyViewsList',
      count: 4,
      views_count: 9,
      forwards_count: 2,
      reactions_count: 1,
      views: [
        {_: 'storyView', pFlags: {blocked_my_stories_from: true}, user_id: alice.toUserId(), date: 300, reaction: heart},
        {_: 'storyViewPublicRepost', pFlags: {}, peer_id: peerOf(repostPeer), story: repostStory},
        {_: 'storyViewPublicForward', pFlags: {}, message: forwardMessage},
        // * a repost of a story since deleted is no line of the list
        {_: 'storyViewPublicRepost', pFlags: {}, peer_id: peerOf(repostPeer), story: {_: 'storyItemDeleted', id: 6}}
      ],
      chats: [],
      users: [],
      next_offset: 'next'
    });

    const result = await manager.getStoryViewsList(self, 7, {limit: 50});
    expect(saveApiPeers).toHaveBeenCalled();
    expect(saveStoryItem.mock.calls[0][1]).toBe(caches.get(repostPeer));
    expect(result).toEqual({
      count: 4,
      viewsCount: 9,
      nextOffset: 'next',
      items: [
        {_: 'view', peerId: alice, date: 300, reaction: heart, blocked: false, blockedMyStoriesFrom: true},
        {_: 'repost', peerId: repostPeer, date: 100, story: repostStory},
        {_: 'forward', peerId: channelPeer, date: 150, message: {...forwardMessage, peerId: channelPeer, mid: 77}}
      ]
    });
  });
});

describe('the reactions list of a channel\'s story', () => {
  it('asks for reposts first and leaves out an offset it has none of', async() => {
    const {manager, invokeApiSingleProcess} = storiesManager({_: 'stories.storyReactionsList', count: 0, reactions: [], chats: [], users: []});
    await manager.getStoryReactionsList(channelPeer, 7, {limit: 50, forwardsFirst: true});
    expect(invokeApiSingleProcess.mock.calls[0][0]).toMatchObject({
      method: 'stories.getStoryReactionsList',
      params: {peer: {_: 'inputPeer', peerId: channelPeer}, id: 7, limit: 50, offset: undefined, forwards_first: true}
    });
  });

  it('lists who reacted, reposted and forwarded', async() => {
    const {manager} = storiesManager({
      _: 'stories.storyReactionsList',
      count: 3,
      reactions: [
        {_: 'storyReaction', peer_id: peerOf(alice), date: 300, reaction: heart},
        {_: 'storyReactionPublicRepost', peer_id: peerOf(repostPeer), story: repostStory},
        {_: 'storyReactionPublicForward', message: forwardMessage}
      ],
      chats: [],
      users: []
    });

    const result = await manager.getStoryReactionsList(channelPeer, 7, {limit: 50});
    expect(result.items.map((item) => [item._, item.peerId])).toEqual([['view', alice], ['repost', repostPeer], ['forward', channelPeer]]);
    expect(result.items[0]).toEqual({_: 'view', peerId: alice, date: 300, reaction: heart});
  });
});

describe('who sees the list', () => {
  it('is the owner of a person\'s story, and the admins who edit a channel\'s stories', () => {
    const {manager} = storiesManager(undefined);
    expect(manager.canViewStoryInteractions(self)).toBe(true);
    expect(manager.canViewStoryInteractions(alice)).toBe(false);
    expect(manager.canViewStoryInteractions(channelPeer)).toBe(true);
    expect(manager.canViewStoryInteractions(repostPeer)).toBe(false);
  });
});

describe('hiding one\'s stories from a viewer', () => {
  function usersManager(blocked?: true) {
    const processLocalUpdate = vi.fn();
    const manager = Object.assign(Object.create(AppUsersManager.prototype), {
      apiManager: {invokeApiSingle: vi.fn().mockResolvedValue(true)},
      appPeersManager: {
        getInputPeerById: (peerId: PeerId) => ({_: 'inputPeer', peerId}),
        getOutputPeer: (peerId: PeerId) => peerOf(peerId)
      },
      apiUpdatesManager: {processLocalUpdate},
      appProfileManager: {
        getCachedFullUser: () => ({pFlags: {blocked}}),
        refreshPeerSettingsIfNeeded: vi.fn()
      }
    }) as AppUsersManager;
    return {manager, processLocalUpdate};
  }

  it('leaves the messages blocklist as the profile knew it', async() => {
    const {manager, processLocalUpdate} = usersManager();
    await manager.toggleBlock(alice, true, true);
    expect((manager as any).apiManager.invokeApiSingle).toHaveBeenCalledWith('contacts.block', {id: {_: 'inputPeer', peerId: alice}, my_stories_from: true});
    expect(processLocalUpdate.mock.calls[0][0].pFlags).toEqual({blocked: undefined, blocked_my_stories_from: true});

    const blocked = usersManager(true);
    await blocked.manager.toggleBlock(alice, false, true);
    expect(blocked.processLocalUpdate.mock.calls[0][0].pFlags).toEqual({blocked: true, blocked_my_stories_from: undefined});
  });

  it('blocks messages as before', async() => {
    const {manager, processLocalUpdate} = usersManager();
    await manager.toggleBlock(alice, true);
    expect(processLocalUpdate.mock.calls[0][0].pFlags).toEqual({blocked: true, blocked_my_stories_from: undefined});
  });
});
