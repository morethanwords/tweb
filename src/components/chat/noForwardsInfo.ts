import type {Chat, User, UserFull} from '@layer';
import type {LangPackKey} from '@lib/langPack';

/**
 * The line at the bottom of a message's menu saying why it cannot be copied or forwarded (desktop's
 * `AddSelectRestrictionAction`, Android's no-forwards hint): by the chat's kind, and in a private chat
 * by who turned the protection on. `withName` asks for the user's name as the string's argument.
 */
export default function getNoForwardsInfo(options: {
  peer: User | Chat,
  /** the private chat's `userFull` flags, as far as they are known */
  userFullFlags?: UserFull.userFull['pFlags']
}): {langPackKey: LangPackKey, withName?: true} {
  const {peer, userFullFlags} = options;
  if(peer?._ === 'user') {
    if(peer.pFlags.bot) return {langPackKey: 'ForwardsRestrictedInfoBot'};
    if(userFullFlags?.noforwards_my_enabled) return {langPackKey: 'ForwardsRestrictedInfoUserBecauseYou'};
    if(userFullFlags?.noforwards_peer_enabled) return {langPackKey: 'ForwardsRestrictedInfoUserBecauseUser', withName: true};
    return {langPackKey: 'ForwardsRestrictedInfoUser'};
  }

  const isBroadcast = peer?._ === 'channel' && !!peer.pFlags.broadcast;
  return {langPackKey: isBroadcast ? 'ForwardsRestrictedInfoChannel' : 'ForwardsRestrictedInfoGroup'};
}
