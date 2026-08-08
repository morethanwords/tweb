import PopupElement from '@components/popups';
import PopupMute from '@components/popups/mute';
import type {AppManagers} from '@lib/managers';

/**
 * Muting a Community is ONE notify setting on the Community itself — not one per chat
 * inside it. Both entry points (the chat-list row and the Community panel menu) go
 * through here so the popup's positional arguments stay in a single place.
 */
export function showCommunityMutePopup(communityId: ChatId) {
  PopupElement.createPopup(PopupMute, undefined, undefined, communityId);
}

export function unmuteCommunity(communityId: ChatId, managers: AppManagers) {
  return managers.appCommunitiesManager.muteCommunity(communityId, 0);
}
