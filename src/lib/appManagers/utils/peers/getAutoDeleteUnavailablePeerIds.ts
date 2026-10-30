import {HIDDEN_PEER_ID, REPLIES_HIDDEN_CHANNEL_ID, REPLIES_PEER_ID, SERVICE_PEER_ID, VERIFICATION_CODES_BOT_ID} from '@appManagers/constants';

/** The service chats no auto-delete timer can be set in — the user's own Saved Messages aside. */
export default function getAutoDeleteUnavailablePeerIds(): PeerId[] {
  return [REPLIES_PEER_ID, REPLIES_HIDDEN_CHANNEL_ID.toPeerId(), VERIFICATION_CODES_BOT_ID, HIDDEN_PEER_ID, SERVICE_PEER_ID];
}
