import {IgnoredRestrictionReasons, isRestricted, SENSITIVE_RESTRICTION_REASON} from '@helpers/restrictions';
import {Chat, User} from '@layer';

export default function isPeerRestricted(peer: Chat | User, skipSensitive: boolean, ignored?: IgnoredRestrictionReasons) {
  let restrictionReasons = (peer as Chat.channel | User.user)?.restriction_reason;
  if(!(restrictionReasons && (peer as Chat.channel | User.user).pFlags.restricted)) return false;
  if(skipSensitive) {
    restrictionReasons = restrictionReasons.filter((reason) => reason.reason !== SENSITIVE_RESTRICTION_REASON);
  }
  return isRestricted(restrictionReasons, ignored);
}
