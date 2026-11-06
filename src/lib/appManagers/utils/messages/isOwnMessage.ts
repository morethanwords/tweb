import type {Message} from '@layer';

/**
 * Whether one sent the message oneself, as tdesktop's `out()` tells it: an outgoing one — the server
 * may leave its sender out — or one from oneself where nothing is outgoing, in Saved Messages.
 */
export default function isOwnMessage(message: Message.message | Message.messageService, myId: PeerId) {
  return !!message.pFlags.out || message.fromId === myId;
}
