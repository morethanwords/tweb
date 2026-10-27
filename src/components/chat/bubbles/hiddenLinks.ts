import type {Message, MessageEntity, PeerSettings} from '@layer';
import {MESSAGE_LINK_ENTITY_TYPES} from '@lib/richTextProcessor/filterDisabledEntities';
import isSuspiciousPeer from '@appManagers/utils/peers/isSuspiciousPeer';

export const HIDDEN_LINK_ENTITY_TYPES: ReadonlySet<MessageEntity['_']> = MESSAGE_LINK_ENTITY_TYPES;

export function shouldHidePeerMessageLinks(peerId: PeerId, peerSettings?: PeerSettings) {
  return isSuspiciousPeer(peerId, peerSettings);
}

export function shouldHideMessageLinks(
  message: Message.message | Message.messageService,
  peerId: PeerId,
  peerSettings?: PeerSettings,
  forceHide = false
) {
  return message._ === 'message' &&
    !message.pFlags.local &&
    !message.pFlags.out &&
    (forceHide ? peerId.isUser() : shouldHidePeerMessageLinks(peerId, peerSettings));
}
