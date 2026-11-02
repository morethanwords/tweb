import {beforeEach, describe, expect, it, vi} from 'vitest';
import type {ChannelParticipant} from '@layer';
import deferredPromise from '@helpers/cancellablePromise';
import '@helpers/peerIdPolyfill';

const mocks = vi.hoisted(() => ({
  contextMenu: vi.fn(),
  createSelector: vi.fn(),
  handleChannelsTooMuch: vi.fn((callback: () => Promise<unknown>) => {
    return callback();
  }),
  hasRights: vi.fn((_chat: unknown, _action: string) => true),
  openPermissions: vi.fn(),
  pickerOptions: undefined as any,
  showPickUserPopup: vi.fn(),
  toastNew: vi.fn()
}));

vi.mock('@components/toast', () => ({
  toastNew: mocks.toastNew
}));

vi.mock('@appManagers/utils/chats/hasRights', () => ({
  default: (chat: unknown, action: string) => mocks.hasRights(chat, action)
}));

vi.mock('@components/popups/channelsTooMuch', () => ({
  handleChannelsTooMuch: mocks.handleChannelsTooMuch
}));

vi.mock('@components/popups/pickUser', () => ({
  default: mocks.showPickUserPopup
}));

vi.mock('@components/solidJsTabs/tabs', () => ({
  openUserPermissionsTab: mocks.openPermissions
}));

vi.mock('@components/sidebarRight/tabs/participantsSelector', () => ({
  createSelectorForParticipants: mocks.createSelector
}));

vi.mock('@helpers/dom/createParticipantContextMenu', () => ({
  default: mocks.contextMenu
}));

import createChatAdministratorsSource
from '@components/sidebarRight/tabs/chatAdministratorsSource';
import * as mocked1 from '@components/solidJsTabs/tabs';
import {registerHotReloadGuard} from '@lib/solidjs/hotReloadGuardProvider';

// the code under test reads the top level from the registry, not from the modules mocked above
registerHotReloadGuard({
  tabs: {...mocked1} as any
});


const chatId = 10 as ChatId;
const participantId = (20 as UserId).toPeerId(false);

const participant: ChannelParticipant.channelParticipantAdmin = {
  _: 'channelParticipantAdmin',
  pFlags: {can_edit: true},
  user_id: participantId.toUserId(),
  promoted_by: 1 as UserId,
  date: 1,
  admin_rights: {
    _: 'chatAdminRights',
    pFlags: {change_info: true}
  }
};

describe('chat administrators source', () => {
  let selector: any;
  let tab: any;

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.hasRights.mockReturnValue(true);
    selector = {
      participants: new Map([[participantId, participant]]),
      scrollable: {
        append: vi.fn(),
        container: document.createElement('div')
      }
    };
    mocks.createSelector.mockReturnValue({
      selector,
      loadPromise: Promise.resolve()
    });
    mocks.showPickUserPopup.mockImplementation((options) => {
      mocks.pickerOptions = options;
      return {selector};
    });
    tab = {
      managers: {
        apiManager: {
          getAppConfig: vi.fn().mockResolvedValue({
            telegram_antispam_group_size_min: 100
          })
        },
        appChatsManager: {
          getChat: vi.fn().mockResolvedValue({
            _: 'channel',
            id: chatId,
            pFlags: {broadcast: true},
            participants_count: 1
          }),
          isBroadcast: vi.fn().mockResolvedValue(true),
          toggleAntiSpam: vi.fn().mockResolvedValue(undefined)
        },
        appProfileManager: {
          getChatFull: vi.fn().mockResolvedValue({
            _: 'channelFull',
            pFlags: {}
          })
        }
      },
      slider: {}
    };
  });

  it('provides the existing chat selector, picker and permissions behavior', async() => {
    const middleware = (() => true) as any;
    const source = await createChatAdministratorsSource({
      tab,
      chatId,
      middleware
    });

    expect(source.canAddAdmins).toBe(true);
    expect(source.createSelector({} as any).selector).toBe(selector);
    expect(mocks.createSelector).toHaveBeenCalledWith(expect.objectContaining({
      peerId: chatId.toPeerId(true),
      channelParticipantsUpdateFilter: expect.any(Function),
      channelParticipantsFilter: expect.any(Function)
    }));

    const open = vi.fn();
    source.openAddAdmin(open);
    mocks.pickerOptions.onSelect([{peerId: participantId}]);
    expect(open).toHaveBeenCalledWith(participant);
    expect(mocks.pickerOptions).toMatchObject({
      peerType: ['channelParticipants', 'custom'],
      // * a member stage alone shows the user by name; the stage after it must not turn them into Saved Messages
      meAsSaved: false
    });

    source.openPermissions({
      participantId,
      participant,
      onUpdated: vi.fn()
    });
    expect(mocks.openPermissions).toHaveBeenCalledWith(
      tab.slider,
      chatId,
      participant,
      true
    );

    source.attachSelectorBehavior(selector);
    expect(mocks.contextMenu).toHaveBeenCalledWith(expect.objectContaining({
      chatId,
      participants: selector.participants,
      middleware
    }));
  });

  it('exposes anti-spam as data and an action instead of building UI', async() => {
    tab.managers.appChatsManager.getChat.mockResolvedValue({
      _: 'channel',
      id: chatId,
      pFlags: {},
      participants_count: 100
    });
    tab.managers.appChatsManager.isBroadcast.mockResolvedValue(false);
    tab.managers.appProfileManager.getChatFull.mockResolvedValue({
      _: 'channelFull',
      pFlags: {antispam: true}
    });

    const source = await createChatAdministratorsSource({
      tab,
      chatId,
      middleware: (() => true) as any
    });

    expect(source.antiSpam).toMatchObject({
      checked: true,
      disabled: false
    });

    await source.antiSpam.toggle(false);
    expect(mocks.handleChannelsTooMuch).toHaveBeenCalledOnce();
    expect(tab.managers.appChatsManager.toggleAntiSpam)
    .toHaveBeenCalledWith(chatId, false);
  });

  const makeSource = (chat?: object) => {
    if(chat) {
      tab.managers.appChatsManager.getChat.mockResolvedValue({id: chatId, participants_count: 1, ...chat});
      tab.managers.appChatsManager.isBroadcast.mockResolvedValue(false);
    }

    return createChatAdministratorsSource({
      tab,
      chatId,
      middleware: (() => true) as any
    });
  };

  const supergroup = {_: 'channel', pFlags: {megagroup: true}};

  it('finds people outside the chat after its members, for a typed query only', async() => {
    const searchContacts = vi.fn().mockResolvedValue({
      my_results: [(1).toPeerId(), (2).toPeerId(true)],
      results: [(3).toPeerId()]
    });
    tab.managers.appUsersManager = {searchContacts};
    const source = await makeSource();
    source.openAddAdmin(vi.fn());
    const {getMoreCustom} = mocks.pickerOptions;

    expect(await getMoreCustom('', () => true)).toEqual({result: [], isEnd: true});
    expect(searchContacts).not.toHaveBeenCalled();

    expect(await getMoreCustom('bot', () => true)).toEqual({
      result: [(1).toPeerId(), (3).toPeerId()],
      isEnd: true
    });
    expect(searchContacts).toHaveBeenCalledWith('bot');
  });

  it('lets someone outside a channel be promoted, which adds them', async() => {
    const botId = (30 as UserId).toPeerId(false);
    const missing = {_: 'channelParticipant', user_id: botId.toUserId(), date: 1};
    mocks.hasRights.mockReturnValue(false);
    tab.managers.appProfileManager.getParticipantOrMissing = vi.fn().mockResolvedValue({
      participant: missing,
      missing: true
    });

    const source = await makeSource();
    const open = vi.fn();
    source.openAddAdmin(open);
    await mocks.pickerOptions.onSelect([{peerId: botId}]);
    expect(tab.managers.appProfileManager.getParticipantOrMissing).toHaveBeenCalledWith(chatId, botId);
    expect(open).toHaveBeenCalledWith(missing);
  });

  it('opens the rights of a found user who is a member already', async() => {
    const memberId = (40 as UserId).toPeerId(false);
    const member = {_: 'channelParticipant', user_id: memberId.toUserId(), date: 1};
    mocks.hasRights.mockReturnValue(false);
    tab.managers.appProfileManager.getParticipantOrMissing = vi.fn().mockResolvedValue({
      participant: member,
      missing: false
    });

    const source = await makeSource(supergroup);
    const open = vi.fn();
    source.openAddAdmin(open);
    await mocks.pickerOptions.onSelect([{peerId: memberId}]);
    expect(open).toHaveBeenCalledWith(member);
    expect(mocks.toastNew).not.toHaveBeenCalled();
  });

  it('asks the right to add members to promote someone outside a supergroup, bot or not', async() => {
    const botId = (30 as UserId).toPeerId(false);
    tab.managers.appProfileManager.getParticipantOrMissing = vi.fn().mockResolvedValue({
      participant: {_: 'channelParticipant', user_id: botId.toUserId(), date: 1},
      missing: true
    });

    const source = await makeSource(supergroup);
    const open = vi.fn();
    source.openAddAdmin(open);

    mocks.hasRights.mockImplementation((_chat: unknown, action: string) => action !== 'invite_users');
    await mocks.pickerOptions.onSelect([{peerId: botId}]);
    expect(open).not.toHaveBeenCalled();
    expect(mocks.toastNew).toHaveBeenCalledWith({langPackKey: 'AddAdminErrorNotAMember'});

    mocks.hasRights.mockReturnValue(true);
    await mocks.pickerOptions.onSelect([{peerId: botId}]);
    expect(open).toHaveBeenCalledOnce();
  });

  it('opens nothing once the picker or the tab is gone while the lookup runs', async() => {
    const userId = (30 as UserId).toPeerId(false);
    const lookup = {participant: {_: 'channelParticipant', user_id: userId.toUserId(), date: 1}, missing: true};
    let middlewareAlive = true;
    const source = await createChatAdministratorsSource({
      tab,
      chatId,
      middleware: (() => middlewareAlive) as any
    });
    const open = vi.fn();

    for(const dismiss of [() => mocks.pickerOptions.onClose(), () => middlewareAlive = false]) {
      const deferred = deferredPromise<typeof lookup>();
      tab.managers.appProfileManager.getParticipantOrMissing = vi.fn(() => deferred);
      source.openAddAdmin(open);
      const selecting = mocks.pickerOptions.onSelect([{peerId: userId}]);
      dismiss();
      deferred.resolve(lookup);
      await selecting;
    }

    expect(open).not.toHaveBeenCalled();
  });

  it('says so when the lookup fails', async() => {
    tab.managers.appProfileManager.getParticipantOrMissing = vi.fn().mockRejectedValue({type: 'CHANNEL_PRIVATE'});
    const source = await makeSource();
    const open = vi.fn();
    source.openAddAdmin(open);
    await mocks.pickerOptions.onSelect([{peerId: (30 as UserId).toPeerId(false)}]);
    expect(open).not.toHaveBeenCalled();
    expect(mocks.toastNew).toHaveBeenCalledWith({langPackKey: 'Error.AnError'});
  });

  it('says nothing when the account was switched away during the lookup', async() => {
    tab.managers.appProfileManager.getParticipantOrMissing = vi.fn().mockRejectedValue({type: 'MIDDLEWARE'});
    const source = await makeSource();
    const open = vi.fn();
    source.openAddAdmin(open);
    await mocks.pickerOptions.onSelect([{peerId: (30 as UserId).toPeerId(false)}]);
    expect(open).not.toHaveBeenCalled();
    expect(mocks.toastNew).not.toHaveBeenCalled();
  });

  it('keeps a basic group to its own members', async() => {
    const source = await makeSource({_: 'chat', pFlags: {}});
    source.openAddAdmin(vi.fn());
    expect(mocks.pickerOptions.peerType).toEqual(['channelParticipants']);
    expect(mocks.pickerOptions.getMoreCustom).toBeUndefined();
  });
});
