import {beforeEach, describe, expect, it, vi} from 'vitest';
import type {ChannelParticipant} from '@layer';
import '@helpers/peerIdPolyfill';

const mocks = vi.hoisted(() => ({
  contextMenu: vi.fn(),
  createSelector: vi.fn(),
  handleChannelsTooMuch: vi.fn((callback: () => Promise<unknown>) => {
    return callback();
  }),
  openPermissions: vi.fn(),
  pickerOptions: undefined as any,
  showPickUserPopup: vi.fn()
}));

vi.mock('@appManagers/utils/chats/hasRights', () => ({
  default: () => true
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
});
