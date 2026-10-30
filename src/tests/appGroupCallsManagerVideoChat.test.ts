/*
 * A video chat's own management, through AppGroupCallsManager: its title
 * (phone.editGroupCallTitle), inviting the chat's members
 * (phone.inviteToGroupCall, in tdesktop's slices of ten) and who we are shown
 * as (phone.getGroupCallJoinAs / phone.saveDefaultGroupCallJoinAs, and the
 * `join_as` every join and every edit of our own row carries).
 */

import {describe, expect, it, vi} from 'vitest';
import '@helpers/peerIdPolyfill';
import {AppGroupCallsManager} from '@appManagers/appGroupCallsManager';
import {ChatFull, DataJSON, GroupCall, GroupCallParticipant, Updates} from '@layer';

const CALL: GroupCall.groupCall = {
  _: 'groupCall',
  pFlags: {},
  id: '42',
  access_hash: '7',
  participants_count: 2,
  unmuted_video_limit: 0,
  version: 1
};
const INPUT_CALL = {_: 'inputGroupCall', id: '42', access_hash: '7'};
const MY_ID = (1000).toPeerId();
const CHANNEL_ID = (5000).toPeerId(true);
const CHAT_PEER_ID = (6000).toPeerId(true);

const EMPTY_UPDATES: Updates = {_: 'updates', updates: [], users: [], chats: [], date: 0, seq: 0};

function makeManager(options: {
  invokeApi?: (method: string, params: any) => any,
  chatFull?: ChatFull
} = {}) {
  const manager = new AppGroupCallsManager();
  const invokeApi = vi.fn(async(method: string, params: any) => options.invokeApi ? options.invokeApi(method, params) : EMPTY_UPDATES);
  const processUpdateMessage = vi.fn();
  const saveApiPeers = vi.fn();
  const cachedChatFull = options.chatFull;

  Object.assign(manager as any, {
    apiManager: {invokeApi, invokeApiSingle: invokeApi},
    apiUpdatesManager: {processUpdateMessage},
    appPeersManager: {
      getInputPeerSelf: () => ({_: 'inputPeerSelf'}),
      getInputPeerById: (peerId: PeerId) => ({_: 'inputPeer', peerId}),
      getOutputPeer: (peerId: PeerId) => peerId.isUser() ?
        {_: 'peerUser', user_id: peerId.toUserId()} :
        {_: 'peerChannel', channel_id: peerId.toChatId()},
      saveApiPeers
    },
    appUsersManager: {
      getUserInput: (userId: UserId) => ({_: 'inputUser', user_id: userId}),
      saveApiUsers: vi.fn()
    },
    appChatsManager: {saveApiChats: vi.fn()},
    appProfileManager: {
      getChatFull: vi.fn(() => cachedChatFull),
      getCachedFullChat: vi.fn(() => cachedChatFull)
    },
    rootScope: {myId: MY_ID, dispatchEvent: vi.fn()},
    groupCalls: new Map([[CALL.id, {...CALL}]]),
    participants: new Map(),
    nextOffsets: new Map(),
    participantFetchGenerations: new Map(),
    participantVersions: new Map(),
    conferenceRosterFetches: new Map(),
    participantsResyncs: new Map(),
    cachedStreamChannels: new Map(),
    log: Object.assign(() => {}, {warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn()})
  });

  return {manager, invokeApi, processUpdateMessage, saveApiPeers};
}

function channelFullWithDefault(peerId?: PeerId): ChatFull {
  return {
    _: 'channelFull',
    groupcall_default_join_as: peerId && (peerId.isUser() ?
      {_: 'peerUser', user_id: peerId.toUserId()} :
      {_: 'peerChannel', channel_id: peerId.toChatId()})
  } as ChatFull;
}

function joinAsPeers(peerIds: PeerId[]) {
  return {
    _: 'phone.joinAsPeers',
    peers: peerIds.map((peerId) => peerId.isUser() ?
      {_: 'peerUser', user_id: peerId.toUserId()} :
      {_: 'peerChannel', channel_id: peerId.toChatId()}),
    chats: [] as any[],
    users: [] as any[]
  };
}

describe('AppGroupCallsManager — video chat title', () => {
  it('edits the title of the cached call and applies the server\'s answer', async() => {
    const {manager, invokeApi, processUpdateMessage} = makeManager();

    await manager.editGroupCallTitle(CALL.id, 'Standup');

    expect(invokeApi).toHaveBeenCalledWith('phone.editGroupCallTitle', {call: INPUT_CALL, title: 'Standup'});
    expect(processUpdateMessage).toHaveBeenCalledWith(EMPTY_UPDATES);
  });

  it('passes an empty title through: that gives the call the chat\'s name back', async() => {
    const {manager, invokeApi} = makeManager();

    await manager.editGroupCallTitle(CALL.id, '');

    expect(invokeApi).toHaveBeenCalledWith('phone.editGroupCallTitle', {call: INPUT_CALL, title: ''});
  });
});

describe('AppGroupCallsManager — inviting members', () => {
  it('sends ten users a request and reports everyone the server took', async() => {
    const userIds = Array.from({length: 23}, (_, i) => 100 + i);
    const {manager, invokeApi, processUpdateMessage} = makeManager();

    const invited = await manager.inviteToGroupCall(CALL.id, userIds);

    expect(invokeApi).toHaveBeenCalledTimes(3);
    expect(invokeApi.mock.calls.map(([, params]) => params.users.length)).toEqual([10, 10, 3]);
    expect(invokeApi.mock.calls[0]).toEqual(['phone.inviteToGroupCall', {
      call: INPUT_CALL,
      users: userIds.slice(0, 10).map((userId) => ({_: 'inputUser', user_id: userId}))
    }]);
    expect(processUpdateMessage).toHaveBeenCalledTimes(3);
    expect(invited).toEqual(userIds);
  });

  it('keeps a refused slice from hiding the ones the server took', async() => {
    const userIds = Array.from({length: 12}, (_, i) => 100 + i);
    const {manager, processUpdateMessage} = makeManager({
      invokeApi: (_method, params) => {
        if(params.users.length === 2) throw {type: 'USER_NOT_PARTICIPANT'};
        return EMPTY_UPDATES;
      }
    });

    const invited = await manager.inviteToGroupCall(CALL.id, userIds);

    expect(invited).toEqual(userIds.slice(0, 10));
    expect(processUpdateMessage).toHaveBeenCalledTimes(1);
  });
});

describe('AppGroupCallsManager — join as', () => {
  it('lists who we can be and preselects the chat\'s saved choice', async() => {
    const {manager, invokeApi, saveApiPeers} = makeManager({
      chatFull: channelFullWithDefault(CHANNEL_ID),
      invokeApi: () => joinAsPeers([MY_ID, CHANNEL_ID])
    });

    const options = await manager.getGroupCallJoinAs(CHAT_PEER_ID);

    expect(invokeApi).toHaveBeenCalledWith('phone.getGroupCallJoinAs', {peer: {_: 'inputPeer', peerId: CHAT_PEER_ID}});
    expect(saveApiPeers).toHaveBeenCalled();
    expect(options).toEqual({peerIds: [MY_ID, CHANNEL_ID], savedPeerId: CHANNEL_ID, defaultPeerId: CHANNEL_ID});
  });

  it('falls back to the account when the saved choice is no longer offered', async() => {
    const {manager} = makeManager({
      chatFull: channelFullWithDefault((7000).toPeerId(true)),
      invokeApi: () => joinAsPeers([CHANNEL_ID, MY_ID])
    });

    expect(await manager.getGroupCallJoinAs(CHAT_PEER_ID)).toEqual({
      peerIds: [CHANNEL_ID, MY_ID],
      savedPeerId: undefined,
      defaultPeerId: MY_ID
    });
  });

  it('preselects the first peer when the account itself is not offered', async() => {
    const {manager} = makeManager({
      chatFull: channelFullWithDefault(),
      invokeApi: () => joinAsPeers([CHANNEL_ID, CHANNEL_ID])
    });

    expect(await manager.getGroupCallJoinAs(CHAT_PEER_ID)).toEqual({
      peerIds: [CHANNEL_ID],
      savedPeerId: undefined,
      defaultPeerId: CHANNEL_ID
    });
  });

  it('saves the default and makes the cached chat preselect it', async() => {
    const chatFull = channelFullWithDefault(MY_ID);
    const {manager, invokeApi} = makeManager({chatFull});

    await manager.saveDefaultGroupCallJoinAs(CHAT_PEER_ID, CHANNEL_ID);

    expect(invokeApi).toHaveBeenCalledWith('phone.saveDefaultGroupCallJoinAs', {
      peer: {_: 'inputPeer', peerId: CHAT_PEER_ID},
      join_as: {_: 'inputPeer', peerId: CHANNEL_ID}
    });
    expect((chatFull as ChatFull.channelFull).groupcall_default_join_as).toEqual({_: 'peerChannel', channel_id: CHANNEL_ID.toChatId()});
  });

  it('saves the account as inputPeerSelf', async() => {
    const {manager, invokeApi} = makeManager({chatFull: channelFullWithDefault(CHANNEL_ID)});

    await manager.saveDefaultGroupCallJoinAs(CHAT_PEER_ID, MY_ID);

    expect(invokeApi.mock.calls[0][1].join_as).toEqual({_: 'inputPeerSelf'});
  });

  it('joins as the channel it was asked to, and as the account otherwise', async() => {
    const params: DataJSON = {_: 'dataJSON', data: '{"ssrc":1}'};
    const {manager, invokeApi} = makeManager({
      invokeApi: (method) => {
        if(method !== 'phone.joinGroupCall') return EMPTY_UPDATES;
        // only the request is under test: an answer without a connection is refused
        throw {type: 'TEST_STOP'};
      }
    });

    await expect(manager.joinGroupCall(CALL.id, params, {type: 'main', joinAs: CHANNEL_ID})).rejects.toEqual({type: 'TEST_STOP'});
    await expect(manager.joinGroupCall(CALL.id, params, {type: 'main'})).rejects.toEqual({type: 'TEST_STOP'});
    await expect(manager.joinGroupCall(CALL.id, params, {type: 'main', joinAs: MY_ID})).rejects.toEqual({type: 'TEST_STOP'});

    const joins = invokeApi.mock.calls.filter(([method]) => method === 'phone.joinGroupCall');
    expect(joins.map(([, request]) => request.join_as)).toEqual([
      {_: 'inputPeer', peerId: CHANNEL_ID},
      {_: 'inputPeerSelf'},
      {_: 'inputPeerSelf'}
    ]);
  });

  it('edits our own row as the channel we joined as', async() => {
    const {manager, invokeApi} = makeManager();
    const asChannel: GroupCallParticipant = {
      _: 'groupCallParticipant',
      pFlags: {self: true, can_self_unmute: true},
      peer: {_: 'peerChannel', channel_id: CHANNEL_ID.toChatId()},
      source: 1,
      date: 1
    };
    const asAccount: GroupCallParticipant = {...asChannel, peer: {_: 'peerUser', user_id: MY_ID.toUserId()}};

    await manager.editParticipant(CALL.id, asChannel, {raiseHand: true}, false);
    await manager.editParticipant(CALL.id, asAccount, {muted: true}, false);

    const edits = invokeApi.mock.calls.filter(([method]) => method === 'phone.editGroupCallParticipant');
    expect(edits.map(([, request]) => request.participant)).toEqual([
      {_: 'inputPeer', peerId: CHANNEL_ID},
      {_: 'inputPeerSelf'}
    ]);
  });
});
