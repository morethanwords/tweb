import {beforeEach, describe, expect, it, vi} from 'vitest';
import '@helpers/peerIdPolyfill';
import type {
  CommunityLinkedPeerKind
} from '@appManagers/utils/communities/getCommunityLinkedPeerKind';

const mocks = vi.hoisted(() => ({
  contextMenuOptions: undefined as any,
  chats: new Map<number, any>(),
  peers: new Map<number, any>(),
  dialogs: new Map<number, any>(),
  isDialogUnread: vi.fn(),
  isPeerLocalMuted: vi.fn(),
  getDialogFilters: vi.fn(),
  getDeleteButtonText: vi.fn()
}));

vi.mock('@helpers/dom/createContextMenu', () => ({
  default: (options: any) => {
    mocks.contextMenuOptions = options;
    return options;
  }
}));

vi.mock('@environment/sharedWorkerSupport', () => ({default: true}));

vi.mock('@lib/appDialogsManager', () => ({
  default: {
    filterId: 0,
    openDialogInNewTab: vi.fn(),
    toggleForumTabByPeerId: vi.fn()
  },
  findDialogListElement: (target: HTMLElement) => target
}));

vi.mock('@lib/appImManager', () => ({
  default: {toggleViewAsMessages: vi.fn()}
}));

vi.mock('@lib/apiManagerProxy', () => ({
  default: {
    getChat: (chatId: ChatId) => mocks.chats.get(+chatId),
    getPeer: (peerId: PeerId) => mocks.peers.get(+peerId),
    getCommunityDialog: (): undefined => undefined,
    isForum: () => false,
    isBotforum: () => false
  }
}));

vi.mock('@lib/rootScope', () => ({
  default: {myId: (1 as UserId).toPeerId(false)}
}));

vi.mock('@stores/appSettings', () => ({
  useAppSettings: () => [{savedAsForum: false}]
}));

vi.mock('@lib/langPack', () => ({
  i18n: (key: string) => document.createTextNode(key),
  _i18n: vi.fn()
}));

vi.mock('@components/createSubmenuTrigger', () => ({
  // keep the item itself — only its submenu machinery is out of scope here
  default: ({options}: any) => ({...options, onClick: vi.fn()})
}));

vi.mock('@components/popups', () => ({default: {createPopup: vi.fn()}}));
vi.mock('@components/popups/deleteDialog', () => ({default: vi.fn()}));
vi.mock('@components/popups/mute', () => ({default: vi.fn()}));
vi.mock('@components/popups/limit', () => ({default: vi.fn()}));
vi.mock('@components/popups/chatPreview', () => ({
  default: vi.fn(),
  chatPreviewAnchorFromDialogRow: vi.fn()
}));
vi.mock('@components/toast', () => ({toastNew: vi.fn()}));
vi.mock('@components/confirmationPopup', () => ({default: vi.fn()}));
vi.mock('@components/wrappers/getPeerTitle', () => ({default: vi.fn()}));
vi.mock('@components/chat/removeFee', () => ({openRemoveFeePopup: vi.fn()}));
vi.mock('@components/communities/leaveCommunity', () => ({
  default: vi.fn(),
  canLeaveCommunity: () => true
}));

import DialogsContextMenu from '@components/dialogsContextMenu';

const communityId = 10 as ChatId;
const communityPeerId = communityId.toPeerId(true);
const chatId = 20 as ChatId;
const peerId = chatId.toPeerId(true);

const managers = {
  appCommunitiesManager: {
    isCommunityMuted: vi.fn(),
    markCommunityRead: vi.fn(),
    toggleCollapsedInDialogs: vi.fn(),
    toggleCommunityPin: vi.fn(),
    togglePeerLink: vi.fn()
  },
  appChatsManager: {
    getChat: async(id: ChatId) => mocks.chats.get(+id)
  },
  appMessagesManager: {
    isDialogUnread: mocks.isDialogUnread
  },
  appNotificationsManager: {
    isPeerLocalMuted: mocks.isPeerLocalMuted
  },
  appPeersManager: {
    getDeleteButtonText: mocks.getDeleteButtonText
  },
  dialogsStorage: {
    getAnyDialog: async(id: PeerId) => mocks.dialogs.get(+id),
    canManageTopic: async() => false
  },
  filtersStorage: {
    getDialogFilters: mocks.getDialogFilters
  }
} as any;

function makeRow(options: {
  peerId: PeerId,
  communityId?: ChatId,
  communityChatKind?: CommunityLinkedPeerKind
}) {
  const li = document.createElement('li');
  li.classList.add('chatlist-chat');
  li.dataset.peerId = '' + options.peerId;
  if(options.communityId !== undefined) {
    li.dataset.communityId = '' + options.communityId;
  }
  if(options.communityChatKind) {
    li.dataset.communityChatKind = options.communityChatKind;
  }
  return li;
}

async function openMenu(li: HTMLElement) {
  const menu = new DialogsContextMenu(managers);
  menu.attach(document.createElement('ul'));
  await mocks.contextMenuOptions.onOpen(undefined, li);
  const buttons: any[] = [];
  for(const button of mocks.contextMenuOptions.buttons) {
    if(!button.verify || await button.verify()) {
      buttons.push(button);
    }
  }

  return buttons;
}

const texts = (buttons: any[]) => buttons.map((button) => button.text);

describe('DialogsContextMenu on a Community chat row', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.contextMenuOptions = undefined;
    mocks.chats = new Map<number, any>([
      [+communityId, {
        _: 'community',
        id: communityId,
        pFlags: {collapsed_in_dialogs: true},
        admin_rights: {_: 'chatAdminRights', pFlags: {manage_linked_peers: true}}
      }],
      [+chatId, {_: 'channel', id: chatId, pFlags: {megagroup: true}}]
    ]);
    mocks.peers = new Map<number, any>([
      [+communityPeerId, mocks.chats.get(+communityId)],
      [+peerId, mocks.chats.get(+chatId)]
    ]);
    mocks.dialogs = new Map<number, any>([
      [+peerId, {_: 'dialog', peerId, folder_id: 0, unread_count: 3, pFlags: {}}]
    ]);
    // as async as the real manager proxy — `!promise` is always false, so a missing
    // await here is exactly what hides the Mute item
    managers.appCommunitiesManager.isCommunityMuted.mockResolvedValue(false);
    mocks.isDialogUnread.mockResolvedValue(true);
    mocks.isPeerLocalMuted.mockResolvedValue(true);
    mocks.getDialogFilters.mockResolvedValue([
      {id: 0},
      {id: 1},
      {id: 2}
    ]);
    mocks.getDeleteButtonText.mockResolvedValue('DeleteChat');
  });

  it('offers the regular dialog actions on a joined chat', async() => {
    const buttons = await openMenu(makeRow({
      peerId,
      communityId,
      communityChatKind: 'joined'
    }));

    expect(texts(buttons)).toEqual([
      'OpenInNewTab',
      'ChatList.Context.Preview',
      'MarkAsRead',
      'ChatList.Context.Unmute',
      'Community.RemoveChat',
      'Delete'
    ]);
  });

  it('drops the chat-list placement actions while the Community is folded', async() => {
    const buttons = await openMenu(makeRow({
      peerId,
      communityId,
      communityChatKind: 'joined'
    }));

    expect(texts(buttons)).not.toContain('AddToFolder');
    expect(texts(buttons)).not.toContain('ChatList.Context.Pin');
    expect(texts(buttons)).not.toContain('Archive');
  });

  it('offers them back once the Community shows its chats separately', async() => {
    mocks.chats.get(+communityId).pFlags = {};
    const buttons = await openMenu(makeRow({
      peerId,
      communityId,
      communityChatKind: 'joined'
    }));

    expect(texts(buttons)).toEqual([
      'OpenInNewTab',
      'ChatList.Context.Preview',
      'MarkAsRead',
      'AddToFolder',
      'ChatList.Context.Pin',
      'ChatList.Context.Unmute',
      'Archive',
      'Community.RemoveChat',
      'Delete'
    ]);
  });

  it('keeps a chat we only watch down to what it can actually do', async() => {
    mocks.dialogs.clear();
    const buttons = await openMenu(makeRow({
      peerId,
      communityId,
      communityChatKind: 'viewable'
    }));

    // no dialog of its own, so nothing that acts on one — but its history is previewable
    expect(texts(buttons)).toEqual([
      'OpenInNewTab',
      'ChatList.Context.Preview',
      'Community.RemoveChat'
    ]);
  });

  it('leaves a chat we cannot even open with the link action alone', async() => {
    mocks.dialogs.clear();
    for(const kind of ['requestable', 'hidden'] as const) {
      const buttons = await openMenu(makeRow({
        peerId,
        communityId,
        communityChatKind: kind
      }));

      // nothing that opens or reads a chat we have no access to
      expect(texts(buttons)).toEqual(['Community.RemoveChat']);
    }
  });

  it('gives no menu at all on such a chat when we cannot manage the links', async() => {
    mocks.dialogs.clear();
    mocks.chats.get(+communityId).admin_rights = undefined;
    const buttons = await openMenu(makeRow({
      peerId,
      communityId,
      communityChatKind: 'requestable'
    }));

    expect(texts(buttons)).toEqual([]);
  });

  it('offers the Community-wide actions on the Community row itself', async() => {
    const buttons = await openMenu(makeRow({
      peerId: communityPeerId,
      communityId
    }));

    expect(texts(buttons)).toEqual([
      'OpenInNewTab',
      'Community.View',
      'ChatList.Context.Pin',
      'ChatList.Context.Mute',
      'Community.ShowSeparately',
      'Community.Leave'
    ]);
    // unlinking a chat from the Community means nothing on the Community itself
    expect(texts(buttons)).not.toContain('Community.RemoveChat');
  });

  it('flips that to Unmute once the whole Community is muted', async() => {
    managers.appCommunitiesManager.isCommunityMuted.mockResolvedValue(true);
    const buttons = await openMenu(makeRow({
      peerId: communityPeerId,
      communityId
    }));

    expect(texts(buttons)).toContain('ChatList.Context.Unmute');
    expect(texts(buttons)).not.toContain('ChatList.Context.Mute');
  });
});
