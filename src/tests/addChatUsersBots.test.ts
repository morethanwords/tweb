import '@helpers/peerIdPolyfill';
import type {Chat, User, UserFull} from '@layer';
import pause from '@helpers/schedulers/pause';

/*
 * Members added to a chat are told of every refusal, and a channel's are never bots: a channel takes a bot as
 * an admin only (the server answers USER_BOT), so nothing is sent for one, as in tdesktop - a single bot is
 * offered to be made an admin where admins can be added, more of them are refused with the reason.
 */

const mocks = vi.hoisted(() => ({
  toastNew: vi.fn(),
  confirmationPopup: vi.fn(() => Promise.resolve()),
  openBotAdminEditor: vi.fn(() => Promise.resolve()),
  inviteToChannel: vi.fn(),
  addChatUser: vi.fn(),
  chats: new Map<ChatId, Chat.channel>(),
  users: new Map<UserId, User.user>(),
  userFull: undefined as UserFull.userFull,
  getProfile: vi.fn()
}));

vi.mock('@components/toast', () => ({toastNew: mocks.toastNew}));
vi.mock('@components/confirmationPopup', () => ({default: mocks.confirmationPopup}));
vi.mock('@components/popups/addBotToChat', () => ({openBotAdminEditor: mocks.openBotAdminEditor}));
vi.mock('@components/popups/pickUser', () => ({default: vi.fn()}));
vi.mock('@components/chat/giveaway', () => ({DelimiterWithText: vi.fn()}));
vi.mock('@components/wrappers/peerTitle', () => ({default: vi.fn(async() => document.createElement('span'))}));
// * the confirmation's Add is pressed at once
vi.mock('@components/popups/peer', () => ({
  default: vi.fn((_className: string, options: {buttons: {callback: (e: MouseEvent, checked: Set<string>) => void}[]}) => {
    options.buttons[0].callback(new MouseEvent('click'), new Set());
  })
}));
vi.mock('@lib/solidjs/hotReloadGuardProvider', () => ({hotReloadGuard: {tabs: {AppAddMembersTab: {}}}}));
vi.mock('@lib/accounts/bindManagersToAccount', () => ({bindManagersToSession: (managers: any) => managers}));
vi.mock('@lib/apiManagerProxy', () => ({
  default: {
    getChat: (chatId: ChatId) => mocks.chats.get(chatId),
    getUser: (userId: UserId) => mocks.users.get(userId)
  }
}));
vi.mock('@lib/rootScope', () => {
  const managers = {
    appChatsManager: {
      isChannel: async(chatId: ChatId) => mocks.chats.get(chatId)._ === 'channel',
      isBroadcast: async(chatId: ChatId) => !!mocks.chats.get(chatId).pFlags.broadcast,
      inviteToChannel: mocks.inviteToChannel,
      addChatUser: mocks.addChatUser
    },
    appProfileManager: {
      getProfile: mocks.getProfile,
      getChatInviteLink: async() => ''
    }
  };
  return {default: {managers, addEventListener: vi.fn(), removeEventListener: vi.fn(), dispatchEvent: vi.fn()}};
});

import addChatUsers from '@components/addChatUsers';

const CHAT_ID = 100 as ChatId, BOT_ID = 7 as UserId, USER_ID = 8 as UserId;

function makeChannel(pFlags: Chat.channel['pFlags'], addAdmins: boolean): Chat.channel {
  return {
    _: 'channel',
    id: CHAT_ID,
    pFlags,
    admin_rights: {_: 'chatAdminRights', pFlags: addAdmins ? {add_admins: true} : {}}
  } as Chat.channel;
}

/** opens the add-members screen of the chat and hands it `userIds`, as its button does */
async function addMembers(chat: Chat.channel, userIds: UserId[]) {
  mocks.chats.set(CHAT_ID, chat);
  let takeOut: (peerIds: PeerId[]) => any;
  const attachToPromise = vi.fn();
  const tab = {
    open: (options: {takeOut: typeof takeOut}) => takeOut = options.takeOut,
    payload: {attachToPromise}
  };
  await addChatUsers({peerId: CHAT_ID.toPeerId(true), slider: {createTab: () => tab} as any});
  takeOut(userIds.map((userId) => userId.toPeerId(false)));
  // * the popups and the request settle
  await pause(0);
  await pause(0);
  return {attachToPromise};
}

describe('adding members', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.users.set(BOT_ID, {_: 'user', id: BOT_ID, pFlags: {bot: true}} as User.user);
    mocks.users.set(USER_ID, {_: 'user', id: USER_ID, pFlags: {}} as User.user);
    mocks.userFull = {
      _: 'userFull',
      bot_broadcast_admin_rights: {_: 'chatAdminRights', pFlags: {post_messages: true}}
    } as UserFull.userFull;
    mocks.inviteToChannel.mockResolvedValue([]);
    mocks.getProfile.mockImplementation(async() => mocks.userFull);
  });

  test('offers a bot added to a channel to be made an admin, and sends nothing', async() => {
    const channel = makeChannel({broadcast: true}, true);
    await addMembers(channel, [BOT_ID]);
    expect(mocks.inviteToChannel).not.toHaveBeenCalled();
    expect(mocks.confirmationPopup).toHaveBeenCalledWith({
      descriptionLangKey: 'CantAddBotAsAdmin',
      button: {langKey: 'SetAsAdmin'}
    });
    expect(mocks.openBotAdminEditor).toHaveBeenCalledWith(expect.objectContaining({
      chat: channel,
      botId: BOT_ID,
      rights: mocks.userFull.bot_broadcast_admin_rights
    }));
  });

  test('holds the button while the bot is offered, and keeps the screen after', async() => {
    const {attachToPromise} = await addMembers(makeChannel({broadcast: true}, true), [BOT_ID]);
    expect(attachToPromise).toHaveBeenCalledTimes(1);
    await expect(attachToPromise.mock.calls[0][0]).resolves.toBe(false);
  });

  test('says nothing of what a switch to another account dropped', async() => {
    mocks.inviteToChannel.mockRejectedValue({type: 'MIDDLEWARE'});
    await addMembers(makeChannel({megagroup: true}, false), [USER_ID]);
    mocks.getProfile.mockRejectedValue({type: 'MIDDLEWARE'});
    await addMembers(makeChannel({broadcast: true}, true), [BOT_ID]);
    expect(mocks.toastNew).not.toHaveBeenCalled();
  });

  test('says why when the channel is out of reach by the time the bot is promoted', async() => {
    mocks.getProfile.mockRejectedValue({type: 'CHANNEL_PRIVATE'});
    await addMembers(makeChannel({broadcast: true}, true), [BOT_ID]);
    expect(mocks.openBotAdminEditor).not.toHaveBeenCalled();
    expect(mocks.toastNew).toHaveBeenCalledWith({langPackKey: 'Error.AnError'});
  });

  test('says why when a bot cannot be made the channel\'s admin, or comes with others', async() => {
    await addMembers(makeChannel({broadcast: true}, false), [BOT_ID]);
    await addMembers(makeChannel({broadcast: true}, true), [BOT_ID, USER_ID]);
    expect(mocks.inviteToChannel).not.toHaveBeenCalled();
    expect(mocks.confirmationPopup).not.toHaveBeenCalled();
    expect(mocks.toastNew.mock.calls).toEqual([
      [{langPackKey: 'CantAddBotAsAdmin'}],
      [{langPackKey: 'CantAddBotAsAdmin'}]
    ]);
  });

  test('adds a bot to a group as a member', async() => {
    await addMembers(makeChannel({megagroup: true}, false), [BOT_ID]);
    expect(mocks.inviteToChannel).toHaveBeenCalledWith(CHAT_ID, [BOT_ID.toPeerId(false)]);
    expect(mocks.toastNew).not.toHaveBeenCalled();
  });

  test.each([
    ['BOTS_TOO_MUCH', {broadcast: true}, 'ChannelUserCantBot'],
    ['BOTS_TOO_MUCH', {megagroup: true}, 'GroupUserCantBot'],
    ['USER_PRIVACY_RESTRICTED', {broadcast: true}, 'InviteToChannelError'],
    ['USER_PRIVACY_RESTRICTED', {megagroup: true}, 'InviteToGroupError'],
    ['YOU_BLOCKED_USER', {megagroup: true}, 'YouBlockedUser'],
    ['USER_KICKED', {megagroup: true}, 'AddUserErrorBlacklisted'],
    ['SOMETHING_NEW', {megagroup: true}, 'Error.AnError']
  ] as const)('tells of %s refusing a member (%o)', async(type, pFlags, langPackKey) => {
    mocks.inviteToChannel.mockRejectedValue({type});
    await addMembers(makeChannel(pFlags, false), [USER_ID]);
    expect(mocks.toastNew).toHaveBeenCalledWith({langPackKey});
  });
});
