/*
 * "Share invite link" minted the SPEAKER link (`can_self_unmute`) for every
 * participant and, when the export failed, handed out the host chat's invite
 * link instead. tdesktop (calls_group_settings.cpp) only asks for a speaker
 * link on behalf of someone who can manage the call, never for an RTMP stream,
 * and shares the listener link otherwise.
 */
import {beforeEach, describe, expect, it, vi} from 'vitest';

const mocks = vi.hoisted(() => ({
  exportGroupCallInvite: vi.fn(),
  getChatInviteLink: vi.fn(),
  shareUrlToPeers: vi.fn(),
  showCallLinkPopup: vi.fn(),
  toastNew: vi.fn(),
  switchAccount: vi.fn(async() => {})
}));

vi.mock('@components/popups/shareUrl', () => ({default: mocks.shareUrlToPeers}));
vi.mock('@components/call/callLinkPopup', () => ({default: mocks.showCallLinkPopup}));
vi.mock('@components/toast', () => ({toastNew: mocks.toastNew}));
vi.mock('@lib/rootScope', () => ({default: {}}));

import shareGroupCallInviteLink from '@components/call/shareInviteLink';
import type GroupCallInstance from '@lib/calls/groupCallInstance';
import {getCurrentAccount} from '@lib/accounts/getCurrentAccount';
import {registerHotReloadGuard} from '@lib/solidjs/hotReloadGuardProvider';

// the code under test reads the switch from the registry
registerHotReloadGuard({switchAccount: mocks.switchAccount});

// * the call's own account's: the link is exported there and shared to its chats
const managers = {
  appGroupCallsManager: {exportGroupCallInvite: mocks.exportGroupCallInvite},
  appProfileManager: {getChatInviteLink: mocks.getChatInviteLink}
};

function makeInstance(rtmp = false, accountNumber = getCurrentAccount()) {
  return {
    id: 'call-1',
    chatId: 5,
    accountNumber,
    managers,
    groupCall: {_: 'groupCall', id: 'call-1', pFlags: rtmp ? {rtmp_stream: true} : {}}
  } as unknown as GroupCallInstance;
}

/** A conference — the link belongs to the call itself, not to a chat behind it. */
function makeConference(creator?: boolean) {
  return {
    id: 'call-1',
    e2e: {},
    accountNumber: getCurrentAccount(),
    managers,
    groupCall: {_: 'groupCall', id: 'call-1', pFlags: {conference: true, creator: creator || undefined}}
  } as unknown as GroupCallInstance;
}

describe('shareGroupCallInviteLink', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.exportGroupCallInvite.mockResolvedValue('https://t.me/+listener');
    mocks.getChatInviteLink.mockResolvedValue('https://t.me/+chat');
  });

  it('shares the listener link for a participant who cannot manage the call', async() => {
    await shareGroupCallInviteLink(makeInstance(), {canManage: false});

    expect(mocks.exportGroupCallInvite).toHaveBeenCalledWith('call-1', false);
    expect(mocks.shareUrlToPeers).toHaveBeenCalledWith(expect.objectContaining({url: 'https://t.me/+listener'}));
  });

  it('asks for the speaker link only on behalf of someone who can manage the call', async() => {
    await shareGroupCallInviteLink(makeInstance(), {canManage: true});

    expect(mocks.exportGroupCallInvite).toHaveBeenCalledWith('call-1', true);
  });

  it('never mints a speaker link for an RTMP stream', async() => {
    await shareGroupCallInviteLink(makeInstance(true), {canManage: true});

    expect(mocks.exportGroupCallInvite).toHaveBeenCalledWith('call-1', false);
  });

  it('reports a failed export instead of handing out the chat invite link', async() => {
    mocks.exportGroupCallInvite.mockRejectedValue(new Error('EXPORT_FAILED'));
    vi.spyOn(console, 'error').mockImplementation(() => {});

    await shareGroupCallInviteLink(makeInstance(), {canManage: false});

    expect(mocks.getChatInviteLink).not.toHaveBeenCalled();
    expect(mocks.shareUrlToPeers).not.toHaveBeenCalled();
    expect(mocks.toastNew).toHaveBeenCalledWith({langPackKey: 'Error.AnError'});
  });

  it('hands a conference link to the Call Link box instead of the sharing picker', async() => {
    await shareGroupCallInviteLink(makeConference(true), {canManage: false});

    expect(mocks.shareUrlToPeers).not.toHaveBeenCalled();
    expect(mocks.showCallLinkPopup).toHaveBeenCalledWith({
      link: 'https://t.me/+listener',
      callId: 'call-1',
      canManage: true
    });
  });

  it('only lets the creator of a conference revoke its link', async() => {
    await shareGroupCallInviteLink(makeConference(), {canManage: false});

    expect(mocks.showCallLinkPopup).toHaveBeenCalledWith(expect.objectContaining({canManage: false}));
  });

  it('shares a call of another account to that account\'s chats: the tab switches back to it first', async() => {
    const otherAccount = getCurrentAccount() === 1 ? 2 : 1;
    const order: string[] = [];
    mocks.shareUrlToPeers.mockImplementationOnce(() => void order.push('share'));

    // * the settings popup that started it closes with the switch: the share goes on
    let alive = true;
    mocks.switchAccount.mockImplementationOnce(async() => {
      order.push('switch');
      alive = false;
    });
    await shareGroupCallInviteLink(makeInstance(false, otherAccount), {canManage: false, isAlive: () => alive});

    expect(mocks.switchAccount).toHaveBeenCalledWith(otherAccount);
    expect(order).toEqual(['switch', 'share']);
  });

  it('does not switch for a call of the account the tab shows', async() => {
    await shareGroupCallInviteLink(makeInstance(), {canManage: false});

    expect(mocks.switchAccount).not.toHaveBeenCalled();
    expect(mocks.shareUrlToPeers).toHaveBeenCalledTimes(1);
  });

  it('stays silent when the sharing surface is gone by the time the export fails', async() => {
    mocks.exportGroupCallInvite.mockRejectedValue(new Error('EXPORT_FAILED'));

    await shareGroupCallInviteLink(makeInstance(), {canManage: false, isAlive: () => false});

    expect(mocks.toastNew).not.toHaveBeenCalled();
    expect(mocks.shareUrlToPeers).not.toHaveBeenCalled();
  });
});
