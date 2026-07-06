import {onCleanup, onMount} from 'solid-js';
import {ButtonMenuSync} from '@components/buttonMenu';
import appDialogsManager, {DIALOG_LIST_ELEMENT_TAG} from '@lib/appDialogsManager';
import showPickUserPopup from '@components/popups/pickUser';
import rootScope from '@lib/rootScope';
import findUpTag from '@helpers/dom/findUpTag';
import ButtonCorner from '@components/buttonCorner';
import {attachClickEvent} from '@helpers/dom/clickEvent';
import formatUserPhone from '@components/wrappers/formatUserPhone';
import useIsCrmSuperAdmin from '@stores/crmRole';
import getUserStatusString from '@components/wrappers/getUserStatusString';
import {attachContextMenuListener} from '@helpers/dom/attachContextMenuListener';
import positionMenu from '@helpers/positionMenu';
import contextMenuController from '@helpers/contextMenuController';
import getPeerActiveUsernames from '@appManagers/utils/peers/getPeerActiveUsernames';
import Section from '@components/section';
import {useSuperTab} from '@components/solidJsTabs/superTabProvider';
import type {AppBlockedUsersTab} from '@components/solidJsTabs/tabs';

const BlockedUsers = () => {
  const [tab] = useSuperTab<typeof AppBlockedUsersTab>();
  const {peerIds} = tab.payload;

  let captionEl!: HTMLDivElement;
  let menuElement: HTMLElement;

  const list = appDialogsManager.createChatList();

  const add = async(peerId: PeerId, append: boolean) => {
    const dialogElement = appDialogsManager.addDialogNew({
      peerId: peerId,
      container: list,
      rippleEnabled: true,
      avatarSize: 'abitbigger',
      append,
      wrapOptions: {
        middleware: tab.middlewareHelper.get()
      }
    });

    (dialogElement.container as any).dialogElement = dialogElement;
    const {dom} = dialogElement;

    const user = await tab.managers.appUsersManager.getUser(peerId.toUserId());
    if(!user) {
      return;
    }

    const usernames = getPeerActiveUsernames(user);
    const username = usernames[0];
    if(user.pFlags.bot) {
      dom.lastMessageSpan.append('@' + username);
    } else {
      // Phone numbers are CRM-superadmin-only.
      if(user.phone && useIsCrmSuperAdmin()()) dom.lastMessageSpan.textContent = formatUserPhone(user.phone);
      else dom.lastMessageSpan.append(username ? '@' + username : getUserStatusString(user));
    }
  };

  onMount(() => {
    tab.container.classList.add('blocked-users-container');
    captionEl.parentElement.prepend(captionEl);
    tab.scrollable.container.classList.add('chatlist-container');

    const btnAdd = ButtonCorner({icon: 'add', className: 'is-visible'});
    tab.content.append(btnAdd);

    attachClickEvent(btnAdd, (e) => {
      showPickUserPopup({
        titleLangKey: 'BlockedUsers',
        peerType: ['contacts'],
        placeholder: 'BlockModal.Search.Placeholder',
        onSelect: (chosen) => {
          tab.managers.appUsersManager.toggleBlock(chosen[0].peerId, true);
        }
      });
    }, {listenerSetter: tab.listenerSetter});

    for(const peerId of peerIds) {
      add(peerId, true);
    }

    let target: HTMLElement;
    const onUnblock = () => {
      const peerId = target.dataset.peerId.toPeerId();
      tab.managers.appUsersManager.toggleBlock(peerId, false);
    };

    const element = menuElement = ButtonMenuSync({
      buttons: [{
        icon: 'lockoff',
        text: 'Unblock',
        onClick: onUnblock,
        options: {listenerSetter: tab.listenerSetter}
      }]
    });
    element.id = 'blocked-users-contextmenu';
    element.classList.add('contextmenu');

    document.body.append(element);

    attachContextMenuListener({
      element: tab.scrollable.container,
      callback: (e) => {
        target = findUpTag(e.target, DIALOG_LIST_ELEMENT_TAG);
        if(!target) {
          return;
        }

        if(e instanceof MouseEvent) e.preventDefault();
        if(e instanceof MouseEvent) e.cancelBubble = true;

        positionMenu(e, element);
        contextMenuController.openBtnMenu(element);
      },
      listenerSetter: tab.listenerSetter
    });

    tab.listenerSetter.add(rootScope)('peer_block', (update) => {
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
    tab.scrollable.onScrolledBottom = () => {
      if(loading) {
        return;
      }

      loading = true;
      tab.managers.appUsersManager.getBlocked(list.childElementCount, LOAD_COUNT).then((res) => {
        for(const peerId of res.peerIds) {
          add(peerId, true);
        }

        if(res.peerIds.length < LOAD_COUNT || list.childElementCount === res.count) {
          tab.scrollable.onScrolledBottom = null;
        }

        tab.scrollable.checkForTriggers();
      }).finally(() => {
        loading = false;
      });
    };
  });

  onCleanup(() => {
    menuElement?.remove();
  });

  return (
    <Section caption="BlockedUsersInfo" captionRef={(el) => captionEl = el}>
      {list}
    </Section>
  );
};

export default BlockedUsers;
