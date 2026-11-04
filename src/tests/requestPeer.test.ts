import '@helpers/peerIdPolyfill';
import type {ButtonType, Chat, ChatAdminRights, RequestPeerType} from '@layer';
import I18n, {i18n, LangPackKey} from '@lib/langPack';
import lang from '@/lang';

/*
 * A bot's button (or a Mini App) asks for a group or a channel. Sending one has the server add the bot to it —
 * an admin with the rights the bot named, or a member of a group it has to be in — so the user is told that,
 * with the rights, before anything is sent, and only chats where the user can grant those rights are offered.
 */

const mocks = vi.hoisted(() => ({
  pick: vi.fn(),
  confirm: vi.fn(),
  getCommonChats: vi.fn(),
  getParticipant: vi.fn()
}));

const NAMES: {[peerId: number]: string} = {
  [7]: 'Helper Bot',
  [-100]: 'News',
  [-200]: 'Team',
  [-300]: 'Family'
};

vi.mock('@components/popups/pickUser', () => ({showPickUser2Popup: mocks.pick}));
vi.mock('@components/confirmationPopup', () => ({default: mocks.confirm}));
vi.mock('@components/toast', () => ({toastNew: vi.fn()}));
vi.mock('@components/wrappers/peerTitle', () => ({
  default: vi.fn(async({peerId}: {peerId: PeerId}) => {
    const element = document.createElement('span');
    element.textContent = NAMES[peerId];
    return element;
  })
}));
vi.mock('@lib/rootScope', () => ({
  default: {
    managers: {
      appUsersManager: {getCommonChats: mocks.getCommonChats},
      appProfileManager: {getParticipant: mocks.getParticipant}
    },
    addEventListener: vi.fn(),
    dispatchEvent: vi.fn()
  }
}));

let selectRequestPeers: typeof import('@components/popups/requestPeer')['default'];

beforeAll(async() => {
  // * the English strings, as the question is read in them
  for(const string of I18n.formatLocalStrings(lang)) {
    I18n.strings.set(string.key as LangPackKey, string);
  }

  ({default: selectRequestPeers} = await import('@components/popups/requestPeer'));
});

beforeEach(() => {
  vi.clearAllMocks();
  mocks.confirm.mockResolvedValue(undefined);
  mocks.getCommonChats.mockResolvedValue({_: 'messages.chats', chats: []});
  mocks.getParticipant.mockRejectedValue({type: 'USER_NOT_PARTICIPANT'});
});

const BOT_PEER_ID = 7 as PeerId;

const rights = (...flags: (keyof ChatAdminRights['pFlags'])[]): ChatAdminRights => ({
  _: 'chatAdminRights',
  pFlags: Object.fromEntries(flags.map((flag) => [flag, true]))
});

const button = (peerType: RequestPeerType, maxQuantity = 1): ButtonType.buttonTypeRequestPeer => ({
  _: 'buttonTypeRequestPeer',
  button_id: 1,
  peer_type: peerType,
  max_quantity: maxQuantity
});

async function select(peerType: RequestPeerType, chosen: PeerId[]) {
  mocks.pick.mockResolvedValue(chosen);
  return selectRequestPeers({button: button(peerType, chosen.length), requestingPeerId: BOT_PEER_ID});
}

/** The question the user is asked, as it reads */
function askedText() {
  expect(mocks.confirm).toHaveBeenCalledOnce();
  const {descriptionLangKey, descriptionLangArgs} = mocks.confirm.mock.calls[0][0];
  return i18n(descriptionLangKey, descriptionLangArgs).textContent;
}

describe('the question before a chat is sent to a bot', () => {
  test('a channel the bot asks admin rights in says the bot becomes its admin, and with which rights', async() => {
    const peerType: RequestPeerType = {
      _: 'requestPeerTypeBroadcast',
      pFlags: {},
      bot_admin_rights: rights('change_info', 'post_messages', 'other', 'delete_messages')
    };

    await expect(select(peerType, [-100 as PeerId])).resolves.toEqual([-100]);
    expect(askedText()).toBe(
      'Are you sure you want to send News to Helper Bot? This will also add Helper Bot to News with the following rights: ' +
      'Change Channel Info, Post Messages, Delete Messages of Others and Other'
    );
  });

  test('a group the bot asks admin rights in names the rights of a group', async() => {
    const peerType: RequestPeerType = {
      _: 'requestPeerTypeChat',
      pFlags: {},
      bot_admin_rights: rights('delete_messages', 'ban_users', 'pin_messages')
    };

    await select(peerType, [-200 as PeerId]);
    expect(askedText()).toBe(
      'Are you sure you want to send Team to Helper Bot? This will also add Helper Bot to Team with the following rights: ' +
      'Delete Messages, Ban Users and Pin Messages'
    );
  });

  test('admin rights with none named still say the bot is added', async() => {
    const peerType: RequestPeerType = {_: 'requestPeerTypeBroadcast', pFlags: {}, bot_admin_rights: rights()};

    await select(peerType, [-100 as PeerId]);
    expect(askedText()).toBe('Are you sure you want to send News to Helper Bot? This will also add Helper Bot to News.');
  });

  test('a group the bot has to be in says the bot joins the ones it is not in yet', async() => {
    mocks.getCommonChats.mockResolvedValue({_: 'messages.chats', chats: [{_: 'channel', id: 200}]});
    const peerType: RequestPeerType = {_: 'requestPeerTypeChat', pFlags: {bot_participant: true}};

    await select(peerType, [-200 as PeerId, -300 as PeerId]);
    expect(askedText()).toBe(
      'Are you sure you want to send Team, Family to Helper Bot? This will also add Helper Bot to Family.'
    );
  });

  test('a group the bot is in already only asks to send it', async() => {
    mocks.getCommonChats.mockResolvedValue({_: 'messages.chats', chats: [{_: 'channel', id: 200}]});
    const peerType: RequestPeerType = {_: 'requestPeerTypeChat', pFlags: {bot_participant: true}};

    await select(peerType, [-200 as PeerId]);
    expect(askedText()).toBe('Are you sure you want to send Team to Helper Bot?');
  });

  test('a chat that adds no one only asks to send it', async() => {
    await select({_: 'requestPeerTypeChat', pFlags: {}}, [-200 as PeerId]);
    expect(askedText()).toBe('Are you sure you want to send Team to Helper Bot?');
  });

  test('nothing is sent when the user declines', async() => {
    mocks.confirm.mockRejectedValue(undefined);
    const peerType: RequestPeerType = {_: 'requestPeerTypeBroadcast', pFlags: {}, bot_admin_rights: rights('post_messages')};

    await expect(select(peerType, [-100 as PeerId])).rejects.toBeUndefined();
  });

  test('a user is sent without a question', async() => {
    await expect(select({_: 'requestPeerTypeUser'}, [5 as PeerId])).resolves.toEqual([5]);
    expect(mocks.confirm).not.toHaveBeenCalled();
  });
});

describe('the chats offered to a bot that asks for admin rights', () => {
  const channel = (pFlags: Chat.channel['pFlags'], adminRights?: ChatAdminRights): Chat.channel => ({
    _: 'channel',
    id: 100,
    title: 'News',
    pFlags: {broadcast: true, ...pFlags},
    admin_rights: adminRights
  } as Chat.channel);

  const group = (adminRights?: ChatAdminRights): Chat.channel => ({
    _: 'channel',
    id: 200,
    title: 'Team',
    pFlags: {megagroup: true},
    admin_rights: adminRights
  } as Chat.channel);

  const botAdmin = (...flags: (keyof ChatAdminRights['pFlags'])[]) => ({
    _: 'channelParticipantAdmin',
    user_id: 7,
    admin_rights: rights(...flags)
  });

  async function offered(botAdminRights: ChatAdminRights, chat: Chat.channel) {
    const isBroadcast = !!chat.pFlags.broadcast;
    mocks.pick.mockResolvedValue([]);
    await selectRequestPeers({
      button: button(isBroadcast ?
        {_: 'requestPeerTypeBroadcast', pFlags: {}, bot_admin_rights: botAdminRights} :
        {_: 'requestPeerTypeChat', pFlags: {}, bot_admin_rights: botAdminRights}),
      requestingPeerId: BOT_PEER_ID
    });

    const {filterPeerTypeBy} = mocks.pick.mock.calls[0][0];
    return filterPeerTypeBy(chat);
  }

  test('its owner\'s channel', async() => {
    expect(await offered(rights('post_messages', 'add_admins'), channel({creator: true}))).toBe(true);
  });

  test('a channel whose admin can add admins and has every right asked for', async() => {
    const chat = channel({}, rights('add_admins', 'post_messages', 'edit_messages'));
    expect(await offered(rights('post_messages', 'edit_messages'), chat)).toBe(true);
  });

  test('not a channel the bot is not in, whose admin lacks a right asked for', async() => {
    const chat = channel({}, rights('add_admins', 'post_messages'));
    expect(await offered(rights('post_messages', 'edit_messages'), chat)).toBe(false);
  });

  test('not a channel the bot is not in, whose admin cannot add admins', async() => {
    const chat = channel({}, rights('post_messages', 'edit_messages'));
    expect(await offered(rights('post_messages'), chat)).toBe(false);
  });

  test('a channel whose bot is an admin with every right asked for already, to its admin who cannot add admins', async() => {
    mocks.getParticipant.mockResolvedValue(botAdmin('post_messages', 'edit_messages', 'delete_messages'));

    const chat = channel({}, rights('post_messages'));
    expect(await offered(rights('post_messages', 'edit_messages'), chat)).toBe(true);
    expect(mocks.getParticipant).toHaveBeenCalledWith(100, BOT_PEER_ID);
  });

  test('not a channel whose bot is an admin without a right asked for', async() => {
    mocks.getParticipant.mockResolvedValue(botAdmin('post_messages'));

    const chat = channel({}, rights('post_messages'));
    expect(await offered(rights('post_messages', 'edit_messages'), chat)).toBe(false);
  });

  test('a channel the user only reads, whose admins it cannot see, is left to the server', async() => {
    expect(await offered(rights('post_messages'), channel({}))).toBe(true);
    expect(mocks.getParticipant).not.toHaveBeenCalled();
  });

  test('not a group the bot is not in, to a member who cannot promote it', async() => {
    expect(await offered(rights('delete_messages'), group())).toBe(false);
    expect(mocks.getParticipant).not.toHaveBeenCalled();
  });

  test('a group whose bot is an admin with every right asked for already, to its member', async() => {
    mocks.getCommonChats.mockResolvedValue({_: 'messages.chats', chats: [{_: 'channel', id: 200}]});
    mocks.getParticipant.mockResolvedValue(botAdmin('delete_messages', 'pin_messages'));

    expect(await offered(rights('delete_messages'), group())).toBe(true);
  });

  test('not a group whose bot is only a member, to a member who cannot promote it', async() => {
    mocks.getCommonChats.mockResolvedValue({_: 'messages.chats', chats: [{_: 'channel', id: 200}]});
    mocks.getParticipant.mockResolvedValue({_: 'channelParticipant', user_id: 7, date: 1});

    expect(await offered(rights('delete_messages'), group())).toBe(false);
  });

  test('a group the bot may be in, past the first page of its common chats, is left to the server', async() => {
    const page = Array.from({length: 100}, (_, index) => ({_: 'channel', id: 1000 + index}));
    mocks.getCommonChats.mockResolvedValue({_: 'messages.chatsSlice', count: 101, chats: page});

    expect(await offered(rights('delete_messages'), group())).toBe(true);
  });
});
