/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import {ButtonMenuItemOptions, ButtonMenuSync} from '@components/buttonMenu';
import {avatarNew} from '@components/avatarNew';
import wrapPeerTitle from '@components/wrappers/peerTitle';
import contextMenuController from '@helpers/contextMenuController';
import positionMenu from '@helpers/positionMenu';
import ListenerSetter from '@helpers/listenerSetter';
import {getMiddleware, Middleware} from '@helpers/middleware';
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
 * the answer did not come in time, or the owner is no one to show
 */
async function getAddressOwner(address: string, userIds: UserId[]): Promise<AddressOwner> {
  const managers = bindManagersToSession(rootScope.managers);
  const lookup = managers.appWalletManager.getKnownAddressOwner(address, userIds)
  .then((known) => known ?? managers.appWalletManager.getAddressOwner(address).then((owner) => owner?.user_id?.toUserId()))
  .then(async(userId): Promise<AddressOwner> => {
    if(!userId) return {unlinked: true};
    return await managers.appUsersManager.isRegularUser(userId) ? {peerId: userId.toPeerId(false)} : {};
  }, (err: ApiError): AddressOwner => err?.type === 'WALLET_UNAVAILABLE' ? {unlinked: true} : {});

  return Promise.race([lookup, new Promise<AddressOwner>((resolve) => setTimeout(() => resolve({}), OWNER_TIMEOUT))]);
}

/** Who is at hand where the address was clicked: the author of its message and the user of the chat */
function getUsersAtHand(element: HTMLElement) {
  const chat = hotReloadGuard.appImManager?.chat;
  const bubble = element.closest<HTMLElement>('.bubble');
  const senderPeerId = bubble?.dataset.mid && chat?.getMessage(+bubble.dataset.mid)?.fromId;
  return [senderPeerId, chat?.peerId].filter((peerId) => peerId && peerId.isUser()).map((peerId) => peerId.toUserId());
}

/** The owner's row, laid out as on Android (ItemOptions.addProfile) */
async function createOwnerRow(peerId: PeerId, middleware: Middleware) {
  const row = document.createElement('div');
  row.classList.add(styles.owner);

  const avatar = avatarNew({peerId, size: OWNER_AVATAR_SIZE, middleware});
  avatar.node.classList.add(styles.avatar);

  const name = document.createElement('div');
  name.classList.add(styles.name);
  name.append(await wrapPeerTitle({peerId}));

  const action = document.createElement('div');
  action.classList.add(styles.action);
  action.append(i18n('Wallet.ViewProfile'));

  const info = document.createElement('div');
  info.classList.add(styles.info);
  info.append(name, action);

  row.append(avatar.node, info);
  return row;
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

  const middlewareHelper = getMiddleware();
  const ownerRow = ownerPeerId && await createOwnerRow(ownerPeerId, middlewareHelper.get());
  if(request !== menuRequest || !element.isConnected) {
    middlewareHelper.destroy();
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
      className: styles.item,
      textElement: ownerRow,
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
    middlewareHelper.destroy();
    setTimeout(() => {
      menu.remove();
      listenerSetter.removeAll();
      buttons.forEach((button) => button.dispose?.());
    }, REMOVE_DELAY);
  }, element);
}
