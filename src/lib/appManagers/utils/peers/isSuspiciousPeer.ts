import type {PeerSettings} from '@layer';

/**
 * A user whose chat still offers to report or block them: they wrote first, and the account has
 * neither dismissed the bar nor written back. Until then their links show as plain text and the
 * chat marks nothing read (iOS `CachedUserData.isSuspiciousPeer`).
 */
export default function isSuspiciousPeer(peerId: PeerId, peerSettings?: PeerSettings) {
  return peerId.isUser() && !!(
    peerSettings?.pFlags.report_spam ||
    peerSettings?.pFlags.block_contact
  );
}

// * a message the account sent ends that state, as on iOS: the report and block offers go, an Add Contact one stays
export function endSuspiciousPeerSettings(peerSettings: PeerSettings) {
  delete peerSettings.pFlags.report_spam;
  delete peerSettings.pFlags.block_contact;
}
