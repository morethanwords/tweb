import rootScope from '@lib/rootScope';
import {ButtonMenuItemOptionsVerifiable} from '@components/buttonMenu';
import {toastNew} from '@components/toast';
import wrapPeerTitle from '@components/wrappers/peerTitle';

// * turns the notifications about a peer's new stories off or on, and says so
export async function toggleStoriesNotifyMute(peerId: PeerId, mute: boolean) {
  rootScope.managers.appNotificationsManager.toggleStoriesMute(peerId, mute);

  toastNew({
    langPackKey: mute ? 'NotificationsStoryMutedHint' : 'NotificationsStoryUnmutedHint',
    langPackArguments: [await wrapPeerTitle({peerId})]
  });
}

// * the two items that do it, one shown at a time, in the feed's menu and the viewer's: `getPeerId` is
// * read when the menu opens, `canToggle` says whether the peer is one to have them at all
export function createStoriesNotifyMuteButtons(
  getPeerId: () => PeerId,
  canToggle: () => boolean
): ButtonMenuItemOptionsVerifiable[] {
  const isMuted = () => rootScope.managers.appNotificationsManager.isPeerStoriesMuted(getPeerId());
  return [{
    icon: 'mute',
    text: 'NotificationsStoryMute2',
    onClick: () => toggleStoriesNotifyMute(getPeerId(), true),
    verify: () => canToggle() && isMuted().then((isMuted) => !isMuted),
    multiline: true
  }, {
    icon: 'unmute',
    text: 'NotificationsStoryUnmute2',
    onClick: () => toggleStoriesNotifyMute(getPeerId(), false),
    verify: () => canToggle() && isMuted(),
    multiline: true
  }];
}
