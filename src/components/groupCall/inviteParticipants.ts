/*
 * Inviting people into a conference call, one server answer per person.
 *
 * `phone.inviteConferenceCallParticipant` is a per-user request that can fail
 * for reasons that are not errors at all — the person is already in the call,
 * their privacy settings do not allow the invite, they were banned from it.
 * tdesktop therefore collects a per-user verdict (`InviteResult`,
 * calls_group_common.h:60), classifies each failure by error type
 * (`GroupCall::inviteToConference`, calls_group_call.cpp:4069) and reports the
 * whole batch in one toast (`ComposeInviteResultToast`, calls_group_call.cpp:4294).
 * This is that model for tweb.
 */

import {toast} from '@components/toast';
import wrapPeerTitle from '@components/wrappers/peerTitle';
import groupCallsController from '@lib/calls/groupCallsController';
import {i18n, LangPackKey} from '@lib/langPack';

export type ConferenceInviteOutcome =
  | 'invited'
  | 'alreadyIn'
  | 'privacyRestricted'
  | 'kicked'
  | 'failed';

export type ConferenceInviteResult = Record<ConferenceInviteOutcome, PeerId[]>;

const ERROR_OUTCOMES: {[type: string]: ConferenceInviteOutcome} = {
  'USER_PRIVACY_RESTRICTED': 'privacyRestricted',
  'USER_ALREADY_PARTICIPANT': 'alreadyIn',
  'USER_WAS_KICKED': 'kicked'
};

/**
 * Note on GROUPCALL_FORBIDDEN: tdesktop rejoins and replays the invite. Here
 * the rejoin is owned by the instance's own pollers (they raise
 * `conferenceRecoveryRequired` off their own requests), so the invite is
 * reported as failed and the user can retry once the call has recovered.
 */
export function classifyConferenceInviteError(error: unknown): ConferenceInviteOutcome {
  return ERROR_OUTCOMES[(error as ApiError)?.type] || 'failed';
}

export function createConferenceInviteResult(): ConferenceInviteResult {
  return {
    invited: [],
    alreadyIn: [],
    privacyRestricted: [],
    kicked: [],
    failed: []
  };
}

/**
 * Invite everyone in one batch, in parallel, and never let one person's
 * verdict hide another's.
 */
export async function inviteConferenceParticipants(
  peerIds: PeerId[],
  options: {isAlive?: () => boolean} = {}
): Promise<ConferenceInviteResult> {
  const {isAlive} = options;
  const settled = await Promise.allSettled(peerIds.map((peerId) => {
    return groupCallsController.inviteConferenceParticipant(peerId.toUserId());
  }));

  if(isAlive && !isAlive()) {
    return createConferenceInviteResult();
  }

  // Bucketed in the order the user picked them, not in the order the server
  // happened to answer.
  const result = createConferenceInviteResult();
  settled.forEach((outcome, index) => {
    const peerId = peerIds[index];
    if(outcome.status === 'fulfilled') {
      result.invited.push(peerId);
      return;
    }

    const bucket = classifyConferenceInviteError(outcome.reason);
    if(bucket === 'failed') {
      console.error('invite conference participant failed', outcome.reason, peerId);
    }

    result[bucket].push(peerId);
  });

  return result;
}

const OUTCOME_LANG_KEYS: {[outcome in ConferenceInviteOutcome]: [user: LangPackKey, many: LangPackKey]} = {
  invited: ['ConferenceCall.Invite.Done', 'ConferenceCall.Invite.DoneMany'],
  alreadyIn: ['ConferenceCall.Invite.Already', 'ConferenceCall.Invite.AlreadyMany'],
  // tdesktop words a privacy refusal exactly like any other failure — the
  // buckets stay apart because the server tells them apart, not the phrasing.
  privacyRestricted: ['ConferenceCall.Invite.Fail', 'ConferenceCall.Invite.FailMany'],
  kicked: ['ConferenceCall.Invite.Kicked', 'ConferenceCall.Invite.KickedMany'],
  failed: ['ConferenceCall.Invite.Fail', 'ConferenceCall.Invite.FailMany']
};

const OUTCOME_ORDER: ConferenceInviteOutcome[] = [
  'invited',
  'alreadyIn',
  'privacyRestricted',
  'kicked',
  'failed'
];

/**
 * One line per non-empty bucket, naming the person when there is exactly one
 * and counting them otherwise.
 */
export async function composeConferenceInviteToast(
  result: ConferenceInviteResult
): Promise<DocumentFragment | undefined> {
  const lines = await Promise.all(OUTCOME_ORDER.map(async(outcome) => {
    const peerIds = result[outcome];
    if(!peerIds.length) {
      return;
    }

    const [userKey, manyKey] = OUTCOME_LANG_KEYS[outcome];
    return peerIds.length === 1 ?
      i18n(userKey, [await wrapPeerTitle({peerId: peerIds[0], onlyFirstName: true})]) :
      i18n(manyKey, [peerIds.length]);
  }));

  const elements = lines.filter(Boolean);
  if(!elements.length) {
    return;
  }

  const fragment = document.createDocumentFragment();
  elements.forEach((element) => {
    const line = document.createElement('div');
    line.append(element);
    fragment.append(line);
  });

  return fragment;
}

export async function showConferenceInviteResultToast(result: ConferenceInviteResult) {
  const content = await composeConferenceInviteToast(result);
  if(content) {
    toast(content);
  }
}
