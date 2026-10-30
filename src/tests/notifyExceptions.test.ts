import {AppNotificationsManager} from '@appManagers/appNotificationsManager';
import {AppProfileManager} from '@appManagers/appProfileManager';
import {AppMessagesManager} from '@appManagers/appMessagesManager';
import ApiManagerMethods from '@appManagers/apiManagerMethods';
import {createDialogsStorage, makeDialog} from '@/tests/helpers/dialogsStorage';
import {PeerNotifySettings, ReactionsNotifySettings} from '@layer';
import '@helpers/peerIdPolyfill';

const MUTE_UNTIL = 2147483647;
const selfPeerId = (1 as UserId).toPeerId(false);
const userPeerId = (100 as UserId).toPeerId(false);
const deletedPeerId = (101 as UserId).toPeerId(false);
const groupPeerId = (200 as ChatId).toPeerId(true);
// * a chat with comment threads, no forum
const discussionPeerId = (201 as ChatId).toPeerId(true);

const outputPeer = (peerId: PeerId) => peerId.isUser() ?
  {_: 'peerUser', user_id: peerId.toUserId()} as const :
  {_: 'peerChat', chat_id: peerId.toChatId()} as const;

const inputNotifyPeer = (peerId: PeerId) => ({_: 'inputNotifyPeer', peer: {_: 'inputPeerMock', peerId}}) as any;
// * every answer already given handed over
const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

function createManager(options: {invokeApi?: (method: string, params: any) => any} = {}) {
  const manager = new AppNotificationsManager();
  const dispatchEvent = vi.fn();
  const saveUpdate = vi.fn((update: any) => (manager as any).onUpdateNotifySettings(update));
  const invokeApi = vi.fn(options.invokeApi || (() => Promise.resolve(true)));
  Object.assign(manager as any, {
    rootScope: {dispatchEvent},
    apiManager: {
      // * the method and its params, as they were passed: the options are the dedup's own
      invokeApi: (...args: any[]) => Promise.resolve((invokeApi as any)(...args.slice(0, 2))),
      // * the real one: a request asked for again while it is on its way joins it
      apiPromisesSingleProcess: {},
      invokeApiSingleProcess: ApiManagerMethods.prototype.invokeApiSingleProcess
    },
    apiUpdatesManager: {saveUpdate, processLocalUpdate: (update: any) => saveUpdate(update)},
    appStateManager: {getState: () => Promise.resolve({notifySettings: {}}), pushToState: vi.fn()},
    appPeersManager: {
      peerId: selfPeerId,
      saveApiPeers: vi.fn(),
      getPeerId: (peer: any) => peer.peerId ?? (peer.user_id ?
        (peer.user_id as UserId).toPeerId(false) :
        (peer.chat_id as ChatId).toPeerId(true)),
      getOutputPeer: outputPeer,
      getInputPeerById: (peerId: PeerId) => ({_: 'inputPeerMock', peerId}),
      getInputNotifyPeerById: ({peerId, ignorePeerId, threadId}: any) => ignorePeerId ?
        {_: peerId.isUser() ? 'inputNotifyUsers' : 'inputNotifyChats'} :
        threadId ?
          {_: 'inputNotifyForumTopic', peer: {_: 'inputPeerMock', peerId}, top_msg_id: threadId} :
          {_: 'inputNotifyPeer', peer: {_: 'inputPeerMock', peerId}},
      isCommunity: () => false,
      isForum: (peerId: PeerId) => peerId !== discussionPeerId,
      isBotforum: () => false
    },
    appUsersManager: {
      getUser: (userId: UserId) => ({_: 'user', id: userId, pFlags: userId === deletedPeerId.toUserId() ? {deleted: true} : {}})
    },
    appChatsManager: {
      getChat: (chatId: ChatId) => ({_: 'chat', id: chatId, pFlags: {}})
    },
    appMessagesIdsManager: {generateMessageId: (serverId: number) => serverId},
    appCommunitiesManager: {saveCommunityNotifySettings: vi.fn()},
    dialogsStorage: {getFolderDialogs: (): any[] => []},
    checkMuteUntilThrottled: vi.fn()
  });

  return {manager, dispatchEvent, saveUpdate, invokeApi};
}

const notifyUpdate = (peerId: PeerId, settings: Partial<PeerNotifySettings>) => ({
  _: 'updateNotifySettings',
  peer: {_: 'notifyPeer', peer: outputPeer(peerId)},
  notify_settings: {_: 'peerNotifySettings', ...settings}
});

const exceptionsEvents = (dispatchEvent: ReturnType<typeof vi.fn>) => {
  return dispatchEvent.mock.calls.filter(([name]) => name === 'notify_exceptions').map(([, event]) => event);
};

describe('notification exceptions', () => {
  test('the type\'s chats with their own mute_until, but neither one\'s own chat nor a deleted account', async() => {
    const later = Math.floor(Date.now() / 1000) + 3600;
    const {manager, invokeApi, saveUpdate} = createManager({
      invokeApi: () => ({
        _: 'updates',
        users: [],
        chats: [],
        updates: [
          notifyUpdate(userPeerId, {mute_until: later}),
          notifyUpdate(selfPeerId, {mute_until: MUTE_UNTIL}),
          notifyUpdate(deletedPeerId, {mute_until: MUTE_UNTIL}),
          notifyUpdate((102 as UserId).toPeerId(false), {mute_until: 0}),
          notifyUpdate((103 as UserId).toPeerId(false), {show_previews: true})
        ]
      })
    });

    const exceptions = await manager.getNotifyExceptions('inputNotifyUsers');
    expect(invokeApi).toHaveBeenCalledWith('account.getNotifyExceptions', {peer: {_: 'inputNotifyUsers'}});
    expect(exceptions).toEqual([
      {peerId: userPeerId, muted: true},
      {peerId: (102 as UserId).toPeerId(false), muted: false}
    ]);
    // * the chats' settings are kept, as the mute state of the chat list reads them, and as updates: their dialogs
    // * take them too
    expect(manager.isPeerLocalMuted({peerId: userPeerId, respectType: false})).toBe(true);
    expect(saveUpdate).toHaveBeenCalledWith(notifyUpdate(userPeerId, {mute_until: later}));
  });

  test('a loaded list follows the chats\' settings: a new one on top, a reset one gone', async() => {
    const {manager, dispatchEvent, saveUpdate} = createManager({
      invokeApi: () => ({_: 'updates', users: [], chats: [], updates: [notifyUpdate(userPeerId, {mute_until: MUTE_UNTIL})]})
    });

    // * nothing is followed before the list is asked for
    saveUpdate(notifyUpdate((104 as UserId).toPeerId(false), {mute_until: MUTE_UNTIL}));
    expect(exceptionsEvents(dispatchEvent)).toEqual([]);

    await manager.getNotifyExceptions('inputNotifyUsers');

    const newPeerId = (105 as UserId).toPeerId(false);
    saveUpdate(notifyUpdate(newPeerId, {mute_until: 0}));
    // * another type's chat leaves this list alone
    saveUpdate(notifyUpdate(groupPeerId, {mute_until: MUTE_UNTIL}));
    saveUpdate(notifyUpdate(userPeerId, {mute_until: 0}));
    saveUpdate(notifyUpdate(newPeerId, {}));

    expect(exceptionsEvents(dispatchEvent)).toEqual([
      {key: 'notifyUsers', exceptions: [{peerId: newPeerId, muted: false}, {peerId: userPeerId, muted: true}]},
      {key: 'notifyUsers', exceptions: [{peerId: newPeerId, muted: false}, {peerId: userPeerId, muted: false}]},
      {key: 'notifyUsers', exceptions: [{peerId: userPeerId, muted: false}]}
    ]);
  });

  test('removing exceptions hands the chats their type\'s settings back', async() => {
    const {manager, invokeApi} = createManager();
    await manager.resetPeersNotifySettings([userPeerId, groupPeerId]);

    expect(invokeApi.mock.calls).toEqual([
      ['account.updateNotifySettings', {peer: {_: 'inputNotifyPeer', peer: {_: 'inputPeerMock', peerId: userPeerId}}, settings: {_: 'inputPeerNotifySettings'}}],
      ['account.updateNotifySettings', {peer: {_: 'inputNotifyPeer', peer: {_: 'inputPeerMock', peerId: groupPeerId}}, settings: {_: 'inputPeerNotifySettings'}}]
    ]);
  });
});

test('an answer that holds chats of every type keeps only the asked type\'s', async() => {
  const {manager} = createManager({
    invokeApi: () => ({
      _: 'updates',
      users: [],
      chats: [],
      updates: [
        notifyUpdate(userPeerId, {mute_until: MUTE_UNTIL}),
        notifyUpdate(groupPeerId, {mute_until: MUTE_UNTIL})
      ]
    })
  });

  expect((await manager.getNotifyExceptions('inputNotifyUsers')).map((e) => e.peerId)).toEqual([userPeerId]);
  expect((await manager.getNotifyExceptions('inputNotifyChats')).map((e) => e.peerId)).toEqual([groupPeerId]);
});

const reactionsFromAll: ReactionsNotifySettings = {
  _: 'reactionsNotifySettings',
  messages_notify_from: {_: 'reactionNotificationsFromAll'},
  sound: {_: 'notificationSoundDefault'},
  show_previews: true
};

/**
 * The server: until a reset goes through, muted chats with no sound, an exception, no contact sign-ups and reactions
 * from everyone; the defaults after it. What reaches it before is answered in its own time: as the test releases it
 */
const withServer = () => {
  let reset = false;
  const answer = (method: string, params: any): any => {
    switch(method) {
      case 'account.getNotifyExceptions':
        return {_: 'updates', users: [], chats: [], updates: reset ? [] : [notifyUpdate(userPeerId, {mute_until: MUTE_UNTIL})]};
      case 'account.getNotifySettings':
        return reset ?
          {_: 'peerNotifySettings'} :
          {_: 'peerNotifySettings', mute_until: MUTE_UNTIL, other_sound: {_: 'notificationSoundNone'}};
      case 'account.getContactSignUpNotification':
        return !reset;
      case 'account.getReactionsNotifySettings':
        return reset ? {_: 'reactionsNotifySettings'} : reactionsFromAll;
      case 'account.setReactionsNotifySettings':
        return params.settings;
      default:
        return true;
    }
  };

  const held: {method: string, release: () => void}[] = [];
  const created = createManager({
    invokeApi: (method, params) => {
      const result = answer(method, params);
      return reset ? result : new Promise((resolve) => held.push({method, release: () => {
        if(method === 'account.resetNotifySettings') reset = true;
        resolve(result);
      }}));
    }
  });

  return {
    ...created,
    release: (method: string) => held.splice(held.findIndex((request) => request.method === method), 1)[0].release(),
    releaseAll: () => held.splice(0).forEach((request) => request.release())
  };
};

describe('reset all notifications', () => {
  test('drops every own setting, asks the types\' anew and tells whatever shows them', async() => {
    const usersDefaults = {_: 'peerNotifySettings', show_previews: true} as const;
    const {manager, dispatchEvent, saveUpdate, invokeApi} = createManager({
      invokeApi: (method, params) => {
        if(method === 'account.getNotifyExceptions') {
          return {_: 'updates', users: [], chats: [], updates: [notifyUpdate(userPeerId, {mute_until: MUTE_UNTIL})]};
        }

        if(method === 'account.getNotifySettings') {
          return params.peer._ === 'inputNotifyUsers' ? usersDefaults : {_: 'peerNotifySettings'};
        }

        return true;
      }
    });

    await manager.getNotifyExceptions('inputNotifyUsers');
    const pending = new Promise<PeerNotifySettings>(() => {});
    Object.assign((manager as any).peerSettings, {
      notifyPeer: {
        ...(manager as any).peerSettings.notifyPeer,
        [groupPeerId]: {_: 'peerNotifySettings'},
        [(106 as UserId).toPeerId(false)]: pending
      },
      notifyForumTopic: {[groupPeerId + '_7']: {_: 'peerNotifySettings', mute_until: MUTE_UNTIL}},
      notifyCommunity: {300: {_: 'peerNotifySettings', mute_until: MUTE_UNTIL}}
    });
    (manager as any).notifyContactsSignUp = Promise.resolve(false);
    (manager as any).reactionsNotifySettings = {_: 'reactionsNotifySettings'};
    saveUpdate.mockClear();
    dispatchEvent.mockClear();

    await manager.resetNotifySettings();

    expect(invokeApi).toHaveBeenCalledWith('account.resetNotifySettings');
    const updates = saveUpdate.mock.calls.map(([update]) => update);
    // * only what had settings of its own is told it has none now
    expect(updates.slice(0, 3)).toEqual([
      notifyUpdate(userPeerId, {}),
      {_: 'updateNotifySettings', peer: {_: 'notifyForumTopic', peer: outputPeer(groupPeerId), top_msg_id: 7}, notify_settings: {_: 'peerNotifySettings'}},
      {_: 'updateNotifySettings', peer: {_: 'notifyCommunity', community_id: '300'}, notify_settings: {_: 'peerNotifySettings'}}
    ]);
    expect(updates.slice(3).map(({peer}) => peer._).sort()).toEqual(['notifyBroadcasts', 'notifyChats', 'notifyUsers']);
    expect(updates.find(({peer}) => peer._ === 'notifyUsers').notify_settings).toBe(usersDefaults);

    // * a chat still on its way is asked for again
    expect((manager as any).peerSettings.notifyPeer[(106 as UserId).toPeerId(false)]).toBeUndefined();
    expect((manager as any).notifyContactsSignUp).toBeUndefined();
    expect((manager as any).reactionsNotifySettings).toBeUndefined();

    // * the list empties in one go, and the screen hears of the reset last
    expect(exceptionsEvents(dispatchEvent)).toEqual([{key: 'notifyUsers', exceptions: []}]);
    expect(dispatchEvent.mock.calls[dispatchEvent.mock.calls.length - 1]).toEqual(['notify_settings_reset']);
    expect(manager.isPeerLocalMuted({peerId: userPeerId, respectType: false})).toBe(false);
  });

  test('an answer to what was asked or sent before it is kept nowhere: what the server has since is asked for', async() => {
    const {manager, release, releaseAll} = withServer();

    const settings = manager.getNotifySettings(inputNotifyPeer(userPeerId));
    const exceptions = manager.getNotifyExceptions('inputNotifyUsers');
    const reactions = manager.getReactionsNotifySettings();
    const muted = manager.updateNotifySettings(inputNotifyPeer(groupPeerId), {_: 'inputPeerNotifySettings', mute_until: MUTE_UNTIL});
    const reactionsSet = manager.setReactionsNotifySettings(reactionsFromAll);

    // * the reset's answer comes first
    const resetting = manager.resetNotifySettings();
    release('account.resetNotifySettings');
    await resetting;
    releaseAll();

    expect(await settings).toEqual({_: 'peerNotifySettings'});
    expect(await exceptions).toEqual([]);
    expect(await reactions).toEqual({_: 'reactionsNotifySettings'});
    expect(await reactionsSet).toEqual({_: 'reactionsNotifySettings'});
    await muted;

    expect(manager.isPeerLocalMuted({peerId: userPeerId, respectType: false})).toBe(false);
    expect(manager.isPeerLocalMuted({peerId: groupPeerId, respectType: false})).toBe(false);
    expect(await manager.getReactionsNotifySettings()).toEqual({_: 'reactionsNotifySettings'});
  });

  test('nothing goes out while it is on its way, and nothing out before it is asked again across it', async() => {
    const {manager, invokeApi, release, releaseAll} = withServer();

    const early = manager.getNotifySettings(inputNotifyPeer(groupPeerId));
    const resetting = manager.resetNotifySettings();
    const during = {
      settings: manager.getNotifySettings(inputNotifyPeer(userPeerId)),
      exceptions: manager.getNotifyExceptions('inputNotifyUsers'),
      contactJoined: manager.getContactSignUpNotification(),
      muted: manager.updateNotifySettings(inputNotifyPeer(discussionPeerId), {_: 'inputPeerNotifySettings', mute_until: MUTE_UNTIL})
    };
    await tick();
    expect(invokeApi.mock.calls.map(([method]) => method)).toEqual(['account.getNotifySettings', 'account.resetNotifySettings']);

    // * what went out before is answered while the reset is still out: kept until the reset clears it, not asked
    // * again there and then, where the server may still answer as before the reset
    release('account.getNotifySettings');
    await early;
    expect(invokeApi).toHaveBeenCalledTimes(2);
    release('account.resetNotifySettings');
    await resetting;
    releaseAll();

    expect(await during.settings).toEqual({_: 'peerNotifySettings'});
    expect(await during.exceptions).toEqual([]);
    expect(await during.contactJoined).toBe(true);
    await during.muted;
    await tick();

    expect(manager.isPeerLocalMuted({peerId: groupPeerId, respectType: false})).toBe(false);
    expect(manager.isPeerLocalMuted({peerId: userPeerId, respectType: false})).toBe(false);
    // * sent after the reset, it stands
    expect(manager.isPeerLocalMuted({peerId: discussionPeerId, respectType: false})).toBe(true);
  });

  test('one that fails drops nothing that was out', async() => {
    const held: (() => void)[] = [];
    const {manager} = createManager({
      invokeApi: (method) => method === 'account.resetNotifySettings' ?
        Promise.reject({type: 'INTERNAL'}) :
        new Promise((resolve) => held.push(() => resolve(true)))
    });

    const muted = manager.updateNotifySettings(inputNotifyPeer(groupPeerId), {_: 'inputPeerNotifySettings', mute_until: MUTE_UNTIL});
    await expect(manager.resetNotifySettings()).rejects.toEqual({type: 'INTERNAL'});
    held.forEach((release) => release());
    await muted;

    expect(manager.isPeerLocalMuted({peerId: groupPeerId, respectType: false})).toBe(true);
  });

  test('an edit asked for while it is on its way merges into what it left, not into what it clears', async() => {
    const {manager, invokeApi, release} = withServer();
    const cached = manager.getNotifySettings(inputNotifyPeer(userPeerId));
    release('account.getNotifySettings');
    await cached;

    // * one edit reads the chat's settings as the reset goes out, the other reads them from here while it is out
    const readOut = manager.editNotifySettings(inputNotifyPeer(groupPeerId), {mute_until: 0});
    const resetting = manager.resetNotifySettings();
    const readHere = manager.editNotifySettings(inputNotifyPeer(userPeerId), {mute_until: 0});
    release('account.getNotifySettings');
    await tick();
    release('account.resetNotifySettings');
    await Promise.all([resetting, readOut, readHere]);

    const methods = invokeApi.mock.calls.map(([method]) => method);
    const writes = invokeApi.mock.calls.filter(([method]) => method === 'account.updateNotifySettings');
    expect(methods.indexOf('account.updateNotifySettings')).toBeGreaterThan(methods.indexOf('account.resetNotifySettings'));
    expect(writes.map(([, {peer}]) => peer.peer.peerId).sort()).toEqual([groupPeerId, userPeerId].sort());
    // * neither the mute nor the silence the reset cleared travels along
    for(const [, {settings}] of writes) {
      expect(settings).toEqual({_: 'inputPeerNotifySettings', mute_until: 0});
    }
  });

  test('the types\' settings asked anew keep a change pushed meanwhile, and are forgotten if asking fails', async() => {
    const held = new Map<string, {resolve: (value: any) => void, reject: (error: any) => void}>();
    const {manager, saveUpdate, dispatchEvent} = createManager({
      invokeApi: (method, params) => method === 'account.getNotifySettings' ?
        new Promise((resolve, reject) => held.set(params.peer._, {resolve, reject})) :
        true
    });
    const peerSettings = (manager as any).peerSettings;
    // * the types as kept from before the reset
    for(const key of ['notifyUsers', 'notifyChats', 'notifyBroadcasts'] as const) {
      manager.savePeerSettings({key, settings: {_: 'peerNotifySettings', mute_until: MUTE_UNTIL}});
    }

    const resetting = manager.resetNotifySettings();
    await tick();
    // * nothing of the old ones is kept while the new ones are asked for
    expect([peerSettings.notifyUsers, peerSettings.notifyChats, peerSettings.notifyBroadcasts]).toEqual([undefined, undefined, undefined]);

    // * the users' change, pushed after they were asked for, is newer than their answer
    const pushed = {_: 'peerNotifySettings', mute_until: MUTE_UNTIL, show_previews: false} as const;
    saveUpdate({_: 'updateNotifySettings', peer: {_: 'notifyUsers'}, notify_settings: pushed});
    held.get('inputNotifyUsers').resolve({_: 'peerNotifySettings', show_previews: true});
    held.get('inputNotifyChats').resolve({_: 'peerNotifySettings'});
    held.get('inputNotifyBroadcasts').reject({type: 'INTERNAL'});
    held.clear();
    await resetting;

    expect(peerSettings.notifyUsers).toBe(pushed);
    expect(peerSettings.notifyChats).toEqual({_: 'peerNotifySettings'});
    expect(peerSettings.notifyBroadcasts).toBeUndefined();
    // * the reset is through all the same, and the channels' are asked for at the next read
    expect(dispatchEvent).toHaveBeenLastCalledWith('notify_settings_reset');
    manager.getNotifySettings({_: 'inputNotifyBroadcasts'});
    expect(held.has('inputNotifyBroadcasts')).toBe(true);
  });

  test('a list kept just before it goes through is asked again: whoever asked gets the emptied one', async() => {
    const {manager, release} = withServer();
    const exceptions = manager.getNotifyExceptions('inputNotifyUsers');
    const resetting = manager.resetNotifySettings();

    // * both answers come at once, the list's first: it is kept, and the reset goes through right after
    release('account.getNotifyExceptions');
    release('account.resetNotifySettings');
    await resetting;

    expect(await exceptions).toEqual([]);
  });
});

describe('an answer older than a change made here', () => {
  const otherPeerId = (107 as UserId).toPeerId(false);

  test('of the exceptions keeps what changed while it was out, and lists those chats as they are now', async() => {
    const {manager, release, saveUpdate} = withServer();
    const exceptions = manager.getNotifyExceptions('inputNotifyUsers');

    // * while the list is out, the muted chat is unmuted here and another one muted elsewhere
    const unmuted = manager.updateNotifySettings(inputNotifyPeer(userPeerId), {_: 'inputPeerNotifySettings', mute_until: 0});
    release('account.updateNotifySettings');
    await unmuted;
    saveUpdate(notifyUpdate(otherPeerId, {mute_until: MUTE_UNTIL}));
    release('account.getNotifyExceptions');

    expect(await exceptions).toEqual([
      {peerId: otherPeerId, muted: true},
      {peerId: userPeerId, muted: false}
    ]);
    expect(manager.isPeerLocalMuted({peerId: userPeerId, respectType: false})).toBe(false);
  });

  test('of the reactions settings keeps a change made while it was out', async() => {
    const {manager, release} = withServer();
    const changed: ReactionsNotifySettings = {_: 'reactionsNotifySettings', sound: {_: 'notificationSoundDefault'}, show_previews: false};

    const asked = manager.getReactionsNotifySettings();
    const set = manager.setReactionsNotifySettings(changed);
    release('account.getReactionsNotifySettings');
    expect(await asked).toEqual(changed);
    release('account.setReactionsNotifySettings');
    expect(await set).toEqual(changed);
    expect(await manager.getReactionsNotifySettings()).toEqual(changed);
  });

  test('of a full profile keeps what a reset cleared and what changed since, and is kept otherwise', async() => {
    const {manager, release, saveUpdate} = withServer();
    // * a profile's own server: every chat muted for good, as before the reset
    const held: (() => void)[] = [];
    const profileManager = new AppProfileManager();
    Object.assign(profileManager as any, {
      apiManager: {
        invokeApi: (method: string, {id}: any) => new Promise((resolve) => held.push(() => resolve({
          _: 'users.userFull',
          users: [],
          chats: [],
          full_user: {_: 'userFull', pFlags: {}, id: id.userId, notify_settings: {_: 'peerNotifySettings', mute_until: MUTE_UNTIL}}
        }))),
        apiPromisesSingleProcess: {},
        invokeApiSingleProcess: ApiManagerMethods.prototype.invokeApiSingleProcess
      },
      appUsersManager: {getUserInput: (userId: UserId) => ({_: 'inputUserMock', userId})},
      appPeersManager: {saveApiPeers: vi.fn()},
      appNotificationsManager: manager,
      appThemesManager: {saveWallPaper: (wallpaper: any) => wallpaper},
      appBusinessManager: {saveBusinessIntro: (userId: UserId, intro: any) => intro},
      appSavedMusicManager: {applyTopSavedMusic: vi.fn()},
      rootScope: {dispatchEvent: vi.fn()},
      botCommandsByPeer: {},
      usersFull: {},
      fullExpiration: {}
    });
    const getProfile = (peerId: PeerId) => Promise.resolve(profileManager.getProfile(peerId.toUserId(), true));
    const answerProfiles = () => held.splice(0).forEach((release) => release());
    const isMuted = (peerId: PeerId) => manager.isPeerLocalMuted({peerId, respectType: false});

    // * asked before a reset, answered after it
    const beforeReset = getProfile(userPeerId);
    const resetting = manager.resetNotifySettings();
    release('account.resetNotifySettings');
    await resetting;
    answerProfiles();
    await beforeReset;
    expect(isMuted(userPeerId)).toBe(false);

    // * asked before the chat's settings changed, answered after; and one with nothing changed since
    const beforeChange = getProfile(userPeerId);
    const unchanged = getProfile(otherPeerId);
    saveUpdate(notifyUpdate(userPeerId, {mute_until: 0}));
    answerProfiles();
    await Promise.all([beforeChange, unchanged]);
    expect(isMuted(userPeerId)).toBe(false);
    expect(isMuted(otherPeerId)).toBe(true);
  });

  test('of a dialog keeps what a reset cleared, and the dialog carries what is kept; one asked for after is kept', async() => {
    const {manager, release} = withServer();
    const storage = createDialogsStorage({appMessagesManager: {getDialogUnreadCount: () => 0}});
    (storage as any).appNotificationsManager = manager;
    const isMuted = (peerId: PeerId) => manager.isPeerLocalMuted({peerId, respectType: false});
    const mutedDialog = (peerId: PeerId) => makeDialog(+peerId.toUserId(), {
      notify_settings: {_: 'peerNotifySettings', mute_until: MUTE_UNTIL}
    });

    // * a page of the list asked for before a reset, answered after it
    const askedAt = manager.getSettingsClock();
    const resetting = manager.resetNotifySettings();
    release('account.resetNotifySettings');
    await resetting;
    const old = mutedDialog(userPeerId);
    storage.saveDialog({dialog: old, settingsAskedAt: askedAt});
    expect(isMuted(userPeerId)).toBe(false);
    expect(old.notify_settings).toEqual({_: 'peerNotifySettings'});

    storage.saveDialog({dialog: mutedDialog(otherPeerId), settingsAskedAt: manager.getSettingsClock()});
    expect(isMuted(otherPeerId)).toBe(true);
  });

  test('a reaction\'s notification, as a message\'s, keeps the chat\'s sound off', async() => {
    const messagesManager = new AppMessagesManager() as any;
    const routeNotification = vi.fn();
    Object.assign(messagesManager, {
      appNotificationsManager: {routeNotification},
      getMessagePeer: () => userPeerId
    });
    const notifySettings = {muted: false, soundOff: true, peerTypeNotifySettings: {_: 'peerNotifySettings', show_previews: true}};
    const message = {_: 'message', mid: 1, pFlags: {out: true}};

    await messagesManager.notifyAboutMessage(message, {notifySettings, peerReaction: {_: 'messagePeerReaction'}});
    await messagesManager.notifyAboutMessage(message, {notifySettings});
    expect(routeNotification.mock.calls.map(([, payload]) => payload.noSound)).toEqual([true, true]);
    expect(routeNotification.mock.calls[0][1].peerTypeNotifySettings).toBe(notifySettings.peerTypeNotifySettings);
  });
});

describe('chat sound', () => {
  const setSettings = (manager: AppNotificationsManager, settings: any) => {
    Object.assign((manager as any).peerSettings, settings);
  };

  test('off by the chat\'s own choice, by the topic\'s, or inherited from the type', () => {
    const {manager} = createManager();
    setSettings(manager, {
      notifyPeer: {
        [userPeerId]: {_: 'peerNotifySettings', other_sound: {_: 'notificationSoundNone'}},
        [groupPeerId]: {_: 'peerNotifySettings'}
      },
      notifyForumTopic: {
        [groupPeerId + '_7']: {_: 'peerNotifySettings', other_sound: {_: 'notificationSoundNone'}},
        [groupPeerId + '_8']: {_: 'peerNotifySettings'}
      },
      notifyUsers: {_: 'peerNotifySettings'},
      notifyChats: {_: 'peerNotifySettings', other_sound: {_: 'notificationSoundDefault'}}
    });

    expect(manager.isPeerLocalSoundOff({peerId: userPeerId})).toBe(true);
    expect(manager.isPeerLocalSoundOff({peerId: groupPeerId})).toBe(false);
    expect(manager.isPeerLocalSoundOff({peerId: groupPeerId, threadId: 7})).toBe(true);
    expect(manager.isPeerLocalSoundOff({peerId: groupPeerId, threadId: 8})).toBe(false);
    // * one's own chat is never notified about
    expect(manager.isPeerLocalSoundOff({peerId: selfPeerId})).toBe(false);

    setSettings(manager, {notifyChats: {_: 'peerNotifySettings', other_sound: {_: 'notificationSoundNone'}}});
    expect(manager.isPeerLocalSoundOff({peerId: groupPeerId, threadId: 8})).toBe(true);
  });

  test('switching it sends this client\'s sound and keeps it locally as the `other` one', async() => {
    const {manager, invokeApi, saveUpdate} = createManager();
    setSettings(manager, {
      notifyPeer: {[userPeerId]: {_: 'peerNotifySettings', mute_until: 0, other_sound: {_: 'notificationSoundDefault'}}}
    });

    await manager.setPeerSoundOff({peerId: userPeerId}, true);
    expect(invokeApi.mock.calls[0][1].settings).toMatchObject({mute_until: 0, sound: {_: 'notificationSoundNone'}});
    expect(saveUpdate.mock.calls[0][0].notify_settings).not.toHaveProperty('sound');
    expect(manager.isPeerLocalSoundOff({peerId: userPeerId})).toBe(true);

    await manager.setPeerSoundOff({peerId: userPeerId}, false);
    expect(invokeApi.mock.calls[1][1].settings.sound).toEqual({_: 'notificationSoundDefault'});
    expect(manager.isPeerLocalSoundOff({peerId: userPeerId})).toBe(false);
  });

  test('a comments thread, no forum\'s topic, reads and switches the chat\'s own: what playback reads', async() => {
    const {manager, invokeApi} = createManager({
      invokeApi: (method) => method === 'account.getNotifySettings' ? {_: 'peerNotifySettings'} : true
    });

    const thread = {peerId: discussionPeerId, threadId: 9};
    expect(await manager.isPeerSoundOff(thread)).toBe(false);
    await manager.setPeerSoundOff(thread, true);

    // * the thread passed in is left as it was
    expect(thread.threadId).toBe(9);
    const peers = invokeApi.mock.calls.map(([, params]) => params.peer._);
    expect(peers).not.toContain('inputNotifyForumTopic');
    expect(invokeApi).toHaveBeenLastCalledWith('account.updateNotifySettings', {
      peer: inputNotifyPeer(discussionPeerId),
      settings: expect.objectContaining({sound: {_: 'notificationSoundNone'}})
    });
    expect(manager.isPeerLocalSoundOff(thread)).toBe(true);
  });
});
