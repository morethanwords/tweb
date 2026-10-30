/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import {ButtonMenuItemOptions, ButtonMenuSync} from '@components/buttonMenu';
import ButtonMenuPeerText from '@components/buttonMenuPeerText';
import contextMenuController from '@helpers/contextMenuController';
import positionMenu from '@helpers/positionMenu';
import ListenerSetter from '@helpers/listenerSetter';
import {getOverlayRoot} from '@helpers/appWindow';
import safeWindowOpen from '@helpers/dom/safeWindowOpen';
import isDocumentRTL from '@helpers/dom/isDocumentRTL';
import {i18n} from '@lib/langPack';
import rootScope from '@lib/rootScope';
import {bindManagersToSession} from '@lib/accounts/bindManagersToAccount';
import apiManagerProxy from '@lib/apiManagerProxy';
import {parseTonAddress} from '@lib/wallet/tonAddress';
import {copyWalletAddress} from '@components/wallet/parts';
import {hotReloadGuard} from '@lib/solidjs/hotReloadGuardProvider';

/** the owner's lookup holds the menu this long at most: past it the menu opens without them */
const OWNER_TIMEOUT = 1000;
/** the menu's DOM outlives its closing animation */
const REMOVE_DELAY = 1000;

/** the last address clicked: a menu whose lookup ended after another click is not opened */
let menuRequest = 0;

type AddressOwner = {peerId?: PeerId, unlinked?: boolean};

/**
 * The Telegram user whose wallet this is, if the server knows one other than us; `unlinked` when the server said the
 * address is nobody's — not when it did not answer in time, or the owner is us or no one to show
 */
async function getAddressOwner(address: string): Promise<AddressOwner> {
  const managers = bindManagersToSession(rootScope.managers);
  const myId = rootScope.myId.toUserId();
  const lookup = managers.appWalletManager.getAddressOwner(address).then(async(owner): Promise<AddressOwner> => {
    const userId = owner?.user_id?.toUserId();
    if(!userId) return {unlinked: true};
    if(userId === myId) return {};
    return await managers.appUsersManager.isRegularUser(userId) ? {peerId: userId.toPeerId(false)} : {};
  }, (): AddressOwner => ({}));

  return Promise.race([lookup, new Promise<AddressOwner>((resolve) => setTimeout(() => resolve({}), OWNER_TIMEOUT))]);
}

/** the explorer's page of the address: the configured explorer's base and the address as one path segment */
function getExplorerUrl(base: string, address: string) {
  return `${(base || 'https://tonviewer.com').replace(/\/$/, '')}/${encodeURIComponent(address)}`;
}

/**
 * A TON address in a message, clicked: what can be done with it — send Grams there, copy it, look it up in the
 * explorer and, when it is someone's wallet on Telegram, open their profile (iOS
 * ChatControllerOpenTonAddressContextMenu). A text that is no valid address keeps the copy and the explorer.
 */
export default async function openTonAddressMenu(options: {
  address: string,
  element: HTMLElement,
  event?: Event
}) {
  const {address, element} = options;
  const request = ++menuRequest;
  const valid = !!parseTonAddress(address);
  const [appConfig, owner] = await Promise.all([
    apiManagerProxy.getAppConfig(),
    valid ? getAddressOwner(address) : {} as AddressOwner
  ]);
  const ownerPeerId = owner.peerId;

  // * another address was clicked, or the message went away, while the owner was looked up
  if(request !== menuRequest || !element.isConnected) {
    return;
  }

  const buttons: ButtonMenuItemOptions[] = [];
  if(valid && appConfig.wallet_available !== false) {
    buttons.push({
      icon: 'wallet',
      text: 'Wallet.SendMoney',
      // * the address as written: the send flow finds its owner again and sends to it as to them
      onClick: () => import('@components/wallet').then(({default: showWalletPopup}) => showWalletPopup({send: {to: address}}))
    });
  }

  buttons.push({
    icon: 'copy',
    text: 'Wallet.CopyAddress',
    onClick: () => copyWalletAddress(address)
  }, {
    icon: 'search',
    text: 'Wallet.Menu.Explorer',
    onClick: () => safeWindowOpen(getExplorerUrl(appConfig.ton_blockchain_explorer_url, address))
  });

  if(ownerPeerId) {
    buttons.push({
      avatarInfo: {peerId: ownerPeerId},
      className: 'with-subtitle',
      textElement: ButtonMenuPeerText(ownerPeerId, i18n('Wallet.ViewProfile')),
      separator: true,
      onClick: () => hotReloadGuard.appImManager.setInnerPeer({peerId: ownerPeerId})
    });
  } else if(owner.unlinked) {
    // * in the owner's place, that there is none (Android didPressTonAddress): a label, not an action
    buttons.push({
      regularText: i18n('Wallet.UnlinkedAddress'),
      secondary: true,
      separator: true,
      onClick: undefined
    });
  }

  const listenerSetter = new ListenerSetter();
  const menu = ButtonMenuSync({buttons, listenerSetter});
  menu.classList.add('contextmenu');
  getOverlayRoot().append(menu);

  // * a key press clicks the link without a pointer: the menu opens under the address then, from its inline start
  const event = options.event as MouseEvent;
  let point: MouseEvent | Touch = event;
  if(!(event?.clientX || event?.clientY)) {
    const rect = element.getBoundingClientRect();
    point = {pageX: isDocumentRTL(element.ownerDocument) ? rect.right : rect.left, pageY: rect.bottom} as Touch;
  }

  positionMenu(point, menu);
  contextMenuController.openBtnMenu(menu, () => {
    setTimeout(() => {
      menu.remove();
      listenerSetter.removeAll();
      buttons.forEach((button) => button.dispose?.());
    }, REMOVE_DELAY);
  }, element);
}
