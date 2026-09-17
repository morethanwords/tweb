/*
 * Types and manager-level helpers shared by the delete-messages popup and its moderation actions.
 * Kept apart so the actions can be tested without importing the popup's UI graph.
 */

import {Message, Reaction} from '@layer';
import {CheckboxFieldsField} from '@components/checkboxFields';
import type {AppManagers} from '@lib/managers';

export type DeleteCheckboxFieldsField = CheckboxFieldsField & {
  peerId?: PeerId,
  action:
    'report' |
    'delete' |
    'deleteReactions' |
    'deleteOptions' |
    'ban' |
    'communityBan',
  peerRow?: boolean
};

export type DeleteAction = Exclude<DeleteCheckboxFieldsField['action'], 'deleteOptions'>;

export type ModerateOptions = {
  reportSpam: boolean,
  reportReaction: boolean,
  deleteAllMessages: boolean,
  deleteAllReactions: boolean,
  banOrRestrict: boolean,
  communityId?: ChatId,
  communityChatsCount?: number
};

export const getNoModerateOptions = (): ModerateOptions => ({
  reportSpam: false,
  reportReaction: false,
  deleteAllMessages: false,
  deleteAllReactions: false,
  banOrRestrict: false
});

export function getCommunityId(managers: AppManagers, peerId: PeerId) {
  return managers.appCommunitiesManager?.getPeerLinkedCommunityId(peerId);
}

export async function getCommunityModerateOptions(
  managers: AppManagers,
  peerId: PeerId
): Promise<Partial<ModerateOptions>> {
  const communitiesManager = managers.appCommunitiesManager;
  if(!communitiesManager) {
    return {};
  }

  const communityId = await getCommunityId(managers, peerId);
  const canBanFromCommunity = !!communityId &&
    await communitiesManager.hasRights(communityId, 'ban_users')
    .catch(() => false);
  if(!canBanFromCommunity) {
    return {};
  }

  const communityFull = await Promise.resolve(managers.appProfileManager
  .getChatFull(communityId))
  .catch((): undefined => undefined);
  return {
    communityId,
    communityChatsCount: communityFull?._ === 'communityFull' ?
      communityFull.linked_peers.length :
      undefined
  };
}

export type ModerateMessage = Message.message | Message.messageService;

export type ModerateReactionEntry = {
  message: ModerateMessage,
  participantPeerId: PeerId,
  knownReaction?: Reaction
};
