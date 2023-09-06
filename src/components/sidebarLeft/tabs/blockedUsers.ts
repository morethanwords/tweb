/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import {SliderSuperTab} from '../../slider';
import {ButtonMenuSync} from '../../buttonMenu';
import appDialogsManager, {DIALOG_LIST_ELEMENT_TAG} from '../../../lib/appManagers/appDialogsManager';
import PopupPickUser from '../../popups/pickUser';
import rootScope from '../../../lib/rootScope';
import findUpTag from '../../../helpers/dom/findUpTag';
import ButtonCorner from '../../buttonCorner';
import {attachClickEvent} from '../../../helpers/dom/clickEvent';
import formatUserPhone from '../../wrappers/formatUserPhone';
import getUserStatusString from '../../wrappers/getUserStatusString';
import {attachContextMenuListener} from '../../../helpers/dom/attachContextMenuListener';
import positionMenu from '../../../helpers/positionMenu';
import contextMenuController from '../../../helpers/contextMenuController';
import getPeerActiveUsernames from '../../../lib/appManagers/utils/peers/getPeerActiveUsernames';
import SettingSection from '../../settingSection';
import PopupElement from '../../popups';

export default class AppBlockedUsersTab extends SliderSuperTab {
  public peerIds: PeerId[];
  private menuElement: HTMLElement;

  public init() {
    this.container.classList.add('blocked-users-container');
    this.setTitle('BlockedUsers');

    const section = new SettingSection({
      caption: 'BlockedUsersInfo'
    });

    section.caption.parentElement.prepend(section.caption);

    this.scrollable.append(section.container);

    const btnAdd = ButtonCorner({icon: 'add', className: 'is-visible'});
    this.content.append(btnAdd);

    attachClickEvent(btnAdd, (e) => {
      PopupElement.createPopup(PopupPickUser, {
        peerType: ['contacts'],
        placeholder: 'BlockModal.Search.Placeholder',
        onSelect: (peerId) => {
          // console.log('block', peerId);
          this.managers.appUsersManager.toggleBlock(peerId, true);
        }
      });
    }, {listenerSetter: this.listenerSetter});

    const list = appDialogsManager.createChatList();
    this.scrollable.container.classList.add('chatlist-container');
    section.content.append(list);

    const add = async(peerId: PeerId, append: boolean) => {
      const dialogElement = appDialogsManager.addDialogNew({
        peerId: peerId,
        container: list,
        rippleEnabled: true,
        avatarSize: 'abitbigger',
        append,
        wrapOptions: {
          middleware: this.middlewareHelper.get()
        }
      });

      (dialogElement.container as any).dialogElement = dialogElement;
      const {dom} = dialogElement;

      const user = await this.managers.appUsersManager.getUser(peerId.toUserId());
      if(!user) {
        return;
      }

      const usernames = getPeerActiveUsernames(user);
      const username = usernames[0];
      if(user.pFlags.bot) {
        dom.lastMessageSpan.append('@' + username);
      } else {
        if(user.phone) dom.lastMessageSpan.textContent = formatUserPhone(user.phone);
        else dom.lastMessageSpan.append(username ? '@' + username : getUserStatusString(user));
      }
    };

    for(const peerId of this.peerIds) {
      add(peerId, true);
    }

    let target: HTMLElement;
    const onUnblock = () => {
      const peerId = target.dataset.peerId.toPeerId();
      this.managers.appUsersManager.toggleBlock(peerId, false);
    };

    const element = this.menuElement = ButtonMenuSync({
      buttons: [{
        icon: 'lockoff',
        text: 'Unblock',
        onClick: onUnblock,
        options: {listenerSetter: this.listenerSetter}
      }]
    });
    element.id = 'blocked-users-contextmenu';
    element.classList.add('contextmenu');

    document.getElementById('page-chats').append(element);

    attachContextMenuListener({
      element: this.scrollable.container,
      callback: (e) => {
        target = findUpTag(e.target, DIALOG_LIST_ELEMENT_TAG);
        if(!target) {
          return;
        }

        if(e instanceof MouseEvent) e.preventDefault();
        // smth
        if(e instanceof MouseEvent) e.cancelBubble = true;

        positionMenu(e, element);
        contextMenuController.openBtnMenu(element);
      },
      listenerSetter: this.listenerSetter
    });

    this.listenerSetter.add(rootScope)('peer_block', (update) => {
      const {peerId, blocked, blockedMyStoriesFrom} = update;
      if(blockedMyStoriesFrom) {
        return;
      }

      const li = list.querySelector(`[data-peer-id="${peerId}"]`);
      if(blocked) {
        if(!li) {
          add(peerId, false);
        }
      } else if(li) {
        (li as any).dialogElement.remove();
      }
    });

    const LOAD_COUNT = 50;
    let loading = false;
    this.scrollable.onScrolledBottom = () => {
      if(loading) {
        return;
      }

      loading = true;
      this.managers.appUsersManager.getBlocked(list.childElementCount, LOAD_COUNT).then((res) => {
        for(const peerId of res.peerIds) {
          add(peerId, true);
        }

        if(res.peerIds.length < LOAD_COUNT || list.childElementCount === res.count) {
          this.scrollable.onScrolledBottom = null;
        }

        this.scrollable.checkForTriggers();
      }).finally(() => {
        loading = false;
      });
    };
  }

  onOpenAfterTimeout() {
    this.scrollable.onScroll();
  }

  onCloseAfterTimeout() {
    if(this.menuElement) {
      this.menuElement.remove();
    }

    return super.onCloseAfterTimeout();
  }
}
