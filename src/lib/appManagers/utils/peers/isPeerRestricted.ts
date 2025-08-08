import {isRestricted} from '../../../../helpers/restrictions';
import {Chat, User} from '../../../../layer';

export default function isPeerRestricted(peer: Chat | User, canChangeSensitive: boolean) {
  let restrictionReasons = (peer as Chat.channel | User.user)?.restriction_reason;
  if(!(restrictionReasons && (peer as Chat.channel | User.user).pFlags.restricted)) return false;
  if(canChangeSensitive) {
    restrictionReasons = restrictionReasons.filter((reason) => reason.reason !== 'sensitive');
  }
  return isRestricted(restrictionReasons);
}
