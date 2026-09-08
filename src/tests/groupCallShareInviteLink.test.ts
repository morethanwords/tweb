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
  toastNew: vi.fn()
}));

vi.mock('@components/popups/shareUrl', () => ({default: mocks.shareUrlToPeers}));
vi.mock('@components/call/callLinkPopup', () => ({default: mocks.showCallLinkPopup}));
vi.mock('@components/toast', () => ({toastNew: mocks.toastNew}));
vi.mock('@lib/rootScope', () => ({
  default: {
    managers: {
      appGroupCallsManager: {exportGroupCallInvite: mocks.exportGroupCallInvite},
      appProfileManager: {getChatInviteLink: mocks.getChatInviteLink}
    }
  }
}));

import shareGroupCallInviteLink from '@components/call/shareInviteLink';
import type GroupCallInstance from '@lib/calls/groupCallInstance';

function makeInstance(rtmp = false) {
  return {
    id: 'call-1',
    chatId: 5,
    groupCall: {_: 'groupCall', id: 'call-1', pFlags: rtmp ? {rtmp_stream: true} : {}}
  } as unknown as GroupCallInstance;
}

/** A conference — the link belongs to the call itself, not to a chat behind it. */
function makeConference(creator?: boolean) {
  return {
    id: 'call-1',
    e2e: {},
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

  it('stays silent when the sharing surface is gone by the time the export fails', async() => {
    mocks.exportGroupCallInvite.mockRejectedValue(new Error('EXPORT_FAILED'));

    await shareGroupCallInviteLink(makeInstance(), {canManage: false, isAlive: () => false});

    expect(mocks.toastNew).not.toHaveBeenCalled();
    expect(mocks.shareUrlToPeers).not.toHaveBeenCalled();
  });
});
