import rootScope from '@lib/rootScope';
import {bindManagersToSession} from '@lib/accounts/bindManagersToAccount';
import type {ChatSetPeerOptions} from '@lib/appImManager';
import {hotReloadGuard} from '@lib/solidjs/hotReloadGuardProvider';
import showSliderPopup from '@components/sliderPopup';

// a popup on its way: a click before it shows is dropped
let opening = false;

/**
 * A peer's profile over the chat: the right sidebar's own profile tab, its shared media and the tabs
 * it opens included, in a popup of the sidebar's size. `stack` is what a chat opened from it goes
 * back to, as when a click on an avatar opened it.
 */
export default async function showPeerProfilePopup(options: {
  peerId: PeerId,
  stack?: ChatSetPeerOptions['stack']
}) {
  if(opening) {
    return;
  }

  // * the account it is asked on: once the tab is on another, it does not open
  const managers = bindManagersToSession(rootScope.managers);
  opening = true;
  try {
    const {default: AppSharedMediaTab} = await import('@components/sidebarRight/tabs/sharedMediaTab');

    // * a chat opened from it, by its buttons or by a link in it, takes the popup away
    const onPeerChanging = () => popup.close();
    const {appImManager} = hotReloadGuard;
    const popup = showSliderPopup({
      managers,
      navigationType: 'profile-popup',
      hidden: true,
      onClose: () => appImManager.removeEventListener('peer_changing', onPeerChanging)
    });
    appImManager.addEventListener('peer_changing', onPeerChanging);

    try {
      // * shown once the profile and its first media are in, as the sidebar slides in
      await AppSharedMediaTab.open(popup.slider, options.peerId, {
        // * the popup's only tab: it closes rather than goes back
        isFirst: false,
        // * a peer of its own rather than a dialog: my profile, not Saved Messages
        noProfile: false,
        isDialog: false,
        openChatStack: options.stack
      });
    } catch(err) {
      popup.close();
      throw err;
    }

    popup.show();
  } finally {
    opening = false;
  }
}
