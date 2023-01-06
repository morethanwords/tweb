import {isRestricted} from '../../../../helpers/restrictions';
import {Chat, User} from '../../../../layer';

export default function isPeerRestricted(peer: Chat | User) {
  const restrictionReasons = (peer as Chat.channel)?.restriction_reason;
  return !!(restrictionReasons && (peer as Chat.channel).pFlags.restricted && isRestricted(restrictionReasons));
}
