import {describe, expect, it, vi} from 'vitest';
import AppStoriesManager from '@appManagers/appStoriesManager';
import {AppChatsManager} from '@appManagers/appChatsManager';
import {AppMessagesManager} from '@appManagers/appMessagesManager';
import AppBoostsManager from '@appManagers/appBoostsManager';
import {Chat, ChatBannedRights, ChatFull} from '@layer';
import '@helpers/peerIdPolyfill';

const self = (1 as UserId).toPeerId();
const user = (2 as UserId).toPeerId();
const groupId = 10 as ChatId;
const group = groupId.toPeerId(true);

const banned = (flags: ChatBannedRights['pFlags']): ChatBannedRights => ({_: 'chatBannedRights', pFlags: flags, until_date: 0});

// * a member of a supergroup: no admin rights, the group's own restrictions and the member's in person
function groupChat(options: {
  defaults?: ChatBannedRights['pFlags'],
  own?: ChatBannedRights['pFlags'],
  broadcast?: boolean,
  gigagroup?: boolean
} = {}): Chat.channel {
  return {
    _: 'channel',
    id: groupId,
    title: 'Group',
    photo: {_: 'chatPhotoEmpty'},
    date: 0,
    access_hash: '0',
    pFlags: {
      megagroup: options.broadcast ? undefined : true,
      broadcast: options.broadcast || undefined,
      gigagroup: options.gigagroup || undefined
    },
    default_banned_rights: banned(options.defaults || {}),
    banned_rights: options.own && banned(options.own)
  } as Chat.channel;
}

function managers(chat: Chat.channel, chatFull?: Partial<ChatFull.channelFull>, appConfig: object = {}) {
  const fullChat = chatFull && {_: 'channelFull', id: groupId, pFlags: {}, ...chatFull} as ChatFull.channelFull;
  const appProfileManager = {
    getChatFull: vi.fn().mockReturnValue(fullChat),
    getCachedFullChat: () => fullChat,
    modifyCachedFullChat: (_id: ChatId, modify: (chatFull: ChatFull.channelFull) => any) => modify(fullChat)
  };
  const appChatsManager = Object.assign(Object.create(AppChatsManager.prototype), {
    getChat: () => chat,
    appProfileManager
  }) as AppChatsManager;
  const appPeersManager = {
    peerId: self,
    isBroadcast: (peerId: PeerId) => !peerId.isUser() && !!chat.pFlags.broadcast,
    isPeerRestricted: () => false
  };
  const apiManager = {getAppConfig: async() => appConfig};
  const appMessagesManager = Object.assign(Object.create(AppMessagesManager.prototype), {
    appPeersManager,
    appChatsManager,
    appProfileManager,
    apiManager
  }) as AppMessagesManager;
  const stories = Object.assign(Object.create(AppStoriesManager.prototype), {
    appPeersManager,
    appChatsManager,
    appProfileManager,
    appMessagesManager,
    apiManager
  }) as AppStoriesManager;
  return {stories, appChatsManager, appMessagesManager, fullChat};
}

describe('story reply mode', () => {
  it('answers a user privately, and nobody answers their own story', async() => {
    const {stories} = managers(groupChat());
    expect(await stories.getReplyMode(user)).toEqual({mode: 'reply'});
    expect(await stories.getReplyMode(self)).toEqual({mode: 'none'});
  });

  it('gives a channel\'s story no field', async() => {
    const {stories} = managers(groupChat({broadcast: true}));
    expect(await stories.getReplyMode(group)).toEqual({mode: 'none'});
  });

  it('answers a group\'s story in the group when the member may write there', async() => {
    const {stories} = managers(groupChat(), {});
    expect(await stories.getReplyMode(group)).toEqual({mode: 'reply'});
  });

  it('locks the field until the group is boosted, by as many boosts as are left', async() => {
    const {stories} = managers(groupChat({defaults: {send_plain: true}}), {boosts_unrestrict: 5, boosts_applied: 2});
    expect(await stories.getReplyMode(group)).toEqual({mode: 'boost', boostsNeeded: 3});
  });

  it('opens the field to a member who has boosted enough', async() => {
    const {stories} = managers(groupChat({defaults: {send_plain: true}}), {boosts_unrestrict: 5, boosts_applied: 5});
    expect(await stories.getReplyMode(group)).toEqual({mode: 'reply'});
  });

  it('gives no field where boosting lifts nothing, or the member is banned in person', async() => {
    const restricted = managers(groupChat({defaults: {send_plain: true}}), {});
    expect(await restricted.stories.getReplyMode(group)).toEqual({mode: 'none'});

    const bannedInPerson = managers(groupChat({own: {send_plain: true}}), {boosts_unrestrict: 5, boosts_applied: 9});
    expect(await bannedInPerson.stories.getReplyMode(group)).toEqual({mode: 'none'});

    // * a broadcast group, where only admins write: no number of boosts opens it
    for(const boosts_applied of [0, 9]) {
      const gigagroup = managers(groupChat({gigagroup: true, defaults: {send_plain: true}}), {boosts_unrestrict: 5, boosts_applied});
      expect(await gigagroup.stories.getReplyMode(group)).toEqual({mode: 'none'});
    }
  });

  it('offers no boosting where the boosts are enough and something else keeps the member out', async() => {
    const frozen = managers(
      groupChat({defaults: {send_plain: true}}),
      {boosts_unrestrict: 2, boosts_applied: 2},
      {freeze_since_date: 1, freeze_appeal_url: 'https://t.me/spambot'}
    );
    Object.assign(frozen.appMessagesManager, {appUsersManager: {resolveUsername: async() => ({_: 'user', id: 99})}});
    expect(await frozen.stories.getReplyMode(group)).toEqual({mode: 'none'});

    const frozenShort = managers(
      groupChat({defaults: {send_plain: true}}),
      {boosts_unrestrict: 5, boosts_applied: 2},
      {freeze_since_date: 1, freeze_appeal_url: 'https://t.me/spambot'}
    );
    Object.assign(frozenShort.appMessagesManager, {appUsersManager: {resolveUsername: async() => ({_: 'user', id: 99})}});
    expect(await frozenShort.stories.getReplyMode(group)).toEqual({mode: 'none'});
  });
});

describe('boosts moved between groups', () => {
  it('asks again for the group boosted and for every group its slots are taken from', async() => {
    const getChatFull = vi.fn();
    const peerChannel = (id: number) => ({_: 'peerChannel', channel_id: id});
    const boosts = AppBoostsManager.prototype;
    const manager = Object.assign(Object.create(boosts), {
      apiManager: {
        invokeApiSingleProcess: ({processResult}: {processResult: (result: any) => any}) => processResult({_: 'premium.myBoosts', my_boosts: [], chats: [], users: []})
      },
      appPeersManager: {
        saveApiPeers: vi.fn(),
        isMegagroup: (peerId: PeerId) => !peerId.isUser(),
        getInputPeerById: () => ({_: 'inputPeerEmpty'})
      },
      appProfileManager: {getChatFull},
      myBoosts: {my_boosts: [
        {_: 'myBoost', slot: 1, peer: peerChannel(20), date: 0, expires: 0},
        {_: 'myBoost', slot: 2, peer: peerChannel(30), date: 0, expires: 0}
      ]}
    }) as AppBoostsManager;

    await manager.applyBoost(group, [1]);
    expect(getChatFull.mock.calls).toEqual([[groupId, true], [20, true]]);
  });
});

describe('restrictions lifted by boosts', () => {
  it('lets a booster past the group\'s own restrictions, in the chat too', async() => {
    const {appChatsManager, appMessagesManager} = managers(groupChat({defaults: {send_plain: true, send_photos: true}}), {boosts_unrestrict: 2, boosts_applied: 3});
    expect(appChatsManager.isRestrictionLiftedByBoosts(groupId, 'send_plain')).toBe(true);
    expect(await appMessagesManager.canSendToPeer(group, undefined, 'send_plain')).toBe(true);
    expect(await appMessagesManager.canSendToPeer(group, undefined, 'send_photos')).toBe(true);
    // * wherever the rights are asked, the media popup's check among them; what is not sent stays restricted
    expect(appChatsManager.hasRights(groupId, 'send_photos')).toBe(true);
    expect(appChatsManager.hasRights(groupId, 'send_videos')).toBe(true);
  });

  it('lifts only what is sent, and nothing past another no', () => {
    const {appChatsManager} = managers(groupChat({defaults: {send_plain: true, pin_messages: true}}), {boosts_unrestrict: 2, boosts_applied: 3});
    expect(appChatsManager.hasRights(groupId, 'pin_messages')).toBe(false);

    const forbidden = managers({...groupChat({defaults: {send_plain: true}}), _: 'channelForbidden'} as any, {boosts_unrestrict: 2, boosts_applied: 3});
    expect(forbidden.appChatsManager.hasRights(groupId, 'send_plain')).toBe(false);
  });

  it('keeps the restrictions for a member short of boosts, banned in person, or in a broadcast group', async() => {
    const short = managers(groupChat({defaults: {send_plain: true}}), {boosts_unrestrict: 4, boosts_applied: 3});
    expect(await short.appMessagesManager.canSendToPeer(group, undefined, 'send_plain')).toBe(false);

    const own = managers(groupChat({own: {send_plain: true}}), {boosts_unrestrict: 1, boosts_applied: 3});
    expect(own.appChatsManager.isRestrictionLiftedByBoosts(groupId, 'send_plain')).toBe(false);

    const gigagroup = managers(groupChat({gigagroup: true}), {boosts_unrestrict: 1, boosts_applied: 3});
    expect(gigagroup.appChatsManager.isRestrictionLiftedByBoosts(groupId, 'send_plain')).toBe(false);
  });

  it('lets a booster send again without slow mode\'s wait, and nobody short of boosts', () => {
    const sent = {peerId: group, pFlags: {out: true}, date: 100} as any;
    const booster = managers(groupChat(), {slowmode_seconds: 30, boosts_unrestrict: 2, boosts_applied: 2});
    (booster.appMessagesManager as any).updateSlowModeOnNewMessage(sent);
    expect(booster.fullChat.slowmode_next_send_date).toBeUndefined();

    const short = managers(groupChat(), {slowmode_seconds: 30, boosts_unrestrict: 2, boosts_applied: 1});
    (short.appMessagesManager as any).updateSlowModeOnNewMessage(sent);
    expect(short.fullChat.slowmode_next_send_date).toBe(130);
  });
});
