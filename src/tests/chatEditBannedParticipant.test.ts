import {describe, expect, it, vi} from 'vitest';
import '@helpers/peerIdPolyfill';
import type {ChannelParticipant, Update} from '@layer';
import {AppChatsManager} from '@appManagers/appChatsManager';
import {bannedRights as rights} from '@/tests/helpers/bannedRights';

// What the lists of a supergroup's members learn when an admin restricts, lifts or removes someone: the local
// updateChannelParticipant the manager hands them. Lifting a member's restrictions (the "Delete exception" button,
// or allowing them everything again) leaves them a member, as Telegram Desktop's ChannelData::applyEditBanned keeps
// them among the participants; it used to read as the member being gone, and the profile's list of members dropped
// them until it was opened again. Only one who was removed, when let back, is not a member yet.

const CHAT_ID = 5 as ChatId;
const MY_ID = 1 as UserId;
const USER_ID = 7 as UserId;
const USER_PEER = {_: 'peerUser', user_id: USER_ID} as const;

function setup() {
  const processLocalUpdate = vi.fn();
  const manager = Object.assign(Object.create(AppChatsManager.prototype), {
    chats: {[CHAT_ID]: {_: 'channel', id: CHAT_ID, pFlags: {megagroup: true}}},
    apiManager: {invokeApi: vi.fn().mockResolvedValue({_: 'updates', updates: [], users: [], chats: []})},
    apiUpdatesManager: {processLocalUpdate, processUpdateMessage: vi.fn()},
    appPeersManager: {
      getInputPeerById: () => ({_: 'inputPeerUser', user_id: USER_ID, access_hash: 0}),
      getOutputPeer: () => USER_PEER
    },
    appUsersManager: {getSelf: () => ({id: MY_ID})},
    getChannelInput: () => ({_: 'inputChannel', channel_id: CHAT_ID, access_hash: 0}),
    onChatUpdated: vi.fn()
  }) as AppChatsManager;

  const lastUpdate = () => processLocalUpdate.mock.lastCall[0] as Update.updateChannelParticipant;
  return {manager, lastUpdate};
}

const member: ChannelParticipant.channelParticipant = {_: 'channelParticipant', user_id: USER_ID, date: 1000};

const restricted: ChannelParticipant.channelParticipantBanned = {
  _: 'channelParticipantBanned',
  pFlags: {},
  peer: USER_PEER,
  kicked_by: MY_ID,
  date: 1000,
  banned_rights: rights({send_media: true}),
  rank: 'dev'
};

const removed: ChannelParticipant.channelParticipantBanned = {
  ...restricted,
  pFlags: {left: true},
  banned_rights: rights({view_messages: true})
};

describe('an admin\'s change of a member\'s restrictions', () => {
  it('lifting them leaves a member, with their tag and the date they came', async() => {
    const {manager, lastUpdate} = setup();
    await manager.clearChannelParticipantBannedRights(CHAT_ID, restricted);

    const update = lastUpdate();
    expect(update.prev_participant).toBe(restricted);
    expect(update.new_participant).toMatchObject({_: 'channelParticipant', user_id: USER_ID, date: 1000, rank: 'dev'});
  });

  it('allowing a plain member everything leaves a member', async() => {
    const {manager, lastUpdate} = setup();
    await manager.editBanned(CHAT_ID, member, rights({}));

    expect(lastUpdate().new_participant).toMatchObject({_: 'channelParticipant', user_id: USER_ID});
  });

  it('letting a removed one back makes no member of them', async() => {
    const {manager, lastUpdate} = setup();
    await manager.clearChannelParticipantBannedRights(CHAT_ID, removed);

    expect(lastUpdate().new_participant).toBeUndefined();
  });

  it('restricting keeps a member who is restricted, removing one who has left', async() => {
    const {manager, lastUpdate} = setup();
    await manager.editBanned(CHAT_ID, member, rights({send_media: true}));
    expect(lastUpdate().new_participant).toMatchObject({_: 'channelParticipantBanned', pFlags: {}});

    await manager.kickFromChannel(CHAT_ID, member);
    expect(lastUpdate().new_participant).toMatchObject({_: 'channelParticipantBanned', pFlags: {left: true}});
  });
});
