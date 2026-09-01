import shareUrlToPeers from '@components/popups/shareUrl';
import {toastNew} from '@components/toast';
import type GroupCallInstance from '@lib/calls/groupCallInstance';
import rootScope from '@lib/rootScope';

/**
 * Export the call's own invite link and hand it to the sharing picker — the
 * `Share Link` affordance tdesktop offers both in the call menu and as the
 * first row of the invite box (calls_group_invite_controller.cpp:661).
 *
 * The call's link is the canonical choice: it deep-links straight into the
 * active call. A legacy chat-bound call can fall back to its host chat link;
 * an E2E conference has chatId=0, so asking appProfileManager for that
 * imaginary chat is guaranteed to fail.
 *
 * `isAlive` guards every await: it must return false once the surface that
 * started the share is gone (popup closed, call left, another call took over).
 */
export default async function shareGroupCallInviteLink(
  instance: GroupCallInstance,
  isAlive: () => boolean = () => true
): Promise<void> {
  let link: string;
  try {
    link = await rootScope.managers.appGroupCallsManager.exportGroupCallInvite(instance.id, true);
  } catch(err) {
    if(!isAlive()) return;

    if(instance.e2e || !instance.chatId) {
      console.error('share conference invite failed', err);
      toastNew({langPackKey: 'Error.AnError'});
      return;
    }

    try {
      link = await rootScope.managers.appProfileManager.getChatInviteLink(instance.chatId);
    } catch(fallbackErr) {
      if(!isAlive()) return;
      console.error('share invite: both exports failed', err, fallbackErr);
      toastNew({langPackKey: 'Error.AnError'});
      return;
    }
  }

  if(!isAlive()) return;

  try {
    shareUrlToPeers({
      url: link,
      multiSelect: true,
      toastKey: 'InviteLinkSentSingle',
      toastKeyForMany: 'InviteLinkSentMany'
    });
  } catch(err) {
    if(!isAlive()) return;
    console.error('open share invite popup failed', err);
    toastNew({langPackKey: 'Error.AnError'});
  }
}
