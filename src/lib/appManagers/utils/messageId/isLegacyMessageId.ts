import {MESSAGE_ID_OFFSET} from '../../../mtproto/mtproto_config';

export default function isLegacyMessageId(messageId: number) {
  return typeof(messageId) === 'number' && messageId < MESSAGE_ID_OFFSET;
}
