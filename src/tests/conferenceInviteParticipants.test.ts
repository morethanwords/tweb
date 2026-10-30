/*
 * Batch conference invites and how their verdicts are reported.
 *
 * The server answers one invite at a time and its refusals are not all
 * errors — "already in the call", "privacy settings", "was banned" each mean
 * something different to the person who pressed Call. These tests pin the
 * classification (tdesktop's `GroupCall::inviteToConference`) and the single
 * batch toast built from it (`ComposeInviteResultToast`).
 */

import {beforeEach, describe, expect, it, vi} from 'vitest';
import '@helpers/peerIdPolyfill';

vi.mock('@lib/calls/groupCallsController', () => ({
  default: groupCallsControllerMock
}));

vi.mock('@components/wrappers/peerTitle', () => ({
  default: ({peerId}: {peerId: PeerId}) => Promise.resolve(document.createTextNode('peer' + peerId))
}));

vi.mock('@components/toast', () => ({
  toast: toastMock,
  toastNew: toastNewMock
}));

const groupCallsControllerMock = vi.hoisted(() => ({
  inviteConferenceParticipant: vi.fn()
}));

const toastMock = vi.hoisted(() => vi.fn());
const toastNewMock = vi.hoisted(() => vi.fn());

import {
  classifyConferenceInviteError,
  composeConferenceInviteToast,
  createConferenceInviteResult,
  inviteConferenceParticipants,
  inviteVideoChatParticipants,
  showConferenceInviteResultToast
} from '@components/groupCall/inviteParticipants';

const ALICE = (101).toPeerId();
const BOB = (102).toPeerId();
const CAROL = (103).toPeerId();
const DAVE = (104).toPeerId();

function lines(fragment: DocumentFragment | undefined) {
  return [...(fragment?.children || [])].map((element) => element.textContent);
}

describe('conference invite outcomes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('tells a refusal apart from a real failure', () => {
    expect(classifyConferenceInviteError({type: 'USER_PRIVACY_RESTRICTED'})).toBe('privacyRestricted');
    expect(classifyConferenceInviteError({type: 'USER_ALREADY_PARTICIPANT'})).toBe('alreadyIn');
    expect(classifyConferenceInviteError({type: 'USER_WAS_KICKED'})).toBe('kicked');
    expect(classifyConferenceInviteError({type: 'FLOOD_WAIT_20'})).toBe('failed');
    // A rejoin is owned by the call's own pollers, so a forbidden call is
    // reported rather than silently retried.
    expect(classifyConferenceInviteError({type: 'GROUPCALL_FORBIDDEN'})).toBe('failed');
    expect(classifyConferenceInviteError(new Error('offline'))).toBe('failed');
    expect(classifyConferenceInviteError(undefined)).toBe('failed');
  });

  it('keeps one person’s verdict from hiding another’s', async() => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    groupCallsControllerMock.inviteConferenceParticipant.mockImplementation((userId: UserId) => {
      switch(userId.toPeerId()) {
        case BOB: return Promise.reject({type: 'USER_ALREADY_PARTICIPANT'});
        case CAROL: return Promise.reject({type: 'USER_PRIVACY_RESTRICTED'});
        case DAVE: return Promise.reject(new Error('offline'));
        default: return Promise.resolve({});
      }
    });

    const result = await inviteConferenceParticipants([ALICE, BOB, CAROL, DAVE]);

    expect(groupCallsControllerMock.inviteConferenceParticipant).toHaveBeenCalledTimes(4);
    expect(result.invited).toEqual([ALICE]);
    expect(result.alreadyIn).toEqual([BOB]);
    expect(result.privacyRestricted).toEqual([CAROL]);
    expect(result.failed).toEqual([DAVE]);
    expect(result.kicked).toEqual([]);
  });

  it('drops the verdicts when the call they belong to is gone', async() => {
    groupCallsControllerMock.inviteConferenceParticipant.mockResolvedValue({});

    const result = await inviteConferenceParticipants([ALICE], {isAlive: () => false});

    expect(result).toEqual(createConferenceInviteResult());
  });

  it('reports the whole batch in one toast, naming a lone person', async() => {
    const result = createConferenceInviteResult();
    result.invited.push(ALICE);
    result.alreadyIn.push(BOB, CAROL);
    result.kicked.push(DAVE);

    expect(lines(await composeConferenceInviteToast(result))).toEqual([
      'ConferenceCall.Invite.Done',
      'ConferenceCall.Invite.AlreadyMany',
      'ConferenceCall.Invite.Kicked'
    ]);
  });

  it('says nothing when there is nothing to report', async() => {
    expect(await composeConferenceInviteToast(createConferenceInviteResult())).toBeUndefined();

    await showConferenceInviteResultToast(createConferenceInviteResult());
    expect(toastMock).not.toHaveBeenCalled();
  });

  it('shows the composed lines as a single toast', async() => {
    const result = createConferenceInviteResult();
    result.invited.push(ALICE, BOB);

    await showConferenceInviteResultToast(result);

    expect(toastMock).toHaveBeenCalledTimes(1);
    expect(lines(toastMock.mock.calls[0][0])).toEqual(['ConferenceCall.Invite.DoneMany']);
  });
});

describe('video chat invite outcomes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const makeInstance = (inviteToGroupCall: (id: string, userIds: UserId[]) => Promise<UserId[]>) => ({
    id: '42',
    managers: {appGroupCallsManager: {inviteToGroupCall: vi.fn(inviteToGroupCall)}}
  }) as any;

  it('invites everyone in one go and tells who the server took', async() => {
    const instance = makeInstance(async(_id, userIds) => userIds.filter((userId) => userId !== BOB.toUserId()));

    const result = await inviteVideoChatParticipants(instance, [ALICE, BOB, CAROL]);

    expect(instance.managers.appGroupCallsManager.inviteToGroupCall).toHaveBeenCalledWith('42', [101, 102, 103]);
    expect(result.invited).toEqual([ALICE, CAROL]);
    expect(result.failed).toEqual([BOB]);
  });

  it('counts a request that failed outright as nobody invited', async() => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const instance = makeInstance(() => Promise.reject(new Error('offline')));

    const result = await inviteVideoChatParticipants(instance, [ALICE]);

    expect(result.invited).toEqual([]);
    expect(result.failed).toEqual([ALICE]);
  });

  it('drops the verdicts when the call is gone', async() => {
    const instance = makeInstance(async(_id, userIds) => userIds);

    expect(await inviteVideoChatParticipants(instance, [ALICE], {isAlive: () => false})).toEqual(createConferenceInviteResult());
  });

  it('names only who was invited, as tdesktop does for a video chat', async() => {
    const result = createConferenceInviteResult();
    result.invited.push(ALICE);
    result.failed.push(BOB);

    expect(lines(await composeConferenceInviteToast(result, 'videoChat'))).toEqual(['VoipGroupInvitedUser']);

    result.invited.push(CAROL);
    expect(lines(await composeConferenceInviteToast(result, 'videoChat'))).toEqual(['VoiceChat.Invite.DoneMany']);
  });

  it('still answers the press when nobody got in', async() => {
    const result = createConferenceInviteResult();
    result.failed.push(ALICE);

    await showConferenceInviteResultToast(result, 'videoChat');

    expect(toastMock).not.toHaveBeenCalled();
    expect(toastNewMock).toHaveBeenCalledWith({langPackKey: 'Error.AnError'});
  });
});
