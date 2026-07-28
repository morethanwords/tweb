import type {Message} from '@layer';

export type EphemeralMessage = Message.message & {
  ephemeral_id: number,
  ephemeral_receiver_id: UserId,
  ephemeral_order?: number
};

export default function isEphemeralMessage(message: unknown): message is EphemeralMessage {
  const value = message as Partial<EphemeralMessage>;
  return value?._ === 'message' &&
    !!value.pFlags?.ephemeral &&
    value.ephemeral_id !== undefined;
}
