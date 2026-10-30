import type {Chat, Message, User} from '@layer';
import {REPLIES_PEER_ID, SERVICE_PEER_ID, VERIFICATION_CODES_BOT_ID} from '@appManagers/constants';

/**
 * Whether a gift can be sent to a peer at all, as desktop's `CanSendStarGiftTo`: a person other than
 * me, a bot or one of the service accounts, while Premium can be bought; a channel I do not own
 */
export function canSendGiftToPeer(peer: User | Chat, myId: PeerId, premiumPurchaseBlocked?: boolean) {
  if(peer?._ === 'user') {
    const peerId = peer.id.toPeerId(false);
    return !peer.pFlags.deleted &&
      !peer.pFlags.self &&
      peerId !== myId &&
      !peer.pFlags.bot &&
      !peer.pFlags.support &&
      peerId !== SERVICE_PEER_ID &&
      peerId !== REPLIES_PEER_ID &&
      peer.id !== VERIFICATION_CODES_BOT_ID &&
      !premiumPurchaseBlocked;
  }

  return peer?._ === 'channel' &&
    !!peer.pFlags.broadcast &&
    !peer.pFlags.left &&
    !peer.pFlags.creator;
}

/**
 * What a gift's service message offers to send in its menu, as desktop's `AddGiftMessageAction` does:
 * "Send Another Gift" under a gift I sent (`'another'`), "Send a Gift" under one I got (`'send'`), or
 * nothing. A giveaway's code or prize came from a channel and is no gift of a person; an upgrade's
 * message is the other way around (the one who upgraded a gift I sent is its receiver); a chat
 * theme made of a gift and an offer to buy one only lead to another gift of mine. Nothing goes to a
 * deleted account or the notifications.
 */
export default function getGiftMessageSendAction(options: {
  message: Message.messageService,
  /** the chat's peer */
  peer: User | Chat,
  myId: PeerId,
  premiumPurchaseBlocked?: boolean
}): 'another' | 'send' {
  const {message, peer, myId, premiumPurchaseBlocked} = options;
  const action = message?.action;
  let upgrade = false, onlyMine = false;
  switch(action?._) {
    case 'messageActionGiftPremium':
    case 'messageActionGiftStars':
    case 'messageActionGiftTon':
    case 'messageActionStarGift':
      break;
    case 'messageActionGiftCode':
      if(action.boost_peer) return;
      break;
    case 'messageActionStarGiftUnique':
      upgrade = !!action.pFlags.upgrade;
      break;
    case 'messageActionSetChatTheme':
      if(action.theme?._ !== 'chatThemeUniqueGift') return;
      onlyMine = true;
      break;
    case 'messageActionStarGiftPurchaseOffer':
      onlyMine = true;
      break;
    default:
      return;
  }

  if(!peer || (peer._ === 'user' && (peer.pFlags.deleted || peer.id.toPeerId(false) === SERVICE_PEER_ID))) {
    return;
  }

  const out = !!message.pFlags.out;
  const outgoing = upgrade ? !out : out;
  if(!outgoing && (onlyMine || !canSendGiftToPeer(peer, myId, premiumPurchaseBlocked))) {
    return;
  }

  return outgoing ? 'another' : 'send';
}
