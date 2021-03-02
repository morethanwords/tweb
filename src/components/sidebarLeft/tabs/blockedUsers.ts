import { SliderSuperTab } from "../../slider";
import { SettingSection } from "..";
import { attachContextMenuListener, openBtnMenu, positionMenu } from "../../misc";
import { attachClickEvent, findUpTag } from "../../../helpers/dom";
import ButtonMenu from "../../buttonMenu";
import appDialogsManager from "../../../lib/appManagers/appDialogsManager";
import appUsersManager from "../../../lib/appManagers/appUsersManager";
import Button from "../../button";
import PopupPickUser from "../../popups/pickUser";
import rootScope from "../../../lib/rootScope";

export default class AppBlockedUsersTab extends SliderSuperTab {
  public peerIds: number[];
  private menuElement: HTMLElement;
  
  protected init() {
    this.container.classList.add('blocked-users-container');
    this.title.innerText = 'Blocked Users';

    {
      const section = new SettingSection({
        caption: 'Blocked users will not be able to contact you and will not see your Last Seen time.'
      });

      this.scrollable.append(section.container);
    }

    const btnAdd = Button('btn-circle btn-corner tgico-add is-visible');
    this.content.append(btnAdd);

    attachClickEvent(btnAdd, (e) => {
      new PopupPickUser({
        peerTypes: ['contacts'],
        placeholder: 'Block user...',
        onSelect: (peerId) => {
          //console.log('block', peerId);
          appUsersManager.toggleBlock(peerId, true);
        },
      });
    }, {listenerSetter: this.listenerSetter});

    const list = document.createElement('ul');
    this.scrollable.container.classList.add('chatlist-container');
    this.scrollable.append(list);

    const add = (peerId: number, append: boolean) => {
      const {dom} = appDialogsManager.addDialogNew({
        dialog: peerId,
        container: list,
        drawStatus: false,
        rippleEnabled: true,
        avatarSize: 48,
        append
      });

      const user = appUsersManager.getUser(peerId);
      dom.lastMessageSpan.innerHTML = user.pFlags.bot ? ('@' + user.username) : user.rPhone || (user.username ? '@' + user.username : appUsersManager.getUserStatusString(peerId));
    };

    for(const peerId of this.peerIds) {
      add(peerId, true);
    }

    let target: HTMLElement;
    const onUnblock = () => {
      const peerId = +target.dataset.peerId;
      appUsersManager.toggleBlock(peerId, false);
    };

    const element = this.menuElement = ButtonMenu([{
      icon: 'unlock',
      text: 'Unblock',
      onClick: onUnblock,
      options: {listenerSetter: this.listenerSetter}
    }]);
    element.id = 'blocked-users-contextmenu';
    element.classList.add('contextmenu');

    document.getElementById('page-chats').append(element);

    attachContextMenuListener(this.scrollable.container, (e) => {
      target = findUpTag(e.target, 'LI');
      if(!target) {
        return;
      }

      if(e instanceof MouseEvent) e.preventDefault();
      // smth
      if(e instanceof MouseEvent) e.cancelBubble = true;

      positionMenu(e, element);
      openBtnMenu(element);
    }, this.listenerSetter);

    this.listenerSetter.add(rootScope, 'peer_block', (update) => {
      const {peerId, blocked} = update;
      if(blocked) {
        add(peerId, false);
      } else {
        const li = list.querySelector(`[data-peer-id="${peerId}"]`);
        if(li) {
          li.remove();
        }
      }
    });
  }

  onCloseAfterTimeout() {
    if(this.menuElement) {
      this.menuElement.remove();
    }

    return super.onCloseAfterTimeout();
  }
}
