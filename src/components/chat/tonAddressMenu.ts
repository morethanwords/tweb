import {avatarNew} from '@components/avatarNew';
import {ButtonMenuItem, ButtonMenuItemOptions, ButtonMenuSync} from '@components/buttonMenu';
import contextMenuController from '@helpers/contextMenuController';
import Icon from '@components/icon';
import {toastNew} from '@components/toast';
import wrapPeerTitle from '@components/wrappers/peerTitle';
import {copyTextToClipboard} from '@helpers/clipboard';
import safeWindowOpen from '@helpers/dom/safeWindowOpen';
import ListenerSetter from '@helpers/listenerSetter';
import {getMiddleware, Middleware} from '@helpers/middleware';
import positionMenu from '@helpers/positionMenu';
import {bindManagersToSession} from '@lib/accounts/bindManagersToAccount';
import {i18n} from '@lib/langPack';
import {getTonAddressExplorerUrl} from '@lib/richTextProcessor/tonAddress';
import rootScope from '@lib/rootScope';
import {hotReloadGuard} from '@lib/solidjs/hotReloadGuardProvider';
import styles from '@components/chat/tonAddressMenu.module.scss';

const AVATAR_SIZE = 34;

async function createProfile(peerId: PeerId, middleware: Middleware) {
  const profile = document.createElement('div');
  profile.classList.add(styles.profile);

  const avatar = avatarNew({peerId, size: AVATAR_SIZE, middleware});
  avatar.node.classList.add(styles.avatar);

  const name = document.createElement('div');
  name.classList.add(styles.name);
  name.append(await wrapPeerTitle({peerId}));

  const action = document.createElement('div');
  action.classList.add(styles.action);
  action.append(i18n('TonAddress.GoToProfile'), Icon('next'));

  const info = document.createElement('div');
  info.classList.add(styles.info);
  info.append(name, action);

  profile.append(avatar.node, info);
  return profile;
}

function createGap() {
  const gap = document.createElement('hr');
  gap.classList.add(styles.gap);
  gap.setAttribute('role', 'separator');
  return gap;
}

/** A press on a wallet's address in a message: what can be done with it, and whose it is */
export default async function openTonAddressMenu(anchor: HTMLAnchorElement, event: MouseEvent) {
  const address = anchor.textContent;
  const managers = bindManagersToSession(rootScope.managers);
  const middlewareHelper = getMiddleware();
  const middleware = middlewareHelper.get();

  const buttons: ButtonMenuItemOptions[] = [{
    icon: 'copy',
    text: 'TonAddress.Copy',
    onClick: () => {
      copyTextToClipboard(address);
      toastNew({langPackKey: 'TonAddress.Copied'});
    }
  }, {
    icon: 'search',
    text: 'TonAddress.OpenExplorer',
    onClick: () => safeWindowOpen(getTonAddressExplorerUrl(address))
  }];

  const listenerSetter = new ListenerSetter();
  const element = ButtonMenuSync({buttons, listenerSetter});
  element.classList.add('contextmenu');
  document.body.append(element);
  positionMenu(event, element);
  contextMenuController.openBtnMenu(element, () => {
    listenerSetter.removeAll();
    middlewareHelper.destroy();
    setTimeout(() => element.remove(), 400);
  }, anchor);

  // the owner comes when it comes: the menu is open by then, and takes the profile in
  const chat = hotReloadGuard.appImManager.chat;
  const bubble = anchor.closest<HTMLElement>('.bubble');
  const senderPeerId = bubble?.dataset.mid && chat?.getMessage(+bubble.dataset.mid)?.fromId;
  const userIds = [senderPeerId, chat?.peerId].filter((peerId) => peerId && peerId.isUser()).map((peerId) => peerId.toUserId());
  try {
    const owner = await managers.appUsersManager.getUserIdByTonAddress(address, userIds);
    if(!middleware()) return;

    if(!owner) {
      element.append(...ButtonMenuItem({
        separator: createGap(),
        className: styles.note,
        text: 'TonAddress.NotRegistered',
        onClick: undefined
      }));
      positionMenu(event, element);
      return;
    }

    const peerId = owner.toPeerId(false);
    const textElement = await createProfile(peerId, middleware);
    if(!middleware()) return;

    element.append(...ButtonMenuItem({
      separator: createGap(),
      className: styles.item,
      textElement,
      options: {listenerSetter},
      onClick: () => hotReloadGuard.appImManager.setInnerPeer({peerId})
    }));
    positionMenu(event, element);
  } catch(err) {
    console.error('[tonAddressMenu] no owner for', address, err);
  }
}
