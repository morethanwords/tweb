import confirmationPopup from '@components/confirmationPopup';
import {toastNew} from '@components/toast';
import getPeerTitle from '@components/wrappers/getPeerTitle';
import type {AppManagers} from '@lib/managers';
import type {Chat} from '@layer';

export function canLeaveCommunity(community: Chat) {
  return community?._ === 'community' &&
    !community.pFlags.left &&
    !community.pFlags.creator;
}

export default async function leaveCommunityWithConfirmation(options: {
  communityId: ChatId,
  managers: AppManagers
}) {
  const {communityId, managers} = options;
  const title = await getPeerTitle({
    peerId: communityId.toPeerId(true),
    plainText: true
  });

  try {
    await confirmationPopup({
      titleLangKey: 'Community.Leave',
      descriptionLangKey: 'Community.LeaveConfirm',
      descriptionLangArgs: [title],
      button: {
        langKey: 'Community.Leave',
        isDanger: true
      }
    });
  } catch{
    return false;
  }

  try {
    await managers.appChatsManager.leave(communityId);
    return true;
  } catch(error) {
    console.error('leave community error', error);
    toastNew({langPackKey: 'Error.AnError'});
    return false;
  }
}
