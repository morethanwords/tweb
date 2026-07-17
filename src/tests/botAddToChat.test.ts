import {describe, expect, test} from 'vitest';
import {ChannelParticipant, Chat, ChatAdminRights, ChatParticipant, User, UserFull} from '@layer';
import {CHAT_LEGACY_ADMIN_RIGHTS} from '@appManagers/utils/chats/constants';
import canOpenBotAdminEditor from '@appManagers/utils/bots/canOpenBotAdminEditor';
import getAddBotToChatAction from '@appManagers/utils/bots/getAddBotToChatAction';
import getBotAddToChatScope from '@appManagers/utils/bots/getBotAddToChatScope';
import getBotAdminRightsForChat from '@appManagers/utils/bots/getBotAdminRightsForChat';
import getBotExistingAdminRights from '@appManagers/utils/bots/getBotExistingAdminRights';
import limitBotAdminRights from '@appManagers/utils/bots/limitBotAdminRights';
import mergeBotAdminRights from '@appManagers/utils/bots/mergeBotAdminRights';
import parseBotAdminRights from '@appManagers/utils/bots/parseBotAdminRights';

const makeRights = (pFlags: ChatAdminRights['pFlags']): ChatAdminRights => ({
  _: 'chatAdminRights',
  pFlags
});

const makeChannel = ({
  broadcast,
  creator,
  adminRights
}: {
  broadcast?: boolean,
  creator?: boolean,
  adminRights?: ChatAdminRights
} = {}) => ({
  _: 'channel',
  pFlags: {broadcast: broadcast || undefined, creator: creator || undefined},
  admin_rights: adminRights
}) as Chat.channel;

const makeGroup = () => ({
  _: 'chat',
  pFlags: {}
}) as Chat.chat;

describe('parseBotAdminRights', () => {
  test('maps deep-link names to MTProto flags', () => {
    expect(parseBotAdminRights('change_info+restrict_members promote_members+manage_video_chats')).toEqual({
      _: 'chatAdminRights',
      pFlags: {
        change_info: true,
        ban_users: true,
        add_admins: true,
        manage_call: true
      }
    });
  });

  test('ignores unknown and empty names', () => {
    expect(parseBotAdminRights('unknown++pin_messages')).toEqual({
      _: 'chatAdminRights',
      pFlags: {
        pin_messages: true
      }
    });
  });
});

describe('getBotAddToChatScope', () => {
  test('uses a group admin scope only when startgroup requests rights', () => {
    expect(getBotAddToChatScope({startgroup: ''}, makeRights({}))).toBe('all');
    expect(getBotAddToChatScope(
      {startgroup: 'payload'},
      makeRights({invite_users: true})
    )).toBe('groupAdmin');
  });

  test('uses a channel-only scope for startchannel', () => {
    expect(getBotAddToChatScope(
      {startchannel: 'ignored'},
      makeRights({post_messages: true})
    )).toBe('channelAdmin');
  });

  test('gives startgroup precedence when both parameters are present', () => {
    expect(getBotAddToChatScope(
      {startgroup: '', startchannel: ''},
      makeRights({})
    )).toBe('all');
  });
});

describe('getAddBotToChatAction', () => {
  const makeBot = (pFlags: User.user['pFlags'] = {bot: true}, id = 1) => ({
    _: 'user',
    id,
    pFlags
  }) as User.user;
  const makeFull = (rights: Pick<UserFull.userFull, 'bot_group_admin_rights' | 'bot_broadcast_admin_rights'> = {}) => rights as UserFull.userFull;

  test('offers regular bots to groups without claiming admin capabilities', () => {
    expect(getAddBotToChatAction(makeBot(), makeFull())).toEqual({
      text: 'AddToGroup',
      about: undefined,
      pickerTitle: 'BotChooseGroup'
    });
  });

  test('offers group and channel management when broadcast rights are present', () => {
    const rights = {_: 'chatAdminRights', pFlags: {post_messages: true}} as const;
    expect(getAddBotToChatAction(makeBot(), makeFull({bot_broadcast_admin_rights: rights}))).toEqual({
      text: 'BotAddToGroupOrChannel',
      about: 'BotAddToChannelAbout',
      pickerTitle: 'SelectChat'
    });
  });

  test('hides bots that cannot join groups and request no channel rights', () => {
    expect(getAddBotToChatAction(makeBot({bot: true, bot_nochats: true}), makeFull())).toBeUndefined();
  });

  test('hides service bots', () => {
    expect(getAddBotToChatAction(makeBot({bot: true}, 489000), makeFull())).toBeUndefined();
    expect(getAddBotToChatAction(makeBot({bot: true, support: true}), makeFull())).toBeUndefined();
  });
});

describe('bot admin rights', () => {
  test('unions requested and existing rights without mutating either value', () => {
    const requested = makeRights({invite_users: true});
    const existing = makeRights({delete_messages: true});

    expect(mergeBotAdminRights(requested, existing)).toEqual(makeRights({
      delete_messages: true,
      invite_users: true
    }));
    expect(requested).toEqual(makeRights({invite_users: true}));
    expect(existing).toEqual(makeRights({delete_messages: true}));
  });

  test('uses legacy rights for a basic-group admin', () => {
    const participant = {
      _: 'chatParticipantAdmin',
      user_id: 1,
      inviter_id: 2,
      date: 1
    } as ChatParticipant.chatParticipantAdmin;
    const rights = getBotExistingAdminRights(makeGroup(), participant);

    expect(rights).toEqual(CHAT_LEGACY_ADMIN_RIGHTS);
    expect(rights).not.toBe(CHAT_LEGACY_ADMIN_RIGHTS);
  });

  test('uses channel participant rights for an existing channel admin', () => {
    const adminRights = makeRights({post_messages: true});
    const participant = {
      _: 'channelParticipantAdmin',
      pFlags: {},
      user_id: 1,
      promoted_by: 2,
      date: 1,
      admin_rights: adminRights
    } as ChannelParticipant.channelParticipantAdmin;

    expect(getBotExistingAdminRights(makeChannel({broadcast: true}), participant)).toEqual(adminRights);
  });

  test('drops rights that a non-creator channel admin cannot grant', () => {
    const chat = makeChannel({
      adminRights: makeRights({add_admins: true, invite_users: true})
    });
    const requested = makeRights({invite_users: true, manage_topics: true, other: true});

    expect(limitBotAdminRights(chat, requested)).toEqual(makeRights({invite_users: true}));
  });

  test('does not restrict rights granted by a channel creator', () => {
    const requested = makeRights({invite_users: true, manage_topics: true, other: true});

    expect(limitBotAdminRights(makeChannel({creator: true}), requested)).toEqual(requested);
  });

  test('requires invite permission only when the bot is missing from a group', () => {
    const cannotInvite = makeChannel({adminRights: makeRights({add_admins: true})});
    const canInvite = makeChannel({adminRights: makeRights({add_admins: true, invite_users: true})});

    expect(canOpenBotAdminEditor(cannotInvite, true)).toBe(false);
    expect(canOpenBotAdminEditor(cannotInvite, false)).toBe(true);
    expect(canOpenBotAdminEditor(canInvite, true)).toBe(true);
    expect(canOpenBotAdminEditor(makeChannel({broadcast: true}), true)).toBe(true);
  });
});

describe('getBotAdminRightsForChat', () => {
  const groupDefaults = makeRights({delete_messages: true});
  const channelDefaults = makeRights({post_messages: true});
  const userFull = {
    bot_group_admin_rights: groupDefaults,
    bot_broadcast_admin_rights: channelDefaults
  } as UserFull.userFull;

  test('uses requested rights for the matching admin scope', () => {
    const requested = makeRights({invite_users: true});

    expect(getBotAdminRightsForChat({
      chat: makeChannel({broadcast: true}),
      userFull,
      scope: 'channelAdmin',
      requestedRights: requested
    })).toBe(requested);
    expect(getBotAdminRightsForChat({
      chat: makeGroup(),
      userFull,
      scope: 'groupAdmin',
      requestedRights: requested
    })).toBe(requested);
  });

  test('falls back to bot defaults when an admin scope requests no rights', () => {
    expect(getBotAdminRightsForChat({
      chat: makeChannel({broadcast: true}),
      userFull,
      scope: 'channelAdmin',
      requestedRights: makeRights({})
    })).toBe(channelDefaults);
    expect(getBotAdminRightsForChat({
      chat: makeGroup(),
      userFull,
      scope: 'groupAdmin',
      requestedRights: makeRights({})
    })).toBe(groupDefaults);
  });

  test('keeps group and channel admin scopes separate', () => {
    expect(getBotAdminRightsForChat({
      chat: makeGroup(),
      userFull,
      scope: 'channelAdmin'
    })).toBeUndefined();
    expect(getBotAdminRightsForChat({
      chat: makeChannel({broadcast: true}),
      userFull,
      scope: 'groupAdmin'
    })).toBeUndefined();
  });
});
