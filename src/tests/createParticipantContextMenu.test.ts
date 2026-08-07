import {beforeEach, describe, expect, it, vi} from 'vitest';
import type {ChannelParticipant} from '@layer';
import '@helpers/peerIdPolyfill';

const mocks = vi.hoisted(() => ({
  appImManager: {
    setInnerPeer: vi.fn()
  },
  contextMenuOptions: undefined as any,
  getChat: vi.fn(),
  hasRights: vi.fn(),
  isBroadcast: vi.fn()
}));

vi.mock('@helpers/dom/createContextMenu', () => ({
  default: (options: any) => {
    mocks.contextMenuOptions = options;
    return options;
  }
}));

vi.mock('@helpers/dom/findUpClassName', () => ({
  default: (target: HTMLElement) => target
}));

vi.mock('@components/addChatUsers', () => ({
  handleMissingInvitees: vi.fn()
}));

vi.mock('@components/solidJsTabs/tabs', () => ({
  openUserPermissionsTab: vi.fn()
}));

vi.mock('@lib/appImManager', () => ({
  default: mocks.appImManager
}));

vi.mock('@lib/rootScope', () => ({
  default: {
    myId: (1 as UserId).toPeerId(false),
    managers: {
      appChatsManager: {
        addToChat: vi.fn(),
        editBanned: vi.fn(),
        getChat: mocks.getChat,
        hasRights: mocks.hasRights,
        isBroadcast: mocks.isBroadcast,
        kickFromChat: vi.fn()
      }
    }
  }
}));

import createParticipantContextMenu
from '@helpers/dom/createParticipantContextMenu';

const chatId = 10 as ChatId;
const participantId = (20 as UserId).toPeerId(false);

function makeParticipant(): ChannelParticipant.channelParticipantBanned {
  return {
    _: 'channelParticipantBanned',
    pFlags: {left: true},
    peer: {
      _: 'peerUser',
      user_id: participantId.toUserId()
    },
    kicked_by: 1 as UserId,
    date: 1,
    banned_rights: {
      _: 'chatBannedRights',
      pFlags: {view_messages: true},
      until_date: 0
    }
  };
}

async function openContextMenu(target: HTMLElement) {
  mocks.contextMenuOptions.findElement({target});
  await mocks.contextMenuOptions.onOpen();
  return mocks.contextMenuOptions.buttons.filter((button: any) => {
    return !button.verify || button.verify();
  });
}

describe('createParticipantContextMenu', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.contextMenuOptions = undefined;
    mocks.getChat.mockResolvedValue({
      _: 'channel',
      pFlags: {megagroup: true, creator: true},
      id: chatId,
      access_hash: '1',
      title: 'Chat',
      photo: {_: 'chatPhotoEmpty'},
      date: 1
    });
    mocks.hasRights.mockResolvedValue(true);
    mocks.isBroadcast.mockResolvedValue(false);
  });

  it('uses the standard menu shell with a Community unban adapter', async() => {
    const participant = makeParticipant();
    const hasRights = vi.fn().mockResolvedValue(true);
    const unban = vi.fn();
    const target = document.createElement('div');
    target.classList.add('chatlist-chat');
    target.dataset.peerId = '' + participantId;

    createParticipantContextMenu({
      listenTo: document.createElement('div'),
      slider: {} as any,
      chatId,
      participants: new Map([[participantId, participant]]),
      bannedParticipantAdapter: {
        hasRights,
        unban
      }
    });
    const buttons = await openContextMenu(target);

    expect(buttons.map((button: any) => button.text)).toEqual([
      'SendMessage',
      'Delete'
    ]);
    expect(mocks.getChat).not.toHaveBeenCalled();
    expect(hasRights).toHaveBeenCalledOnce();

    buttons.find((button: any) => button.text === 'SendMessage').onClick();
    expect(mocks.appImManager.setInnerPeer).toHaveBeenCalledWith({
      peerId: participantId
    });
    await buttons.find((button: any) => button.text === 'Delete').onClick();
    expect(unban).toHaveBeenCalledWith(participantId, participant);
  });

  it('preserves the normal chat Removed Users actions', async() => {
    const participant = makeParticipant();
    const target = document.createElement('div');
    target.classList.add('chatlist-chat');
    target.dataset.peerId = '' + participantId;

    createParticipantContextMenu({
      listenTo: document.createElement('div'),
      slider: {} as any,
      chatId,
      participants: new Map([[participantId, participant]])
    });
    const buttons = await openContextMenu(target);

    expect(buttons.map((button: any) => button.text)).toEqual([
      'SendMessage',
      'AddToGroup',
      'SetAsAdmin',
      'Delete'
    ]);
    expect(mocks.getChat).toHaveBeenCalledWith(chatId);
    expect(mocks.hasRights).toHaveBeenCalledTimes(2);
  });
});
