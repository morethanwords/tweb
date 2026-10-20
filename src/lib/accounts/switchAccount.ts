import {MOUNT_CLASS_TO} from '@config/debug';
import Modes from '@config/modes';
import {changeAccount} from '@lib/accounts/changeAccount';
import {createAppURLForAccount} from '@lib/accounts/createAppURLForAccount';
import {getCurrentAccount, setAccountSwitchingTo} from '@lib/accounts/getCurrentAccount';
import AccountController from '@lib/accounts/accountController';
import {ActiveAccountNumber} from '@lib/accounts/types';
import apiManagerProxy from '@lib/apiManagerProxy';
import appImManager from '@lib/appImManager';
import appDialogsManager from '@lib/appDialogsManager';
import rootScope from '@lib/rootScope';
import singleInstance from '@lib/singleInstance';
import uiNotificationsManager from '@lib/uiNotificationsManager';
import appSidebarLeft from '@components/sidebarLeft';
import appSidebarRight from '@components/sidebarRight';
import appNavigationController from '@components/appNavigationController';
import appMediaPlaybackController from '@components/appMediaPlaybackController';
import {hasCallInTab} from '@lib/calls/callAccount';
import PopupElement from '@components/popups/indexTsx';
import {AppMediaViewerRtmp} from '@components/mediaViewer/rtmp';
import {closeInAppBrowser} from '@components/browser';
import {hideToast} from '@components/toast';
import {closeAllMediaEditors} from '@components/mediaEditor/openEditors';
import {whenTabsDestroyed} from '@components/slider';
import contextMenuController from '@helpers/contextMenuController';
import tooltipController from '@helpers/tooltipController';
import DeferredIsUsingPasscode from '@lib/passcode/deferredIsUsingPasscode';
import {saveEncryptionKeyForHandoff} from '@lib/passcode/keyHandoff';
import getPeerTitle from '@components/wrappers/getPeerTitle';
import {i18n} from '@lib/langPack';
import liteMode from '@helpers/liteMode';
import pause from '@helpers/schedulers/pause';
import {doubleRaf} from '@helpers/schedulers';
import noop from '@helpers/noop';
import type AppMediaViewerBase from '@components/mediaViewer/base';

// * how long the switch waits at most for what closed screens save on their way out: a save that hangs
// * must not keep the tab between accounts
const CLOSED_SCREENS_SAVE_TIMEOUT = 3000;

let switching: Promise<void>;
// * the account the last switch asked for goes to: asked for again, it is that same switch
let lastRequestedTo: ActiveAccountNumber;

MOUNT_CLASS_TO && (MOUNT_CLASS_TO.switchAccount = (accountNumber: ActiveAccountNumber) => switchAccount(accountNumber));

/**
 * Shows another signed-in account in this tab without reloading it: the screens of the current one
 * are closed - its drafts saved while it is still the current account - the tab's mirrors are moved to
 * the new one and the screens are opened again for it, the way Android and Desktop switch.
 *
 * A call goes on through the switch, its panels with it: it belongs to its own account (see callAccount).
 * A slot nobody is signed in to still takes the reload - as does a switch that fails half-way, rather
 * than leave the tab between two accounts.
 *
 * Switches asked for while one runs follow it in order; the account being switched to asked again is
 * the same switch.
 */
export default function switchAccount(accountNumber: ActiveAccountNumber) {
  if(switching && lastRequestedTo === accountNumber) {
    return switching;
  }

  lastRequestedTo = accountNumber;
  // * where the switch running now goes, and only that one: a switch queued behind it does not make the
  // * session it is leaving look like staying (isSessionLeaving)
  if(!switching) {
    setAccountSwitchingTo(accountNumber);
  }

  const promise: Promise<void> = (switching ? switching.catch(noop) : Promise.resolve())
  .then(() => {
    setAccountSwitchingTo(accountNumber);
    return _switchAccount(accountNumber);
  })
  .finally(() => {
    if(switching === promise) {
      switching = undefined;
      lastRequestedTo = undefined;
      setAccountSwitchingTo(undefined);
    }
  });

  return switching = promise;
}

async function _switchAccount(to: ActiveAccountNumber) {
  const from = getCurrentAccount();
  if(to === from) {
    return;
  }

  const accountData = await AccountController.get(to);
  if(!accountData.userId) {
    // * the sign-in screen is a page of its own: a call here is not ended for it
    if(hasCallInTab()) {
      changeAccount(to, true);
      return;
    }

    appImManager.goOffline();
    await reloadIntoAccount(to);
    return;
  }

  try {
    await switchInPlace(from, to);
  } catch(err) {
    console.error('account switch failed, reloading into the account', err);
    await reloadIntoAccount(to);
  }
}

async function switchInPlace(from: ActiveAccountNumber, to: ActiveAccountNumber) {
  // * in the document before anything changes, or the first announcement is not read
  const announcement = getAnnouncementRegion();

  const overlaysClosed = closeOverlays();
  // * the menu the account was picked from has given the focus back to its button by now; rebuilding
  // * the screens blurs it, so it is handed back after
  const focused = document.activeElement as HTMLElement;

  appSidebarRight.closeAllTabs();
  appSidebarRight.hide();
  appSidebarLeft.closeEverythingInside();
  // * a closed tab or popup saves what it edited (privacy rules, reactions) as it is destroyed, after its
  // * close transition: that has to reach this account, so the account stays until those are settled -
  // * a popup's own tabs (settings in a popup) close after the popup
  const closedScreensSaved = overlaysClosed.then(whenTabsDestroyed);
  await Promise.all([
    toggleChatListShown(false),
    Promise.race([closedScreensSaved, pause(CLOSED_SCREENS_SAVE_TIMEOUT)])
  ]);

  appImManager.closeForAccountSwitch(to);
  appDialogsManager.closeForAccountSwitch();

  await apiManagerProxy.switchAccount(to);

  // * a call's panels stay, and so does what Escape and Back do to them
  appNavigationController.resetForAccountSwitch(createAppURLForAccount(to), [
    ...PopupElement.POPUPS.filter((popup) => popup.keepOnAccountSwitch).map((popup) => popup.navigationItem),
    AppMediaViewerRtmp.activeInstance?.getNavigationItem()
  ].filter(Boolean));
  rootScope.dispatchEventSingle('account_switched', {from, to});
  rootScope.dispatchEventSingle('premium_toggle', rootScope.premium);
  rootScope.dispatchEventSingle('notification_count_update');
  uiNotificationsManager.onAccountSwitch(to);
  singleInstance.onAccountSwitch();

  appImManager.openAfterAccountSwitch();
  appDialogsManager.openAfterAccountSwitch();
  appSidebarLeft.initNavigation();

  if(Modes.a11y && focused?.isConnected && focused !== document.body) {
    focused.focus({preventScroll: true});
  }

  // * done: neither of these is worth a reload if it fails
  toggleChatListShown(true);
  getPeerTitle({peerId: rootScope.myId, plainText: true}).then((name) => {
    announcement.replaceChildren(i18n('MultiAccount.Switched', [name]));
  }, noop);
}

// * the reload into the account: what a switch in place cannot do, or failed doing
async function reloadIntoAccount(accountNumber: ActiveAccountNumber) {
  // * the reloaded tab has to find the passcode key again, unless another tab is there to hand it over
  if(await DeferredIsUsingPasscode.isUsingPasscode() && apiManagerProxy.getOpenTabsCount() <= 1) {
    await saveEncryptionKeyForHandoff();
  }

  changeAccount(accountNumber);
}

// * the chats of the previous account slide away, the new account's come back in their place
async function toggleChatListShown(shown: boolean) {
  const element = appSidebarLeft.sidebarEl.querySelector<HTMLElement>('.sidebar-slider');
  if(!liteMode.isAvailable('animations')) {
    element.classList.remove('chatlist-exit', 'chatlist-exiting');
    return;
  }

  if(!shown) {
    element.classList.add('chatlist-exit');
    await doubleRaf();
    element.classList.add('chatlist-exiting');
  } else {
    element.classList.remove('chatlist-exiting');
  }

  await pause(200);
  shown && element.classList.remove('chatlist-exit');
}

// * nothing a screen reader is on changes with the switch - the list does - so it is told
let announcementRegion: HTMLElement;
function getAnnouncementRegion() {
  if(!announcementRegion) {
    announcementRegion = document.createElement('span');
    announcementRegion.className = 'sr-only';
    announcementRegion.setAttribute('role', 'status');
    appSidebarLeft.sidebarEl.append(announcementRegion);
  }

  announcementRegion.replaceChildren();
  return announcementRegion;
}

/**
 * Whatever floats above the screens: it shows the previous account's data and holds its handlers - all
 * but a call's panels, which belong to the call's account. Settles once the overlays are closed and the
 * popups disposed, with what they saved on their way out.
 */
function closeOverlays() {
  contextMenuController.close();
  closeDropdowns();
  tooltipController.closeAll();
  hideToast();
  closeInAppBrowser();
  appMediaPlaybackController.resetForAccountSwitch();
  const animatedOverlaysClosed = closeAnimatedOverlays();
  // * before the popups: an editor reports its closing to the popup it was opened from
  closeAllMediaEditors();

  return Promise.all([
    animatedOverlaysClosed,
    ...PopupElement.POPUPS.filter((popup) => !popup.keepOnAccountSwitch).map((popup) => popup.destroy())
  ]);
}

// * a dropdown - one standing on its own too, the emoji status picker - is closed the way Escape closes it:
// * it holds the previous account's managers, and the navigation reset would only drop its Escape
function closeDropdowns() {
  let dropdown: ReturnType<typeof appNavigationController.findItemByType>;
  while((dropdown = appNavigationController.findItemByType('dropdown'))) {
    appNavigationController.removeItem(dropdown.item);
    dropdown.item.onPop(false);
  }
}

// * the media viewer and the stories refuse to close in the middle of an animation (opening, paging) - the
// * stories before their first one shows, too: they close once it is over, or at once if nothing has shown.
// * A live stream's viewer is the stream and stays, as a call's panel does
function closeAnimatedOverlays() {
  const mediaViewer: AppMediaViewerBase<any, any, any> = (window as any).appMediaViewer;
  const stories = appNavigationController.findItemByType('stories')?.item;
  stories && appNavigationController.removeItem(stories);
  return Promise.all([
    stories?.closeOutright?.().catch(noop),
    !(mediaViewer instanceof AppMediaViewerRtmp) && mediaViewer?.closeWhenIdle().catch(noop)
  ]);
}
