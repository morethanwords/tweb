import type {Message} from '@layer';

export type AnchoredEphemeralMessage = Message.message & {
  ephemeral_id: number,
  ephemeral_receiver_id: UserId
};

/**
 * An ordinary message whose content an ephemeral message (layer 229's `anchor_msg_id`) is
 * currently standing in for. It keeps its own id and place in the history — only what it shows
 * belongs to the bot, and the original comes back once the ephemeral one is gone. Deliberately
 * NOT `isEphemeralMessage`: that one means a message that exists only as an ephemeral one.
 */
export default function isAnchoredEphemeralMessage(message: unknown): message is AnchoredEphemeralMessage {
  const value = message as Partial<AnchoredEphemeralMessage>;
  return value?._ === 'message' &&
    !!value.pFlags?.ephemeral_anchored &&
    value.ephemeral_id !== undefined;
}
