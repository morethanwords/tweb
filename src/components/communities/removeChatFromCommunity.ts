import confirmationPopup from '@components/confirmationPopup';
import {toastNew} from '@components/toast';
import getPeerTitle from '@components/wrappers/getPeerTitle';
import type {AppManagers} from '@lib/managers';

/**
 * Unlinks a chat from a Community, asking first. Shared by every place that offers it —
 * the chat-list context menu and the Community settings list — so the wording, the toast
 * and the error handling can't drift apart.
 *
 * Returns whether the chat was actually removed (false when the user backed out).
 */
export default async function removeChatFromCommunityWithConfirmation(options: {
  communityId: ChatId,
  peerId: PeerId,
  managers: AppManagers
}) {
  const {communityId, peerId, managers} = options;
  const title = await getPeerTitle({peerId, plainText: true});

  try {
    await confirmationPopup({
      titleLangKey: 'Community.RemoveChat',
      descriptionLangKey: 'Community.RemoveChatConfirm',
      descriptionLangArgs: [title],
      button: {
        langKey: 'Remove',
        isDanger: true
      }
    });
  } catch{
    return false;
  }

  try {
    await managers.appCommunitiesManager.togglePeerLink({
      communityId,
      peerId,
      action: 'deleted'
    });
    toastNew({langPackKey: 'Community.ChatRemoved'});
    return true;
  } catch(error) {
    console.error('remove chat from community error', error);
    toastNew({langPackKey: 'Error.AnError'});
    return false;
  }
}
