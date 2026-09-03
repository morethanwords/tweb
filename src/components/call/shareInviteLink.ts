import shareUrlToPeers from '@components/popups/shareUrl';
import {toastNew} from '@components/toast';
import type {GroupCall} from '@layer';
import type GroupCallInstance from '@lib/calls/groupCallInstance';
import rootScope from '@lib/rootScope';

/**
 * Export the call's own invite link and hand it to the sharing picker — the
 * `Share Link` affordance tdesktop offers both in the call menu and as the
 * first row of the invite box (calls_group_invite_controller.cpp:661).
 *
 * Which link gets minted follows calls_group_settings.cpp (~919-966): the
 * speaker link (`can_self_unmute`) exists only for someone who can manage the
 * call, everyone else shares the listener link, and an RTMP stream never has
 * a speaker link. It used to mint the speaker link for every participant and
 * fall back to the host chat's invite link when the export failed — a link that
 * has nothing to do with the call and that a listener was never meant to hand
 * out.
 *
 * `isAlive` guards every await: it must return false once the surface that
 * started the share is gone (popup closed, call left, another call took over).
 */
export default async function shareGroupCallInviteLink(
  instance: GroupCallInstance,
  options: {canManage: boolean, isAlive?: () => boolean}
): Promise<void> {
  const isAlive = options.isAlive ?? (() => true);
  const isRtmp = !!(instance.groupCall as GroupCall.groupCall)?.pFlags?.rtmp_stream;
  const canSelfUnmute = options.canManage && !isRtmp;

  let link: string;
  try {
    link = await rootScope.managers.appGroupCallsManager.exportGroupCallInvite(instance.id, canSelfUnmute);
  } catch(err) {
    if(!isAlive()) return;
    console.error('export group call invite failed', err);
    toastNew({langPackKey: 'Error.AnError'});
    return;
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
