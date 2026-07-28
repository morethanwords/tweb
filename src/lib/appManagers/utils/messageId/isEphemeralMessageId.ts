import {EPHEMERAL_MESSAGE_ID_LIMIT, EPHEMERAL_MESSAGE_ID_OFFSET} from '@appManagers/constants';

export default function isEphemeralMessageId(messageId: number) {
  return Number.isInteger(messageId) &&
    messageId >= EPHEMERAL_MESSAGE_ID_OFFSET &&
    messageId < EPHEMERAL_MESSAGE_ID_LIMIT;
}
