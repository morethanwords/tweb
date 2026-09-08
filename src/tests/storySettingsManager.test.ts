import {describe, expect, it, vi} from 'vitest';
import AppStoriesManager from '@appManagers/appStoriesManager';
import {AppUsersManager} from '@appManagers/appUsersManager';
import {StorySettings} from '@appManagers/utils/stories/storySettings';
import getStoryPrivacyType from '@appManagers/utils/stories/privacyType';
import {StoryItem} from '@layer';
import '@helpers/peerIdPolyfill';

const self = (1 as UserId).toPeerId();
const alice = (2 as UserId).toPeerId();
const bob = (3 as UserId).toPeerId();
const carol = (4 as UserId).toPeerId();
const channelPeer = (10 as ChatId).toPeerId(true);
const settings = (overrides: Partial<StorySettings> = {}): StorySettings => ({
  privacyType: 'public',
  everyoneExcept: [],
  contactsExcept: [],
  closeFriends: [],
  selectedContacts: [],
  hideFrom: [],
  allowScreenshots: true,
  keepOnPage: true,
  ...overrides
});

function storiesManager() {
  const apiManager = {invokeApi: vi.fn().mockResolvedValue({_: 'updates'}), invokeApiSingle: vi.fn()};
  const appUsersManager = {
    getUserInput: (id: UserId) => ({_: 'inputUser', user_id: id, access_hash: '0'}),
    updateCloseFriends: vi.fn(),
    updateStoryBlockedPeers: vi.fn(),
    getCloseFriends: vi.fn().mockResolvedValue([alice]),
    getStoryBlockedPeerIds: vi.fn().mockResolvedValue([bob])
  };
  const processUpdateMessage = vi.fn();
  const appChatsManager = {
    getChat: vi.fn().mockReturnValue({_: 'channel', pFlags: {}}),
    hasRights: vi.fn().mockReturnValue(false),
    isMegagroup: vi.fn().mockReturnValue(false)
  };
  const togglePinned = vi.fn().mockResolvedValue(undefined);
  const manager = Object.assign(Object.create(AppStoriesManager.prototype), {
    apiManager,
    appUsersManager,
    appPeersManager: {peerId: self, getInputPeerById: (peerId: PeerId) => peerId === self ? {_: 'inputPeerSelf'} : {_: 'inputPeerChannel', channel_id: peerId.toChatId(), access_hash: '0'}},
    appChatsManager,
    togglePinned,
    getStoryByIdCached: () => ({_: 'storyItem', id: 7, pFlags: {out: true}}),
    apiUpdatesManager: {processUpdateMessage},
    getPeerStoriesCache: () => ({}),
    saveStoriesStories: (result: {stories: StoryItem[]}) => result.stories
  }) as AppStoriesManager;
  return {manager, apiManager, appUsersManager, appChatsManager, togglePinned, processUpdateMessage};
}

describe('published story settings', () => {
  it('loads current privacy and independent account lists', async() => {
    const {manager, apiManager} = storiesManager();
    apiManager.invokeApiSingle.mockResolvedValue({stories: [{
      _: 'storyItem', id: 7, pFlags: {contacts: true, noforwards: true},
      privacy: [{_: 'privacyValueDisallowUsers', users: [bob]}, {_: 'privacyValueAllowContacts'}]
    }]});
    expect(await manager.getStorySettings(self, 7)).toEqual(settings({
      privacyType: 'contacts', contactsExcept: [bob], closeFriends: [alice], hideFrom: [bob],
      allowScreenshots: false, keepOnPage: false
    }));
    expect(apiManager.invokeApiSingle).toHaveBeenCalledWith('stories.getStoriesByID', {peer: {_: 'inputPeerSelf'}, id: [7]});
  });

  it.each([
    ['public', 'everyoneExcept', 'inputPrivacyValueAllowAll'],
    ['contacts', 'contactsExcept', 'inputPrivacyValueAllowContacts']
  ] as const)('places %s exclusions before the audience rule', async(privacyType, key, baseRule) => {
    const {manager, apiManager, processUpdateMessage} = storiesManager();
    await manager.saveStorySettings(self, 7, settings({privacyType, [key]: [alice]}), settings());
    const params = apiManager.invokeApi.mock.calls[0][1];
    expect(params).toEqual({
      peer: {_: 'inputPeerSelf'}, id: 7,
      privacy_rules: [
        {_: 'inputPrivacyValueDisallowUsers', users: [{_: 'inputUser', user_id: alice, access_hash: '0'}]},
        {_: baseRule}
      ]
    });
    expect(processUpdateMessage).toHaveBeenCalledWith({_: 'updates'});
  });

  it('keeps an empty selected audience private and supports close friends', async() => {
    const {manager, apiManager} = storiesManager();
    await manager.saveStorySettings(self, 7, settings({privacyType: 'selected'}), settings());
    expect(apiManager.invokeApi.mock.calls[0][1].privacy_rules).toEqual([{_: 'inputPrivacyValueAllowUsers', users: []}]);
    await manager.saveStorySettings(self, 7, settings({privacyType: 'close'}), settings());
    expect(apiManager.invokeApi.mock.calls[1][1].privacy_rules).toEqual([{_: 'inputPrivacyValueAllowCloseFriends'}]);
  });

  it('saves account-list deltas without rewriting unchanged story privacy', async() => {
    const {manager, apiManager, appUsersManager} = storiesManager();
    await manager.saveStorySettings(self, 7, settings({closeFriends: [bob], hideFrom: [carol]}), settings({closeFriends: [alice], hideFrom: [bob]}));
    expect(appUsersManager.updateCloseFriends).toHaveBeenCalledWith([bob], [alice]);
    expect(appUsersManager.updateStoryBlockedPeers).toHaveBeenCalledWith([carol], [bob]);
    expect(apiManager.invokeApi).not.toHaveBeenCalled();
  });

  it('rejects other owners before making requests', async() => {
    const {manager, apiManager, appUsersManager} = storiesManager();
    await expect(manager.getStorySettings(alice, 7)).rejects.toThrow('STORY_EDIT_FORBIDDEN');
    await expect(manager.saveStorySettings(alice, 7, settings(), settings())).rejects.toThrow('STORY_EDIT_FORBIDDEN');
    expect(apiManager.invokeApiSingle).not.toHaveBeenCalled();
    expect(appUsersManager.updateCloseFriends).not.toHaveBeenCalled();
  });

  it('accepts STORY_NOT_MODIFIED and reports confirmed writes on failure', async() => {
    const {manager, apiManager} = storiesManager();
    apiManager.invokeApi.mockRejectedValueOnce({type: 'STORY_NOT_MODIFIED'}).mockRejectedValueOnce({type: 'NETWORK_BAD_RESPONSE'});
    await expect(manager.saveStorySettings(self, 7, settings({privacyType: 'close'}), settings())).resolves.toMatchObject({saved: true});
    await expect(manager.saveStorySettings(self, 7, settings({privacyType: 'close'}), settings())).resolves.toEqual({saved: false, applied: {closeFriends: [], hideFrom: []}});
  });

  it('allows undoing a list change after a later save step fails', async() => {
    const {manager, appUsersManager} = storiesManager();
    const baseline = settings({closeFriends: [alice]});
    appUsersManager.updateStoryBlockedPeers.mockRejectedValueOnce(new Error('network'));
    const result = await manager.saveStorySettings(self, 7, settings({closeFriends: [bob], hideFrom: [carol]}), baseline);
    expect(result).toEqual({saved: false, applied: {closeFriends: [bob]}});
    Object.assign(baseline, result.applied);
    await manager.saveStorySettings(self, 7, settings({closeFriends: [alice]}), baseline);
    expect(appUsersManager.updateCloseFriends).toHaveBeenLastCalledWith([alice], [bob]);
  });

  it('serializes saves across stories and continues after failures', async() => {
    const {manager, appUsersManager} = storiesManager();
    let release: () => void;
    appUsersManager.updateCloseFriends.mockImplementationOnce(() => new Promise<void>((resolve) => release = resolve));
    const first = manager.saveStorySettings(self, 7, settings({closeFriends: [alice]}), settings());
    const second = manager.saveStorySettings(self, 8, settings({closeFriends: [bob]}), settings());
    await Promise.resolve();
    expect(appUsersManager.updateCloseFriends).toHaveBeenCalledTimes(1);
    appUsersManager.updateStoryBlockedPeers.mockRejectedValueOnce(new Error('network'));
    release();
    expect((await first).saved).toBe(false);
    expect((await second).saved).toBe(true);
    expect(appUsersManager.updateCloseFriends).toHaveBeenCalledTimes(2);
  });

  it('reads public and close-friends rules when story flags are absent', () => {
    expect(getStoryPrivacyType({pFlags: {}, privacy: [{_: 'privacyValueAllowAll'}]} as StoryItem.storyItem)).toBe('public');
    expect(getStoryPrivacyType({pFlags: {}, privacy: [{_: 'privacyValueAllowCloseFriends'}]} as StoryItem.storyItem)).toBe('close');
  });
});

describe('channel and group story settings', () => {
  it.each(['channel', 'group'] as const)('loads a %s story without personal privacy or account-list requests', async(peerType) => {
    const {manager, apiManager, appChatsManager, appUsersManager} = storiesManager();
    appChatsManager.isMegagroup.mockReturnValue(peerType === 'group');
    appChatsManager.hasRights.mockImplementation((_id, right) => right === 'edit_stories');
    apiManager.invokeApiSingle.mockResolvedValue({stories: [{
      _: 'storyItem', id: 7, pFlags: {pinned: true, noforwards: true}
    }]});

    expect(await manager.getStorySettings(channelPeer, 7)).toEqual(settings({peerType, allowScreenshots: false}));
    expect(apiManager.invokeApiSingle).toHaveBeenCalledWith('stories.getStoriesByID', {
      peer: {_: 'inputPeerChannel', channel_id: 10, access_hash: '0'}, id: [7]
    });
    expect(appUsersManager.getCloseFriends).not.toHaveBeenCalled();
    expect(appUsersManager.getStoryBlockedPeerIds).not.toHaveBeenCalled();
  });

  it('uses pin rights even for a story posted by the current administrator', async() => {
    const {manager, appChatsManager, apiManager, togglePinned} = storiesManager();
    appChatsManager.hasRights.mockImplementation((_id, right) => right === 'post_stories');
    expect(manager.hasRights(channelPeer, 7, 'edit')).toBe(true);
    expect(manager.canEditStorySettings(channelPeer, 7)).toBe(false);
    await expect(manager.getStorySettings(channelPeer, 7)).rejects.toThrow('STORY_EDIT_FORBIDDEN');
    await expect(manager.saveStorySettings(channelPeer, 7, settings({keepOnPage: false}), settings())).rejects.toThrow('STORY_EDIT_FORBIDDEN');
    expect(apiManager.invokeApiSingle).not.toHaveBeenCalled();
    expect(togglePinned).not.toHaveBeenCalled();
  });

  it('saves only profile placement and rechecks revoked rights', async() => {
    const {manager, appChatsManager, appUsersManager, apiManager, togglePinned} = storiesManager();
    appChatsManager.hasRights.mockReturnValue(true);
    const changed = settings({peerType: 'channel', keepOnPage: false, privacyType: 'close', closeFriends: [alice], hideFrom: [bob]});
    await manager.saveStorySettings(channelPeer, 7, changed, settings({peerType: 'channel'}));
    expect(togglePinned).toHaveBeenCalledExactlyOnceWith(channelPeer, 7, false);
    expect(apiManager.invokeApi).not.toHaveBeenCalled();
    expect(appUsersManager.updateCloseFriends).not.toHaveBeenCalled();
    expect(appUsersManager.updateStoryBlockedPeers).not.toHaveBeenCalled();

    appChatsManager.hasRights.mockReturnValue(false);
    await expect(manager.saveStorySettings(channelPeer, 7, changed, settings())).rejects.toThrow('STORY_EDIT_FORBIDDEN');
    expect(togglePinned).toHaveBeenCalledTimes(1);
  });

  it('does not repin an unchanged story and propagates failed pin updates', async() => {
    const {manager, appChatsManager, togglePinned} = storiesManager();
    appChatsManager.hasRights.mockReturnValue(true);
    await manager.saveStorySettings(channelPeer, 7, settings(), settings());
    expect(togglePinned).not.toHaveBeenCalled();
    togglePinned.mockRejectedValueOnce(new Error('network'));
    await expect(manager.saveStorySettings(channelPeer, 7, settings({keepOnPage: false}), settings())).rejects.toThrow('network');
  });

  it('rejects basic groups and handles an uncached story when checking pin rights', () => {
    const {manager, appChatsManager} = storiesManager();
    appChatsManager.hasRights.mockReturnValue(true);
    Object.assign(manager, {getStoryByIdCached: (): undefined => undefined});
    expect(manager.canEditStorySettings(channelPeer, 7)).toBe(true);
    appChatsManager.getChat.mockReturnValue({_: 'chat', pFlags: {}});
    expect(manager.canEditStorySettings(channelPeer, 7)).toBe(false);
  });
});

describe('story account lists', () => {
  it('updates close-friend flags only after the server accepts the list', async() => {
    const users = new Map([
      [alice, {_: 'user', id: alice, pFlags: {close_friend: true}}],
      [bob, {_: 'user', id: bob, pFlags: {close_friend: false}}],
      [carol, {_: 'user', id: carol, pFlags: {close_friend: true}}]
    ]);
    const invokeApi = vi.fn().mockResolvedValue(true);
    const saveApiUser = vi.fn((user) => users.set(user.id, user));
    const manager = Object.assign(Object.create(AppUsersManager.prototype), {
      getContacts: async() => [...users.keys()], getUser: (id: PeerId) => users.get(id),
      apiManager: {invokeApi}, saveApiUser
    }) as AppUsersManager;
    await manager.updateCloseFriends([bob], [alice]);
    expect(invokeApi).toHaveBeenCalledWith('contacts.editCloseFriends', {id: [carol, bob]});
    expect(users.get(alice).pFlags.close_friend).toBeUndefined();
    expect(users.get(bob).pFlags.close_friend).toBe(true);
    expect(users.get(carol).pFlags.close_friend).toBe(true);

    saveApiUser.mockClear();
    invokeApi.mockRejectedValueOnce(new Error('network'));
    await expect(manager.updateCloseFriends([alice], [bob])).rejects.toThrow('network');
    expect(saveApiUser).not.toHaveBeenCalled();
  });

  it('paginates the story blocklist using blocked entries, not returned peer order', async() => {
    const invokeApiSingle = vi.fn()
    .mockResolvedValueOnce({_: 'contacts.blockedSlice', count: 2, blocked: [{peer_id: {_: 'peerUser', user_id: alice}}], users: [{id: bob}, {id: alice}], chats: []})
    .mockResolvedValueOnce({_: 'contacts.blocked', blocked: [{peer_id: {_: 'peerUser', user_id: bob}}], users: [{id: bob}], chats: []});
    const manager = Object.assign(Object.create(AppUsersManager.prototype), {
      apiManager: {invokeApiSingle}, saveApiUsers: vi.fn(), appChatsManager: {saveApiChats: vi.fn()},
      appPeersManager: {getPeerId: (peer: {user_id: UserId}) => peer.user_id.toPeerId()}
    }) as AppUsersManager;
    expect(await manager.getStoryBlockedPeerIds()).toEqual([alice, bob]);
    expect(invokeApiSingle.mock.calls.map(([, params]) => params)).toEqual([
      {offset: 0, limit: 100, my_stories_from: true}, {offset: 1, limit: 100, my_stories_from: true}
    ]);
  });

  it('merges blocklist changes and preserves the regular message-block flag', async() => {
    const full = {pFlags: {blocked: true, blocked_my_stories_from: true}};
    const invokeApi = vi.fn().mockResolvedValue(true);
    const manager = Object.assign(Object.create(AppUsersManager.prototype), {
      getStoryBlockedPeerIds: async() => [alice, carol], apiManager: {invokeApi},
      appPeersManager: {getInputPeerById: (peerId: PeerId) => ({_: 'inputPeerUser', user_id: peerId, access_hash: '0'})},
      appProfileManager: {modifyCachedFullUser: (_id: UserId, modify: (user: typeof full) => void) => modify(full)}
    }) as AppUsersManager;
    await manager.updateStoryBlockedPeers([bob], [alice]);
    expect(invokeApi).toHaveBeenCalledWith('contacts.setBlocked', {
      my_stories_from: true, limit: 2,
      id: [carol, bob].map((id) => ({_: 'inputPeerUser', user_id: id, access_hash: '0'}))
    });
    expect(full.pFlags.blocked).toBe(true);
  });
});
