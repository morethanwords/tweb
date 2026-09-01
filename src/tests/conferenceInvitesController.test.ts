/*
 * Ringing lifecycle of incoming conference-call invitations — the tweb
 * counterpart of tdesktop's `Calls::Instance::*ConferenceInvite*`.
 *
 * The controller is the only thing standing between a `messageActionConferenceCall`
 * arriving and the user's device ringing, so what is asserted here is exactly
 * what tdesktop gates on: only a pending, incoming, private-chat invitation
 * rings; an invitation that lands while another call is up (or that is already
 * too old to be live) is declined instead of ignored; declining answers EVERY
 * invite message of that conference; and an invitation that is retracted,
 * answered elsewhere or deleted stops ringing.
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

vi.mock('@lib/calls/rtmpCallsController', () => ({
  default: rtmpCallsControllerMock
}));

vi.mock('@lib/appImManager', () => ({
  default: appImManagerMock
}));

const audioAsset = vi.hoisted(() => ({
  play: vi.fn(),
  stop: vi.fn(),
  playIfDifferent: vi.fn()
}));

const callsControllerMock = vi.hoisted(() => ({
  currentCall: undefined as unknown,
  addEventListener: vi.fn()
}));

const groupCallsControllerMock = vi.hoisted(() => ({
  groupCall: undefined as unknown,
  addEventListener: vi.fn()
}));

const rtmpCallsControllerMock = vi.hoisted(() => ({
  currentCall: undefined as unknown
}));

const appImManagerMock = vi.hoisted(() => ({
  joinConference: vi.fn(() => Promise.resolve())
}));

import type {Message} from '@layer';
import rootScope from '@lib/rootScope';
import CALL_STATE from '@lib/calls/callState';
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

function receive(message: Message.messageService) {
  listeners.history_multiappend(message);
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

    vi.spyOn(rootScope, 'addEventListener').mockImplementation(((event: string, listener: any) => {
      (listeners as any)[event] = listener;
      return undefined as any;
    }) as any);
    Object.defineProperty(rootScope, 'myId', {value: MY_ID.toPeerId(), configurable: true});

    conferenceInvitesController.construct({
      appCallsManager: {declineConferenceCallInvite}
    } as any);
  });

  it('rings for a pending incoming invitation and carries its participants', () => {
    receive(makeInvite());

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

  it('stays silent for invitations that are not a pending incoming call', () => {
    receive(makeInvite({mid: 1, out: true}));
    receive(makeInvite({mid: 2, active: true}));
    receive(makeInvite({mid: 3, missed: true}));
    receive(makeInvite({mid: 4, duration: 42}));
    receive(makeInvite({mid: 5, peerId: (-INVITER_ID).toPeerId(true)}));

    expect(rung).toHaveLength(0);
    expect(audioAsset.play).not.toHaveBeenCalled();
    expect(declineConferenceCallInvite).not.toHaveBeenCalled();
  });

  it('declines instead of ringing while another call is up', async() => {
    callsControllerMock.currentCall = {};
    receive(makeInvite());

    expect(rung).toHaveLength(0);
    expect(audioAsset.play).not.toHaveBeenCalled();
    await vi.waitFor(() => expect(declineConferenceCallInvite).toHaveBeenCalledWith(1));
  });

  it('declines an invitation that is already older than the ring timeout', async() => {
    receive(makeInvite({date: (now - 60e3) / 1000 | 0}));

    expect(rung).toHaveLength(0);
    await vi.waitFor(() => expect(declineConferenceCallInvite).toHaveBeenCalledWith(1));
  });

  it('declines every invite message of the conference at once', async() => {
    receive(makeInvite({mid: 1}));
    receive(makeInvite({mid: 2, fromId: OTHER_ID.toPeerId(), peerId: OTHER_ID.toPeerId()}));

    // Only the first one rings — the conference is already being offered.
    expect(rung).toHaveLength(1);

    await rung[0].hangUp();

    expect(declineConferenceCallInvite).toHaveBeenCalledTimes(2);
    expect(declineConferenceCallInvite).toHaveBeenCalledWith(1);
    expect(declineConferenceCallInvite).toHaveBeenCalledWith(2);
    expect(rung[0].connectionState).toBe(CALL_STATE.CLOSED);
    expect(audioAsset.stop).toHaveBeenCalled();
  });

  it('stops ringing when the invitation is answered elsewhere or revoked', () => {
    receive(makeInvite({mid: 1}));
    listeners.message_edit({message: makeInvite({mid: 1, active: true})});
    expect(rung[0].connectionState).toBe(CALL_STATE.CLOSED);
    expect(declineConferenceCallInvite).not.toHaveBeenCalled();

    rung = [];
    receive(makeInvite({mid: 2}));
    listeners.history_delete({peerId: INVITER_ID.toPeerId(), msgs: new Set([2])});
    expect(rung[0].connectionState).toBe(CALL_STATE.CLOSED);
    expect(declineConferenceCallInvite).not.toHaveBeenCalled();
  });

  it('joins through the invite message when accepted, with no second confirmation', async() => {
    receive(makeInvite());
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
    receive(makeInvite());

    await expect(rung[0].acceptCall()).rejects.toThrow('GROUPCALL_INVALID');
    expect(rung[0].connectionState).toBe(CALL_STATE.CLOSED);
    // A failed join is not a decline: the invite message stays answerable.
    expect(declineConferenceCallInvite).not.toHaveBeenCalled();
  });
});
