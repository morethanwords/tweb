import {getRestrictionReason, isSensitive, SENSITIVE_RESTRICTION_REASON} from '@helpers/restrictions';
import {Message} from '@layer';

/**
 * What hides the whole message. `sensitive` never does - it only blurs the media (`isMessageSensitive`),
 * as in tdesktop and Android.
 */
export function getMessageRestrictionReason(message: Message.message) {
  const reasons = message.restriction_reason?.filter((reason) => reason.reason !== SENSITIVE_RESTRICTION_REASON);
  return reasons?.length ? getRestrictionReason(reasons) : undefined;
}

export default function isMessageRestricted(message: Message.message) {
  return !!getMessageRestrictionReason(message);
}

export function isMessageSensitive(message: Message) {
  return (message._ === 'message' && message.restriction_reason != null && isSensitive(message.restriction_reason));
}
