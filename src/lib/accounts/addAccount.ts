import Modes from '@config/modes';
import animationIntersector from '@components/animationIntersector';
import appNavigationController, {NavigationItem} from '@components/appNavigationController';
import {closeAllMediaEditors} from '@components/mediaEditor/openEditors';
import PopupElement from '@components/popups/indexTsx';
import contextMenuController from '@helpers/contextMenuController';
import blurActiveElement from '@helpers/dom/blurActiveElement';
import idleController from '@helpers/idleController';
import ListenerSetter from '@helpers/listenerSetter';
import liteMode from '@helpers/liteMode';
import noop from '@helpers/noop';
import overlayCounter from '@helpers/overlayCounter';
import {doubleRaf} from '@helpers/schedulers';
import pause from '@helpers/schedulers/pause';
import {STATE_INIT} from '@config/state';
import {getAccountSwitchingTo} from '@lib/accounts/getCurrentAccount';
import {ActiveAccountNumber} from '@lib/accounts/types';
import {createProxiedManagersForAccount} from '@lib/getProxiedManagers';
import rootScope from '@lib/rootScope';
import {hotReloadGuard} from '@lib/solidjs/hotReloadGuardProvider';
import type {AuthFlowHost, MountAuthFlowState} from '@/pages/mountAuthFlow';

// * the sign-in screens up now: what something else asked for of the app closes them (closeAddAccount)
let adding: {close: () => void};

/**
 * What the user asked for from outside the sign-in screens - a notification, a call's screen - is shown:
 * the screens of an account being added over the app give way to it. A navigation the app began before
 * they came finishes under them instead.
 */
export function closeAddAccount() {
  adding?.close();
}

/**
 * Signs in to another account over the app of this one, in the tab and without reloading it, the way
 * Android and iOS add an account: the app steps back and stays underneath as it was - the chat, its
 * scroll, a draft - with the sign-in screens of the new account over it. Back, Escape or the browser's
 * Back put the app where it was; signed in, the tab switches to the new account behind the screens
 * (switchAccount), and they give way to it.
 *
 * Until then the tab stays on its account: the sign-in reaches the new one through managers of its own,
 * and the app goes on for the account it shows - its notifications, a call.
 */
export default async function addAccount(accountNumber: ActiveAccountNumber) {
  if(adding || getAccountSwitchingTo() !== undefined) {
    return;
  }

  const self = adding = {close: () => signingIn || close(false, false)};
  const page = document.getElementById('page-chats');
  // * nothing of the app behind the screens takes the focus or a click; the link that skips to the
  // * conversation stands before it
  const app = [page, document.getElementById('skip-to-content')].filter(Boolean);
  // * the menu the item was picked from has given the focus back to its button by now
  const opener = document.activeElement as HTMLElement;
  const listenerSetter = new ListenerSetter();
  // * what comes up after this stands over the screens: theirs (a confirmation of a card), or a call's
  const popupsBefore = new Set(PopupElement.POPUPS);
  let open = true, signingIn = false, authFlow: AuthFlowHost & {dispose: () => void};
  // * once the screens are gone nothing more of theirs is sent, and what was on its way is dropped
  const managers = createProxiedManagersForAccount(accountNumber, () => open, true);

  // * a popup to the app: its shortcuts (search, Saved Messages) stay off as under one
  const navigationItem: NavigationItem = {
    type: 'popup',
    onPop: () => {
      authFlow ? authFlow.back() : close();
    }
  };

  // * the chat underneath is out of sight: what arrives in it is not read until it is back
  let releaseFocus: () => void, releaseAnimations: () => void;
  const cover = (covered: boolean) => {
    overlayCounter.isOverlayActive = covered;
    app.forEach((element) => element.inert = covered);
    if(covered) {
      releaseFocus = idleController.holdFocus();
    } else {
      releaseFocus();
    }
  };

  // * the screens' own overlays go with them - a card's confirmation, the editor of the sign-up photo -
  // * and a call's panels stay: closed from elsewhere (a notification) they would be left over the app
  const closeOwnOverlays = () => {
    closeAllMediaEditors();
    PopupElement.POPUPS
    .filter((popup) => !popupsBefore.has(popup) && !popup.keepOnAccountSwitch)
    .forEach((popup) => popup.destroy());
  };

  // * the app zooms away before the screens come, and back once they have gone
  const hideApp = async() => {
    page.classList.add('main-screen-exit');
    if(!liteMode.isAvailable('animations')) {
      page.classList.add('main-screen-exiting');
      return;
    }

    await doubleRaf();
    open && page.classList.add('main-screen-exiting');
    await pause(200);
  };

  const showApp = async(instantly?: boolean) => {
    page.classList.remove('main-screen-exiting');
    if(!instantly && liteMode.isAvailable('animations')) {
      await pause(200);
    }

    page.classList.remove('main-screen-exit');
    // * what plays in it and is in sight plays again
    releaseAnimations?.();
  };

  // * back where it was opened from, the focus too - unless what closed it opens something of its own
  const close = async(instantly?: boolean, focusOpener = true) => {
    if(!open) {
      return;
    }

    open = false;
    if(adding === self) adding = undefined;
    listenerSetter.removeAll();
    appNavigationController.removeItem(navigationItem);
    closeOwnOverlays();
    if(authFlow && !instantly) {
      await authFlow.leave();
    }

    authFlow?.dispose();
    cover(false);
    if(focusOpener && Modes.a11y && opener?.isConnected && opener !== document.body) {
      opener.focus({preventScroll: true});
    }

    await showApp(instantly);
  };

  // * an account signed in to now, or one signed in already (a passkey of it): the tab switches to it
  // * behind the screens, and they go
  const openAccount = async(to: ActiveAccountNumber) => {
    if(!open || signingIn) {
      return;
    }

    signingIn = true;
    appNavigationController.removeItem(navigationItem);
    // * goes with the screens: the switch would hand the focus back to what had it
    blurActiveElement();
    try {
      await hotReloadGuard.switchAccount(to, {underCover: true});
    } finally {
      await close();
    }
  };

  contextMenuController.close();
  cover(true);
  appNavigationController.pushItem(navigationItem);
  // * the app's account is switched from elsewhere: the screens go at once, the switch shows its own way
  listenerSetter.add(rootScope)('account_switched', () => {
    signingIn || close(true, false);
  });

  try {
    const [state, {mountAuthFlow}] = await Promise.all([
      managers.appStateManager.getState(),
      import('@/pages/mountAuthFlow'),
      hideApp()
    ]);

    if(!open) {
      return;
    }

    // * nothing of the app plays out of sight - nor once the window is back in focus, or a popup closes
    releaseAnimations = animationIntersector.holdUnder(page);

    // * the sign-in starts where the last one of the slot stopped - but for the import of a web token: that
    // * belongs to the page opened with it, and would route its destination through the app of this account
    const resumed = state.authState;
    const authState: MountAuthFlowState = !resumed || resumed._ === 'authStateSignedIn' || resumed._ === 'authStateSignImport' ?
      STATE_INIT.authState as MountAuthFlowState :
      resumed;

    authFlow = mountAuthFlow(authState, {
      accountNumber,
      managers,
      overApp: true,
      animateEnter: true,
      back: () => close(),
      toIm: async() => {
        // * a page opened on the account boots into its chats from now on
        await managers.appStateManager.pushToState('authState', {_: 'authStateSignedIn'}).catch(noop);
        await openAccount(accountNumber);
      },
      openAccount
    });
  } catch(err) {
    console.error('add account: the sign-in screens did not open', err);
    close(true);
  }
}
