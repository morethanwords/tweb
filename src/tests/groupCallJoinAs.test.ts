/*
 * Who a video chat shows us as, before joining (tdesktop ChooseJoinAsProcess):
 * the question is asked only when there is a choice to make, the chat's saved
 * choice comes first, a pick becomes the chat's default, and a failed list
 * joins as the account.
 */

import {beforeEach, describe, expect, it, vi} from 'vitest';
import '@helpers/peerIdPolyfill';

const pickUserMock = vi.hoisted(() => vi.fn());
const showCallAccountMock = vi.hoisted(() => vi.fn());

vi.mock('@components/popups/pickUser', () => ({default: pickUserMock}));
vi.mock('@lib/calls/groupCallsController', () => ({default: {}}));
vi.mock('@lib/calls/callAccount', () => ({showCallAccount: showCallAccountMock}));
vi.mock('@components/peerTitle', () => ({default: class {}}));
vi.mock('@components/toast', () => ({toastNew: vi.fn()}));

import {
  canSwitchGroupCallJoinAs,
  chooseGroupCallJoinAs,
  shouldAskGroupCallJoinAs
} from '@components/groupCall/joinAs';

const ME = (1000).toPeerId();
const CHANNEL = (5000).toPeerId(true);
const OTHER_CHANNEL = (5001).toPeerId(true);
const CHAT = (6000).toPeerId(true);

const ACCOUNT_NUMBER = 2;

function makeManagers(joinAs: {peerIds: PeerId[], savedPeerId?: PeerId, defaultPeerId: PeerId} | Error) {
  return {
    appGroupCallsManager: {
      getGroupCallJoinAs: vi.fn(() => joinAs instanceof Error ? Promise.reject(joinAs) : Promise.resolve(joinAs)),
      saveDefaultGroupCallJoinAs: vi.fn(() => Promise.resolve())
    },
    appChatsManager: {isBroadcast: vi.fn(() => Promise.resolve(false))}
  } as any;
}

// * the account the join was started on
function makeAccount(managers: ReturnType<typeof makeManagers>) {
  return {accountNumber: ACCOUNT_NUMBER, managers, myId: ME} as any;
}

describe('choosing who to join a video chat as', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('asks only when there is a choice that was not made before for this call', () => {
    expect(shouldAskGroupCallJoinAs({peerIds: [ME], defaultPeerId: ME}, ME, true)).toBe(false);
    expect(shouldAskGroupCallJoinAs({peerIds: [], defaultPeerId: undefined}, ME, true)).toBe(false);
    expect(shouldAskGroupCallJoinAs({peerIds: [ME, CHANNEL], defaultPeerId: ME}, ME, true)).toBe(true);
    // the call is joined again as whoever was picked for the chat
    expect(shouldAskGroupCallJoinAs({peerIds: [ME, CHANNEL], savedPeerId: CHANNEL, defaultPeerId: CHANNEL}, ME, true)).toBe(false);
    // a call about to be started asks anyway
    expect(shouldAskGroupCallJoinAs({peerIds: [ME, CHANNEL], savedPeerId: CHANNEL, defaultPeerId: CHANNEL}, ME, false)).toBe(true);
    // a lone channel is a choice too
    expect(shouldAskGroupCallJoinAs({peerIds: [CHANNEL], defaultPeerId: CHANNEL}, ME, true)).toBe(true);
  });

  it('offers "Display me as..." when anyone but the account is on the list', () => {
    expect(canSwitchGroupCallJoinAs({peerIds: [ME], defaultPeerId: ME}, ME)).toBe(false);
    expect(canSwitchGroupCallJoinAs({peerIds: [], defaultPeerId: undefined}, ME)).toBe(false);
    expect(canSwitchGroupCallJoinAs({peerIds: [CHANNEL], defaultPeerId: CHANNEL}, ME)).toBe(true);
    expect(canSwitchGroupCallJoinAs({peerIds: [ME, CHANNEL], defaultPeerId: ME}, ME)).toBe(true);
  });

  it('joins as the account without asking when it is all we can be', async() => {
    const managers = makeManagers({peerIds: [ME], defaultPeerId: ME});

    expect(await chooseGroupCallJoinAs({account: makeAccount(managers), peerId: CHAT, hasCall: true})).toBe(ME);
    expect(pickUserMock).not.toHaveBeenCalled();
    // * nothing to show: the tab stays on whatever account it shows
    expect(showCallAccountMock).not.toHaveBeenCalled();
  });

  it('joins as the account when the list cannot be had', async() => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const managers = makeManagers(new Error('offline'));

    expect(await chooseGroupCallJoinAs({account: makeAccount(managers), peerId: CHAT, hasCall: true})).toBe(ME);
    expect(pickUserMock).not.toHaveBeenCalled();
  });

  it('asks with the preselected peer on top and keeps the pick as the chat\'s default', async() => {
    const managers = makeManagers({peerIds: [ME, CHANNEL, OTHER_CHANNEL], savedPeerId: OTHER_CHANNEL, defaultPeerId: OTHER_CHANNEL});
    pickUserMock.mockImplementation((options) => {
      // * the picker opens on the joining account's peers: the tab went back to it first
      expect(showCallAccountMock).toHaveBeenCalledWith(ACCOUNT_NUMBER);
      queueMicrotask(() => {
        options.onSelect([{peerId: CHANNEL, key: '' + CHANNEL}]);
        options.onClose();
      });
    });

    // starting a call: asked even with a saved choice
    const chosen = await chooseGroupCallJoinAs({account: makeAccount(managers), peerId: CHAT, hasCall: false});

    expect(chosen).toBe(CHANNEL);
    expect(pickUserMock).toHaveBeenCalledTimes(1);
    const options = pickUserMock.mock.calls[0][0];
    expect(options.titleLangKey).toBe('VoiceChat.StartAs');
    expect((await options.getMoreCustom('')).result).toEqual([OTHER_CHANNEL, ME, CHANNEL]);
    expect(options.meAsSaved).toBe(false);
    expect(managers.appGroupCallsManager.saveDefaultGroupCallJoinAs).toHaveBeenCalledWith(CHAT, CHANNEL);
  });

  it('leaves the call alone when the question is dismissed', async() => {
    const managers = makeManagers({peerIds: [ME, CHANNEL], defaultPeerId: ME});
    pickUserMock.mockImplementation((options) => {
      queueMicrotask(() => options.onClose());
    });

    expect(await chooseGroupCallJoinAs({account: makeAccount(managers), peerId: CHAT, hasCall: true})).toBeUndefined();
    expect(pickUserMock.mock.calls[0][0].titleLangKey).toBe('VoipGroupJoinAs');
    expect(managers.appGroupCallsManager.saveDefaultGroupCallJoinAs).not.toHaveBeenCalled();
  });
});
