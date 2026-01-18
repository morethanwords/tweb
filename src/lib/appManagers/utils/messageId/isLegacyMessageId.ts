import {MESSAGE_ID_OFFSET} from '@appManagers/constants';

export default function isLegacyMessageId(messageId: number) {
  return typeof(messageId) === 'number' && messageId < MESSAGE_ID_OFFSET;
}
