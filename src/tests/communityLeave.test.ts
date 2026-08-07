import {beforeEach, describe, expect, it, vi} from 'vitest';
import '@helpers/peerIdPolyfill';

const mocks = vi.hoisted(() => ({
  confirm: vi.fn(),
  getPeerTitle: vi.fn(),
  leaveCommunity: vi.fn(),
  toast: vi.fn()
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

import leaveCommunityWithConfirmation, {
  canLeaveCommunity
} from '@components/communities/leaveCommunity';

describe('Community leave flow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.confirm.mockResolvedValue(undefined);
    mocks.getPeerTitle.mockResolvedValue('QA Community');
    mocks.leaveCommunity.mockResolvedValue(undefined);
  });

  it('allows joined non-creators, including admins, to leave', () => {
    expect(canLeaveCommunity({
      _: 'community',
      id: 1,
      access_hash: '1',
      title: 'Community',
      photo: {_: 'chatPhotoEmpty'},
      date: 1,
      pFlags: {}
    })).toBe(true);
    expect(canLeaveCommunity({
      _: 'community',
      id: 1,
      access_hash: '1',
      title: 'Community',
      photo: {_: 'chatPhotoEmpty'},
      date: 1,
      pFlags: {},
      admin_rights: {
        _: 'chatAdminRights',
        pFlags: {change_info: true}
      }
    })).toBe(true);
    expect(canLeaveCommunity({
      _: 'community',
      id: 1,
      access_hash: '1',
      title: 'Community',
      photo: {_: 'chatPhotoEmpty'},
      date: 1,
      pFlags: {creator: true}
    })).toBe(false);
    expect(canLeaveCommunity({
      _: 'community',
      id: 1,
      access_hash: '1',
      title: 'Community',
      photo: {_: 'chatPhotoEmpty'},
      date: 1,
      pFlags: {left: true}
    })).toBe(false);
  });

  it('confirms with a danger action and leaves only the Community', async() => {
    const managers = {
      appChatsManager: {
        leave: mocks.leaveCommunity
      }
    } as any;

    await expect(leaveCommunityWithConfirmation({
      communityId: 123 as ChatId,
      managers
    })).resolves.toBe(true);

    expect(mocks.confirm).toHaveBeenCalledWith({
      titleLangKey: 'Community.Leave',
      descriptionLangKey: 'Community.LeaveConfirm',
      descriptionLangArgs: ['QA Community'],
      button: {
        langKey: 'Community.Leave',
        isDanger: true
      }
    });
    expect(mocks.leaveCommunity).toHaveBeenCalledWith(123);
  });

  it('does not leave after canceling the confirmation', async() => {
    mocks.confirm.mockRejectedValue(undefined);

    await expect(leaveCommunityWithConfirmation({
      communityId: 123 as ChatId,
      managers: {
        appChatsManager: {
          leave: mocks.leaveCommunity
        }
      } as any
    })).resolves.toBe(false);

    expect(mocks.leaveCommunity).not.toHaveBeenCalled();
  });

  it('reports a failed leave without closing the surface', async() => {
    const error = new Error('LEAVE_FAILED');
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    mocks.leaveCommunity.mockRejectedValue(error);

    await expect(leaveCommunityWithConfirmation({
      communityId: 123 as ChatId,
      managers: {
        appChatsManager: {
          leave: mocks.leaveCommunity
        }
      } as any
    })).resolves.toBe(false);

    expect(consoleError).toHaveBeenCalledWith('leave community error', error);
    expect(mocks.toast).toHaveBeenCalledWith({
      langPackKey: 'Error.AnError'
    });
    consoleError.mockRestore();
  });
});
