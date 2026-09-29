import {AppNotificationsManager} from '@appManagers/appNotificationsManager';
import {AppUsersManager} from '@appManagers/appUsersManager';
import {PeerNotifySettings} from '@layer';
import '@helpers/peerIdPolyfill';

const userPeerId = (100 as UserId).toPeerId(false);
const channelPeerId = (300 as ChatId).toPeerId(true);

function createManager(options: {
  peer?: {[peerId: PeerId]: Partial<PeerNotifySettings>},
  users?: Partial<PeerNotifySettings>,
  community?: Partial<PeerNotifySettings>,
  topPeerIds?: PeerId[],
  topPeersError?: boolean
}) {
  const manager = new AppNotificationsManager();
  const getTopPeers = vi.fn(() => options.topPeersError ?
    Promise.reject(new Error('FLOOD')) :
    Promise.resolve((options.topPeerIds || []).map((id, index) => ({id, rating: 100 - index}))));
  const updateNotifySettings = vi.fn();
  const generateLocalNotifySettingsUpdate = vi.fn();
  Object.assign(manager as any, {
    appPeersManager: {
      getInputPeerById: (peerId: PeerId) => ({_: 'inputPeerMock', peerId}),
      getPeerId: (inputPeer: any) => inputPeer.peerId
    },
    appChatsManager: {
      getChat: () => ({_: 'channel', linked_community_id: options.community ? 200 : undefined})
    },
    appUsersManager: {getTopPeers},
    appMessagesIdsManager: {generateMessageId: (serverId: number) => serverId},
    updateNotifySettings,
    generateLocalNotifySettingsUpdate
  });

  const notifyPeer: {[peerId: PeerId]: PeerNotifySettings} = {};
  for(const peerId of [userPeerId, channelPeerId]) {
    notifyPeer[peerId] = {_: 'peerNotifySettings', ...options.peer?.[peerId]};
  }

  Object.assign((manager as any).peerSettings, {
    notifyPeer,
    notifyForumTopic: {[channelPeerId + '_' + 7]: {_: 'peerNotifySettings', silent: true, mute_until: 0}},
    notifyCommunity: options.community ? {200: {_: 'peerNotifySettings', ...options.community}} : {},
    notifyUsers: {_: 'peerNotifySettings', mute_until: 0, show_previews: true, ...options.users},
    notifyBroadcasts: {_: 'peerNotifySettings', stories_muted: false}
  });

  return {manager, getTopPeers, updateNotifySettings, generateLocalNotifySettingsUpdate};
}

describe('stories notifications mute', () => {
  test('the peer\'s own choice wins over the global one and the top peers', async() => {
    const {manager} = createManager({
      peer: {[userPeerId]: {stories_muted: false}, [channelPeerId]: {stories_muted: true}},
      users: {stories_muted: true},
      topPeerIds: [channelPeerId]
    });

    expect(await manager.isPeerStoriesMuted(userPeerId)).toBe(false);
    expect(await manager.isPeerStoriesMuted(channelPeerId)).toBe(true);
  });

  test('the private chats setting applies to every peer, channels included', async() => {
    const {manager, getTopPeers} = createManager({users: {stories_muted: false}});

    expect(await manager.isPeerStoriesMuted(userPeerId)).toBe(false);
    expect(await manager.isPeerStoriesMuted(channelPeerId)).toBe(false);
    expect(getTopPeers).not.toHaveBeenCalled();

    const {manager: allMuted} = createManager({users: {stories_muted: true}});
    // * notifyBroadcasts.stories_muted = false is not a stories setting and is ignored
    expect(await allMuted.isPeerStoriesMuted(channelPeerId)).toBe(true);
  });

  test('with nothing set only the top 5 correspondents notify', async() => {
    const others = [1, 2, 3, 4].map((id) => (id as UserId).toPeerId(false));
    const {manager} = createManager({topPeerIds: [...others, userPeerId]});
    expect(await manager.isPeerStoriesMuted(userPeerId)).toBe(false);
    expect(await manager.isPeerStoriesMuted(channelPeerId)).toBe(true);

    const {manager: sixth} = createManager({topPeerIds: [...others, (5 as UserId).toPeerId(false), userPeerId]});
    expect(await sixth.isPeerStoriesMuted(userPeerId)).toBe(true);

    const {manager: failed} = createManager({topPeersError: true});
    expect(await failed.isPeerStoriesMuted(userPeerId)).toBe(true);
  });

  test('a channel in a Community inherits its choice before the global one', async() => {
    const {manager} = createManager({community: {stories_muted: true}, users: {stories_muted: false}});

    expect(await manager.isPeerStoriesMuted(channelPeerId)).toBe(true);
  });

  test('toggling sends the peer\'s own settings with an explicit choice', async() => {
    const {manager, updateNotifySettings, generateLocalNotifySettingsUpdate} = createManager({
      peer: {[userPeerId]: {mute_until: 0, show_previews: false}},
      users: {mute_until: 2147483647, silent: true}
    });

    await manager.toggleStoriesMute(userPeerId, false);
    // * no global mute_until/silent leaks into the peer's exception
    expect(updateNotifySettings.mock.calls[0][1]).toEqual({
      _: 'inputPeerNotifySettings',
      mute_until: 0,
      show_previews: false,
      stories_muted: false
    });

    await manager.toggleStoriesMute(userPeerId, true);
    expect(updateNotifySettings.mock.calls[1][1].stories_muted).toBe(true);

    await manager.toggleStoriesMute(userPeerId, undefined, true);
    expect(generateLocalNotifySettingsUpdate.mock.calls[0][1]).not.toHaveProperty('stories_muted');
  });

  test('muting a chat, a topic or a Community keeps the rest of its own settings', async() => {
    const {manager, updateNotifySettings} = createManager({
      peer: {[userPeerId]: {mute_until: 0, show_previews: false, stories_muted: true}},
      community: {mute_until: 0, stories_hide_sender: true},
      users: {mute_until: 0, silent: true, stories_muted: false}
    });

    await manager.editNotifySettings({_: 'inputNotifyPeer', peer: {_: 'inputPeerMock', peerId: userPeerId} as any}, {mute_until: 2147483647});
    // * the hidden peer's stories stay muted, nothing global leaks in
    expect(updateNotifySettings.mock.calls[0][1]).toEqual({
      _: 'inputPeerNotifySettings',
      mute_until: 2147483647,
      show_previews: false,
      stories_muted: true
    });

    await manager.editNotifySettings({
      _: 'inputNotifyForumTopic',
      peer: {_: 'inputPeerMock', peerId: channelPeerId} as any,
      top_msg_id: 7
    }, {mute_until: 2147483647});
    expect(updateNotifySettings.mock.calls[1][1]).toEqual({
      _: 'inputPeerNotifySettings',
      silent: true,
      mute_until: 2147483647
    });

    await manager.editNotifySettings({_: 'inputNotifyCommunity', community: {_: 'inputChannel', channel_id: 200} as any}, {mute_until: 100});
    expect(updateNotifySettings.mock.calls[2][1]).toEqual({
      _: 'inputPeerNotifySettings',
      mute_until: 100,
      stories_hide_sender: true
    });
  });

  test('the chat\'s sounds travel along as this client\'s ones', async() => {
    const otherSound = {_: 'notificationSoundNone'} as const;
    const storiesOtherSound = {_: 'notificationSoundDefault'} as const;
    const {manager, updateNotifySettings} = createManager({
      peer: {[userPeerId]: {
        ios_sound: {_: 'notificationSoundDefault'},
        other_sound: otherSound,
        stories_other_sound: storiesOtherSound
      }}
    });

    await manager.editNotifySettings({_: 'inputNotifyPeer', peer: {_: 'inputPeerMock', peerId: userPeerId} as any}, {mute_until: 0});
    expect(updateNotifySettings.mock.calls[0][1]).toMatchObject({sound: otherSound, stories_sound: storiesOtherSound});
  });
});

describe('top peers', () => {
  test('a failed request is asked again instead of staying cached', async() => {
    const manager = new AppUsersManager();
    const invokeApi = vi.fn()
    .mockRejectedValueOnce(new Error('FLOOD_WAIT_X'))
    .mockResolvedValueOnce({_: 'contacts.topPeersDisabled'});
    Object.assign(manager as any, {
      getTopPeersPromises: {},
      appStateManager: {getState: () => Promise.resolve({topPeersCache: {}}), pushToState: vi.fn()},
      apiManager: {invokeApi}
    });

    await expect(manager.getTopPeers('correspondents')).rejects.toThrow('FLOOD_WAIT_X');
    await expect(manager.getTopPeers('correspondents')).resolves.toEqual([]);
    expect(invokeApi).toHaveBeenCalledTimes(2);
  });
});
