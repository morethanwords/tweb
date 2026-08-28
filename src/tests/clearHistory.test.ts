import {beforeEach, describe, expect, it, vi} from 'vitest';
import '@helpers/peerIdPolyfill';
import type {Chat} from '@layer';

const mocks = vi.hoisted(() => ({
  confirm: vi.fn(),
  flushHistory: vi.fn(),
  getPeer: vi.fn(),
  getPeerTitle: vi.fn(),
  toast: vi.fn(),
  wrapPeerTitle: vi.fn()
}));

vi.mock('@components/confirmationPopup', () => ({
  default: mocks.confirm
}));

vi.mock('@components/toast', () => ({
  toastNew: mocks.toast
}));

vi.mock('@components/wrappers/getPeerTitle', () => ({
  default: mocks.getPeerTitle
}));

vi.mock('@components/wrappers/peerTitle', () => ({
  default: mocks.wrapPeerTitle
}));

vi.mock('@lib/apiManagerProxy', () => ({
  default: {getPeer: mocks.getPeer}
}));

vi.mock('@lib/rootScope', () => ({
  default: {myId: 777 as PeerId}
}));

import canClearHistory from '@appManagers/utils/chats/canClearHistory';
import clearHistoryWithConfirmation from '@components/clearHistory';

const CHANNEL: Chat.channel = {
  _: 'channel',
  id: 1 as ChatId,
  access_hash: '1',
  title: 'Chat',
  date: 1,
  photo: {_: 'chatPhotoEmpty'},
  pFlags: {}
};

const channel = (pFlags: Chat.channel['pFlags'], rest?: Partial<Chat.channel>): Chat.channel => ({
  ...CHANNEL,
  ...rest,
  pFlags
});

const managers = {
  appMessagesManager: {flushHistory: mocks.flushHistory}
} as any;

describe('canClearHistory', () => {
  it('always offers it in a private chat', () => {
    expect(canClearHistory({_: 'user', id: 1 as UserId, pFlags: {}})).toBe(true);
    expect(canClearHistory({_: 'user', id: 1 as UserId, pFlags: {bot: true}})).toBe(true);
  });

  it('offers it in a legacy group unless the group is migrated away', () => {
    const chat: Chat.chat = {
      _: 'chat',
      id: 1 as ChatId,
      title: 'Group',
      photo: {_: 'chatPhotoEmpty'},
      participants_count: 2,
      date: 1,
      version: 1,
      pFlags: {}
    };

    expect(canClearHistory(chat)).toBe(true);
    expect(canClearHistory({...chat, pFlags: {deactivated: true}})).toBe(false);
  });

  it('takes a private, non-forum group for a plain member', () => {
    expect(canClearHistory(channel({megagroup: true}))).toBe(true);
    expect(canClearHistory(channel({megagroup: true}, {username: 'group'}))).toBe(false);
    expect(canClearHistory(channel({megagroup: true, forum: true}))).toBe(false);
    expect(canClearHistory(channel({megagroup: true, left: true}))).toBe(false);
    expect(canClearHistory(channel({megagroup: true, monoforum: true}))).toBe(false);
  });

  it('takes the right to delete messages everywhere else', () => {
    expect(canClearHistory(channel({}))).toBe(false);
    expect(canClearHistory(channel({creator: true}))).toBe(true);
    expect(canClearHistory(channel({}, {
      admin_rights: {_: 'chatAdminRights', pFlags: {delete_messages: true}}
    }))).toBe(true);
    expect(canClearHistory(channel({megagroup: true}, {
      username: 'group',
      admin_rights: {_: 'chatAdminRights', pFlags: {delete_messages: true}}
    }))).toBe(true);
  });
});

describe('clearHistoryWithConfirmation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.confirm.mockResolvedValue(false);
    mocks.flushHistory.mockResolvedValue(undefined);
    mocks.getPeerTitle.mockResolvedValue('Alice');
    mocks.wrapPeerTitle.mockResolvedValue('Alice Smith');
  });

  it('offers the both-inboxes checkbox in a plain private chat', async() => {
    mocks.getPeer.mockReturnValue({_: 'user', id: 1 as UserId, pFlags: {}});

    await expect(clearHistoryWithConfirmation({peerId: 1 as PeerId, managers})).resolves.toBe(true);

    expect(mocks.confirm).toHaveBeenCalledWith(expect.objectContaining({
      titleLangKey: 'AlertClearHistory',
      descriptionLangKey: 'AreYouSureClearHistoryWithUser',
      descriptionLangArgs: ['Alice Smith'],
      checkbox: {text: 'ClearHistoryOptionAlso', textArgs: ['Alice']}
    }));
    expect(mocks.flushHistory).toHaveBeenCalledWith({
      peerId: 1,
      justClear: true,
      revoke: false
    });
  });

  it('revokes when the checkbox comes back checked', async() => {
    mocks.getPeer.mockReturnValue({_: 'user', id: 1 as UserId, pFlags: {}});
    mocks.confirm.mockResolvedValue(true);

    await clearHistoryWithConfirmation({peerId: 1 as PeerId, managers});

    expect(mocks.flushHistory).toHaveBeenCalledWith({
      peerId: 1,
      justClear: true,
      revoke: true
    });
  });

  it('clears our own inbox only for a bot and for Saved Messages', async() => {
    mocks.getPeer.mockReturnValue({_: 'user', id: 1 as UserId, pFlags: {bot: true}});
    await clearHistoryWithConfirmation({peerId: 1 as PeerId, managers});
    expect(mocks.confirm).toHaveBeenCalledWith(expect.objectContaining({
      descriptionLangKey: 'AreYouSureClearHistoryWithUser',
      checkbox: undefined
    }));

    mocks.confirm.mockClear();
    mocks.getPeer.mockReturnValue({_: 'user', id: 777 as UserId, pFlags: {self: true}});
    await clearHistoryWithConfirmation({peerId: 777 as PeerId, managers});
    expect(mocks.confirm).toHaveBeenCalledWith(expect.objectContaining({
      descriptionLangKey: 'AreYouSureClearHistorySavedMessages',
      descriptionLangArgs: undefined,
      checkbox: undefined
    }));
  });

  it('clears a broadcast for everyone, with no checkbox to opt out of', async() => {
    mocks.getPeer.mockReturnValue(channel({creator: true}));

    await clearHistoryWithConfirmation({peerId: (-1) as PeerId, managers});

    expect(mocks.confirm).toHaveBeenCalledWith(expect.objectContaining({
      descriptionLangKey: 'AreYouSureClearHistoryWithChannel',
      checkbox: undefined
    }));
    expect(mocks.flushHistory).toHaveBeenCalledWith({
      peerId: -1,
      justClear: true,
      revoke: true
    });
  });

  it('offers the for-all-members checkbox to a group creator only', async() => {
    mocks.getPeer.mockReturnValue(channel({megagroup: true, creator: true}));
    await clearHistoryWithConfirmation({peerId: (-1) as PeerId, managers});
    expect(mocks.confirm).toHaveBeenCalledWith(expect.objectContaining({
      descriptionLangKey: 'AreYouSureClearHistory',
      checkbox: {text: 'DeleteMessagesOptionAlsoChat'}
    }));

    mocks.confirm.mockClear();
    mocks.getPeer.mockReturnValue(channel({megagroup: true}));
    await clearHistoryWithConfirmation({peerId: (-1) as PeerId, managers});
    expect(mocks.confirm).toHaveBeenCalledWith(expect.objectContaining({
      descriptionLangKey: 'AreYouSureClearHistory',
      checkbox: undefined
    }));
  });

  it('does nothing for a peer that cannot be cleared', async() => {
    mocks.getPeer.mockReturnValue(channel({}));

    await expect(clearHistoryWithConfirmation({peerId: (-1) as PeerId, managers})).resolves.toBe(false);

    expect(mocks.confirm).not.toHaveBeenCalled();
    expect(mocks.flushHistory).not.toHaveBeenCalled();
  });

  it('does not clear after canceling the confirmation', async() => {
    mocks.getPeer.mockReturnValue({_: 'user', id: 1 as UserId, pFlags: {}});
    mocks.confirm.mockRejectedValue(undefined);

    await expect(clearHistoryWithConfirmation({peerId: 1 as PeerId, managers})).resolves.toBe(false);

    expect(mocks.flushHistory).not.toHaveBeenCalled();
  });

  it('reports a failed clear', async() => {
    const error = new Error('CLEAR_FAILED');
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    mocks.getPeer.mockReturnValue({_: 'user', id: 1 as UserId, pFlags: {}});
    mocks.flushHistory.mockRejectedValue(error);

    await expect(clearHistoryWithConfirmation({peerId: 1 as PeerId, managers})).resolves.toBe(false);

    expect(consoleError).toHaveBeenCalledWith('clear history error', error);
    expect(mocks.toast).toHaveBeenCalledWith({langPackKey: 'Error.AnError'});
    consoleError.mockRestore();
  });
});
