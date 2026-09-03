/*
 * Ringing lifecycle of incoming conference-call invitations — the tweb
 * counterpart of tdesktop's `Calls::Instance::*ConferenceInvite*`.
 *
 * The controller is the only thing standing between a `messageActionConferenceCall`
 * arriving and the user's device ringing, so what is asserted here is exactly
 * what tdesktop gates on: only a pending, incoming, private-chat invitation
 * rings; one from this very account, or arriving at a session that has calls
 * switched off, is ignored; an invitation that lands while another call is up
 * (or that is already too old to be live) is declined instead of ignored;
 * declining answers EVERY invite message of that conference; and an invitation
 * that is retracted, answered elsewhere or deleted stops ringing.
 */

import {beforeAll, beforeEach, describe, expect, it, vi} from 'vitest';
import '@helpers/peerIdPolyfill';

vi.mock('@environment/groupCallSupport', () => ({default: true}));
vi.mock('@environment/conferenceCallSupport', () => ({default: true}));

vi.mock('@components/call/getAudioAsset', () => ({
  default: () => audioAsset
}));

vi.mock('@lib/calls/callsController', () => ({
  default: callsControllerMock
}));

vi.mock('@lib/calls/groupCallsController', () => ({
  default: groupCallsControllerMock
}));

vi.mock('@lib/appImManager', () => ({
  default: appImManagerMock
}));

const audioAsset = vi.hoisted(() => ({
  play: vi.fn(),
  stop: vi.fn(),
  playIfDifferent: vi.fn()
}));

const groupCallsControllerMock = vi.hoisted(() => ({
  groupCall: undefined as unknown,
  addEventListener: vi.fn()
}));

const rtmpCallsControllerMock = vi.hoisted(() => ({
  currentCall: undefined as unknown
}));

// `isOtherCallActive` is the controller's own "busy" — another 1-on-1, a group
// call or a live stream — so the mock derives it from the same three sources.
const callsControllerMock = vi.hoisted(() => ({
  currentCall: undefined as unknown,
  addEventListener: vi.fn(),
  isOtherCallActive: vi.fn(() => !!(
    callsControllerMock.currentCall ||
    rtmpCallsControllerMock.currentCall ||
    (groupCallsControllerMock.groupCall && (groupCallsControllerMock.groupCall as {state: number}).state !== 4)
  ))
}));

const appImManagerMock = vi.hoisted(() => ({
  joinConference: vi.fn(() => Promise.resolve())
}));

import type {Message} from '@layer';
import rootScope from '@lib/rootScope';
import CALL_STATE from '@lib/calls/callState';
import GROUP_CALL_STATE from '@lib/calls/groupCallState';
import conferenceInvitesController from '@lib/calls/conferenceInvitesController';
import type ConferenceInviteInstance from '@lib/calls/conferenceInviteInstance';

const MY_ID = 100;
const INVITER_ID = 200;
const OTHER_ID = 300;
const CONFERENCE_ID = '777';

type RootScopeListeners = {
  history_multiappend?: (message: any) => void,
  message_edit?: (payload: any) => void,
  history_delete?: (payload: any) => void
};

const listeners: RootScopeListeners = {};
const declineConferenceCallInvite = vi.fn(() => Promise.resolve({} as any));
const isCallRequestsDisabled = vi.fn(() => Promise.resolve(false));
let rung: ConferenceInviteInstance[] = [];
let now: number;

function makeInvite(overrides: Partial<{
  mid: number,
  peerId: PeerId,
  fromId: PeerId,
  out: boolean,
  missed: boolean,
  active: boolean,
  duration: number,
  date: number,
  otherParticipants: number[]
}> = {}) {
  const {
    mid = 1,
    peerId = INVITER_ID.toPeerId(),
    fromId = INVITER_ID.toPeerId(),
    out = false,
    missed,
    active,
    duration,
    date = now / 1000 | 0,
    otherParticipants = [OTHER_ID]
  } = overrides;

  return {
    _: 'messageService',
    id: mid,
    mid,
    peerId,
    fromId,
    date,
    pFlags: out ? {out: true} : {},
    action: {
      _: 'messageActionConferenceCall',
      pFlags: {
        ...(missed ? {missed: true} : {}),
        ...(active ? {active: true} : {})
      },
      call_id: CONFERENCE_ID,
      duration,
      other_participants: otherParticipants.map((userId) => ({_: 'peerUser', user_id: userId}))
    }
  } as any as Message.messageService;
}

// Ringing waits for the session's call-requests flag, so delivery settles a
// macrotask later.
async function receive(message: Message.messageService) {
  listeners.history_multiappend(message);
  await new Promise((resolve) => setTimeout(resolve, 0));
}

describe('ConferenceInvitesController', () => {
  beforeAll(() => {
    // One subscription for the whole suite: `construct` re-runs per test and
    // resets the registry, but the controller is a singleton and would keep
    // every listener ever added.
    conferenceInvitesController.addEventListener('instance', (instance) => {
      rung.push(instance);
    });
  });

  beforeEach(() => {
    vi.clearAllMocks();
    rung = [];
    now = 1_700_000_000_000;
    vi.spyOn(Date, 'now').mockImplementation(() => now);

    callsControllerMock.currentCall = undefined;
    groupCallsControllerMock.groupCall = undefined;
    rtmpCallsControllerMock.currentCall = undefined;
    isCallRequestsDisabled.mockResolvedValue(false);

    vi.spyOn(rootScope, 'addEventListener').mockImplementation(((event: string, listener: any) => {
      (listeners as any)[event] = listener;
      return undefined as any;
    }) as any);
    Object.defineProperty(rootScope, 'myId', {value: MY_ID.toPeerId(), configurable: true});

    conferenceInvitesController.construct({
      appCallsManager: {declineConferenceCallInvite},
      appAccountManager: {isCallRequestsDisabled}
    } as any);
  });

  it('rings for a pending incoming invitation and carries its participants', async() => {
    await receive(makeInvite());

    expect(rung).toHaveLength(1);
    const instance = rung[0];
    expect(instance.interlocutorUserId).toBe(INVITER_ID.toUserId());
    expect(instance.msgId).toBe(1);
    expect(instance.conferenceId).toBe(CONFERENCE_ID);
    // The inviter plus everyone the invite names, minus ourselves.
    expect(instance.participants).toEqual([INVITER_ID.toPeerId(), OTHER_ID.toPeerId()]);
    expect(instance.connectionState).toBe(CALL_STATE.PENDING);
    expect(audioAsset.play).toHaveBeenCalledWith({name: 'incoming', loop: true});
    expect(declineConferenceCallInvite).not.toHaveBeenCalled();
  });

  it('stays silent for invitations that are not a pending incoming call', async() => {
    await receive(makeInvite({mid: 1, out: true}));
    await receive(makeInvite({mid: 2, active: true}));
    await receive(makeInvite({mid: 3, missed: true}));
    await receive(makeInvite({mid: 4, duration: 42}));
    await receive(makeInvite({mid: 5, peerId: (-INVITER_ID).toPeerId(true)}));

    expect(rung).toHaveLength(0);
    expect(audioAsset.play).not.toHaveBeenCalled();
    expect(declineConferenceCallInvite).not.toHaveBeenCalled();
  });

  it('stays silent for an invitation sent by this very account', async() => {
    // tdesktop `showConferenceInvite`: `user->isSelf()` returns without
    // declining — the message is ours, there is nothing to answer.
    await receive(makeInvite({fromId: MY_ID.toPeerId()}));

    expect(rung).toHaveLength(0);
    expect(audioAsset.play).not.toHaveBeenCalled();
    expect(declineConferenceCallInvite).not.toHaveBeenCalled();
    expect(isCallRequestsDisabled).not.toHaveBeenCalled();
  });

  it('stays silent when call requests are disabled for this session', async() => {
    // tdesktop `callsDisabledForSession()`: the session's own "accept calls on
    // this device" switch — ignored, not declined, like the self check.
    isCallRequestsDisabled.mockResolvedValue(true);
    await receive(makeInvite());

    expect(isCallRequestsDisabled).toHaveBeenCalledTimes(1);
    expect(rung).toHaveLength(0);
    expect(audioAsset.play).not.toHaveBeenCalled();
    expect(declineConferenceCallInvite).not.toHaveBeenCalled();
  });

  it('rings when the call-requests flag cannot be fetched', async() => {
    // The helper resolves false on failure; a network hiccup must not silence
    // a call.
    isCallRequestsDisabled.mockResolvedValue(false);
    await receive(makeInvite());

    expect(rung).toHaveLength(1);
  });

  it('does not ring an invitation that was retracted while the flag was being fetched', async() => {
    let resolveFlag: (disabled: boolean) => void;
    isCallRequestsDisabled.mockImplementation(() => new Promise<boolean>((resolve) => {
      resolveFlag = resolve;
    }));

    listeners.history_multiappend(makeInvite());
    listeners.history_delete({peerId: INVITER_ID.toPeerId(), msgs: new Set([1])});
    resolveFlag(false);
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(rung).toHaveLength(0);
    expect(audioAsset.play).not.toHaveBeenCalled();
  });

  it('declines instead of ringing while another call is up', async() => {
    callsControllerMock.currentCall = {};
    await receive(makeInvite());

    expect(rung).toHaveLength(0);
    expect(audioAsset.play).not.toHaveBeenCalled();
    await vi.waitFor(() => expect(declineConferenceCallInvite).toHaveBeenCalledWith(1));
  });

  it('declines instead of ringing while a group call or a live stream is up', async() => {
    groupCallsControllerMock.groupCall = {state: GROUP_CALL_STATE.MUTED, toInputGroupCall: (): undefined => undefined};
    await receive(makeInvite({mid: 1}));
    await vi.waitFor(() => expect(declineConferenceCallInvite).toHaveBeenCalledWith(1));

    groupCallsControllerMock.groupCall = undefined;
    rtmpCallsControllerMock.currentCall = {};
    await receive(makeInvite({mid: 2, fromId: OTHER_ID.toPeerId(), peerId: OTHER_ID.toPeerId()}));
    await vi.waitFor(() => expect(declineConferenceCallInvite).toHaveBeenCalledWith(2));

    expect(rung).toHaveLength(0);
  });

  it('declines an invitation that is already older than the ring timeout', async() => {
    await receive(makeInvite({date: (now - 60e3) / 1000 | 0}));

    expect(rung).toHaveLength(0);
    await vi.waitFor(() => expect(declineConferenceCallInvite).toHaveBeenCalledWith(1));
  });

  it('declines every invite message of the conference at once', async() => {
    await receive(makeInvite({mid: 1}));
    await receive(makeInvite({mid: 2, fromId: OTHER_ID.toPeerId(), peerId: OTHER_ID.toPeerId()}));

    // Only the first one rings — the conference is already being offered.
    expect(rung).toHaveLength(1);

    await rung[0].hangUp();

    expect(declineConferenceCallInvite).toHaveBeenCalledTimes(2);
    expect(declineConferenceCallInvite).toHaveBeenCalledWith(1);
    expect(declineConferenceCallInvite).toHaveBeenCalledWith(2);
    expect(rung[0].connectionState).toBe(CALL_STATE.CLOSED);
    expect(audioAsset.stop).toHaveBeenCalled();
  });

  it('stops ringing when the invitation is answered elsewhere or revoked', async() => {
    await receive(makeInvite({mid: 1}));
    listeners.message_edit({message: makeInvite({mid: 1, active: true})});
    expect(rung[0].connectionState).toBe(CALL_STATE.CLOSED);
    expect(declineConferenceCallInvite).not.toHaveBeenCalled();

    rung = [];
    await receive(makeInvite({mid: 2}));
    listeners.history_delete({peerId: INVITER_ID.toPeerId(), msgs: new Set([2])});
    expect(rung[0].connectionState).toBe(CALL_STATE.CLOSED);
    expect(declineConferenceCallInvite).not.toHaveBeenCalled();
  });

  it('joins through the invite message when accepted, with no second confirmation', async() => {
    await receive(makeInvite());
    await rung[0].acceptCall();

    expect(appImManagerMock.joinConference).toHaveBeenCalledWith(
      {_: 'inputGroupCallInviteMessage', msg_id: 1},
      {confirmed: true}
    );
    expect(declineConferenceCallInvite).not.toHaveBeenCalled();
    expect(rung[0].connectionState).toBe(CALL_STATE.CLOSED);
    expect(audioAsset.stop).toHaveBeenCalled();
  });

  it('closes the invitation when the join it started fails', async() => {
    appImManagerMock.joinConference.mockRejectedValueOnce(new Error('GROUPCALL_INVALID'));
    await receive(makeInvite());

    await expect(rung[0].acceptCall()).rejects.toThrow('GROUPCALL_INVALID');
    expect(rung[0].connectionState).toBe(CALL_STATE.CLOSED);
    // A failed join is not a decline: the invite message stays answerable.
    expect(declineConferenceCallInvite).not.toHaveBeenCalled();
  });
});
