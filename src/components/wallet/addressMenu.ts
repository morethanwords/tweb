/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import {ButtonMenuItemOptions, ButtonMenuSync} from '@components/buttonMenu';
import ButtonMenuPeerText from '@components/buttonMenuPeerText';
import wrapPeerTitle from '@components/wrappers/peerTitle';
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
import {makeFullMid} from '@appManagers/utils/messages/fullMid';
import {parseTonAddress} from '@lib/wallet/tonAddress';
import {WALLET_SEND_MONEY_RELEASED} from '@lib/wallet/release';
import {copyWalletAddress} from '@components/wallet/parts';
import {hotReloadGuard} from '@lib/solidjs/hotReloadGuardProvider';
import styles from '@components/wallet/addressMenu.module.scss';

/** the owner's lookup holds the menu this long at most: past it the menu opens without them */
const OWNER_TIMEOUT = 1000;
/** the menu's DOM outlives its closing animation */
const REMOVE_DELAY = 1000;
const OWNER_AVATAR_SIZE = 34;

/** the last address clicked: a menu whose lookup ended after another click is not opened */
let menuRequest = 0;

type AddressOwner = {peerId?: PeerId, unlinked?: boolean};

/**
 * The Telegram user whose wallet this is, by the profiles or the server; `unlinked` when neither knows one — not when
 * the answer did not come in time, or the owner is no one to show. Only the profiles loaded already are asked before
 * the server: a profile to load is waited for only when the server will not say
 */
async function getAddressOwner(address: string, userIds: UserId[]): Promise<AddressOwner> {
  const managers = bindManagersToSession(rootScope.managers);
  const {appWalletManager} = managers;
  const lookup = appWalletManager.getKnownAddressOwner(address, userIds)
  .then((known) => known ?? appWalletManager.getAddressOwner(address).then((owner) => owner?.user_id?.toUserId(), (err: ApiError) => {
    if(err?.type !== 'WALLET_UNAVAILABLE') throw err;
    return appWalletManager.getKnownAddressOwner(address, userIds, true);
  }))
  .then(async(userId): Promise<AddressOwner> => {
    if(!userId) return {unlinked: true};
    return await managers.appUsersManager.isRegularUser(userId) ? {peerId: userId.toPeerId(false)} : {};
  }, (): AddressOwner => ({}));

  return Promise.race([lookup, new Promise<AddressOwner>((resolve) => setTimeout(() => resolve({}), OWNER_TIMEOUT))]);
}

/** Who is at hand where the address was clicked: the author of its message and the user of its chat */
function getUsersAtHand(element: HTMLElement) {
  const chat = hotReloadGuard.appImManager?.chat;
  const bubble = element.closest<HTMLElement>('.bubble');
  // * the bubble's own peer: a search through every chat shows messages of others than the chat's
  const chatPeerId = bubble?.dataset.peerId ? bubble.dataset.peerId.toPeerId() : chat?.peerId;
  const senderPeerId = bubble?.dataset.mid && chat?.getMessage(makeFullMid(chatPeerId, +bubble.dataset.mid))?.fromId;
  return [senderPeerId, chatPeerId].filter((peerId) => peerId && peerId.isUser()).map((peerId) => peerId.toUserId());
}

function createGap() {
  const gap = document.createElement('hr');
  gap.classList.add(styles.gap);
  gap.setAttribute('role', 'separator');
  return gap;
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
    valid ? getAddressOwner(address, getUsersAtHand(element)) : {} as AddressOwner
  ]);
  const ownerPeerId = owner.peerId;

  // * another address was clicked, or the message went away, while the owner was looked up
  if(request !== menuRequest || !element.isConnected) {
    return;
  }

  // * the name is in the owner's row before the menu opens: the row sets the menu's width
  const ownerTitle = ownerPeerId && await wrapPeerTitle({peerId: ownerPeerId});
  if(request !== menuRequest || !element.isConnected) {
    return;
  }

  const buttons: ButtonMenuItemOptions[] = [];
  if(WALLET_SEND_MONEY_RELEASED && valid && appConfig.wallet_available !== false) {
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
      avatarInfo: {peerId: ownerPeerId, size: OWNER_AVATAR_SIZE},
      className: styles.owner,
      textElement: ButtonMenuPeerText(ownerPeerId, i18n('Wallet.ViewProfile'), ownerTitle),
      separator: createGap(),
      onClick: () => hotReloadGuard.appImManager.setInnerPeer({peerId: ownerPeerId})
    });
  } else if(owner.unlinked) {
    // * in the owner's place, that there is none (Android didPressTonAddress): a label, not an action
    buttons.push({
      className: styles.note,
      text: 'Wallet.UnlinkedAddress',
      separator: createGap(),
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
