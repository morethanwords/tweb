/*
 * Chain ↔ SFU roster reconciliation for TdE2E conferences.
 *
 * The blockchain — NOT the server's participant list — is the authority on who
 * holds the group's shared key. tdlib's Encryption.md makes surfacing that a
 * client requirement, not an optimisation: "The blockchain state must be
 * explicitly displayed in the UI, even when the server withholds information
 * about certain participants".
 *
 * Why it matters: `external_permissions` grants Add|Remove to NON-members (see
 * groupCallsController's zero block, `externalPermissions: 3`), so anyone who
 * can append to the chain can self-add with a key they own — no honest private
 * key required. `applyBlock` then authorises the block's `setSharedKey` against
 * the POST-change group state (blockchain.ts), so that self-add also mints the
 * next shared key and addresses it to the new member. A backend that appends
 * such a block and then omits the identity from `phone.getGroupParticipants`
 * gets a silent listener: the client accepts the block, adopts the key, and
 * — without this reconciliation — renders only the server-reported roster.
 * Matching emoji fingerprints do not expose it either, since a cooperative
 * hidden member completes the commit/reveal round like anyone else.
 *
 * The protocol's answer is stale pruning:
 * core.telegram.org/api/end-to-end/group-calls#stale-pruning-only-left —
 * compare chain membership against a COMPLETE roster, keep chain-only
 * identities visible as having access, then remove them and rotate the key via
 * `phone.deleteConferenceCallParticipants(only_left=true)`.
 *
 * These helpers stay pure so the decision is unit-testable without a worker,
 * an SFU or a live call. Callers live in GroupCallInstance.
 *
 * tdesktop equivalents: `GroupCall::checkStaleParticipants` (data_group_call.cpp)
 * and `GroupCall::removeConferenceParticipants` (calls_group_call.cpp).
 */

import type {GroupParticipant, GroupState} from './tlTypes';

// Conference participants are always users, so the e2e `user_id` maps straight
// onto a PeerId. Kept as one function so the chain (bigint) and the UI (PeerId)
// vocabularies only ever meet here.
//
// NB this is for RENDERING only. PeerId is a JS number, so the conversion is
// lossy above 2^53 — which is fine for a row (the whole app keys peers this
// way) but must never decide MEMBERSHIP: two distinct chain user_ids can round
// to the same double, and the server picks both the chain ids and the roster
// ids. An identity could hide behind a rounding collision with a junk roster
// row. findChainOnlyMembers therefore compares exact decimal strings.
export function conferenceUserIdToPeerId(userId: bigint): PeerId {
  return Number(userId).toPeerId();
}

/**
 * Chain participants that a COMPLETE SFU roster does not list.
 *
 * Only meaningful for a complete roster — with a truncated page "absent" just
 * means "on a later page", and pruning off that would kick real participants.
 * The caller is responsible for that gate (see `refreshConferenceParticipants`'
 * `complete` flag).
 */
export function findChainOnlyMembers(opts: {
  participants: GroupParticipant[];
  // Exact decimal user ids the SFU listed — NOT PeerIds, see the note above.
  rosterUserIds: Iterable<string>;
  selfUserId: bigint;
}): bigint[] {
  const present = new Set<string>(opts.rosterUserIds);
  // Never treat ourselves as stale. Our own SFU row lags the chain on the
  // invitee path (it only lands after the SDP exchange), and self-removal isn't
  // representable anyway: the protocol has no self-remove because the leaver
  // can't mint the successor key for everyone else.
  present.add(opts.selfUserId.toString());

  const seen = new Set<string>();
  const stale: bigint[] = [];
  for(const participant of opts.participants) {
    if(present.has(participant.userId.toString())) {
      continue;
    }

    // validateGroupState already rejects duplicate user_ids, but a participant
    // set arrives here from the worker snapshot — dedupe so a malformed one
    // can't produce a removal list with repeats.
    const key = participant.userId.toString();
    if(seen.has(key)) {
      continue;
    }

    seen.add(key);
    stale.push(participant.userId);
  }

  return stale;
}

/**
 * The group state to submit alongside `only_left`: everyone except the stale
 * identities. `buildChangesForNewState` turns this into a setGroupState +
 * setSharedKey pair, so the removal and the rekey land in the same block — the
 * removed identity cannot follow the call past it.
 */
export function pruneGroupState(groupState: GroupState, staleUserIds: Iterable<bigint>): GroupState {
  const stale = new Set<string>();
  for(const userId of staleUserIds) {
    stale.add(userId.toString());
  }

  return {
    participants: groupState.participants.filter((p) => !stale.has(p.userId.toString())),
    // Carry external_permissions through untouched. authorizeSetGroupState
    // rejects any attempt to RAISE them, and lowering them here would silently
    // change the call's join policy as a side effect of a cleanup.
    externalPermissions: groupState.externalPermissions
  };
}
