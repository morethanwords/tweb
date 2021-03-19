import { attachClickEvent, toggleDisability } from "../../../helpers/dom";
import { deepEqual } from "../../../helpers/object";
import { ChannelParticipant } from "../../../layer";
import appChatsManager from "../../../lib/appManagers/appChatsManager";
import appDialogsManager from "../../../lib/appManagers/appDialogsManager";
import appPeersManager from "../../../lib/appManagers/appPeersManager";
import appUsersManager from "../../../lib/appManagers/appUsersManager";
import Button from "../../button";
import { addCancelButton } from "../../popups";
import PopupPeer from "../../popups/peer";
import { SettingSection } from "../../sidebarLeft";
import { SliderSuperTabEventable } from "../../sliderTab";
import { ChatPermissions } from "./groupPermissions";

export default class AppUserPermissionsTab extends SliderSuperTabEventable {
  public participant: ChannelParticipant;
  public chatId: number;
  public userId: number;

  protected init() {
    this.container.classList.add('edit-peer-container', 'user-permissions-container');
    this.title.innerHTML = 'User Permissions';

    let destroyListener: () => void;

    {
      const section = new SettingSection({
        name: 'What can this user do?',
      });
      
      const div = document.createElement('div');
      div.classList.add('chatlist-container');
      section.content.insertBefore(div, section.title);

      const list = appDialogsManager.createChatList();
      div.append(list);

      const {dom} = appDialogsManager.addDialogNew({
        dialog: this.userId,
        container: list,
        drawStatus: false,
        rippleEnabled: true,
        avatarSize: 48
      });

      dom.lastMessageSpan.innerHTML = appUsersManager.getUserStatusString(this.userId);

      const p = new ChatPermissions({
        chatId: this.chatId,
        listenerSetter: this.listenerSetter,
        appendTo: section.content,
        participant: this.participant._ === 'channelParticipantBanned' ? this.participant : undefined
      });

      destroyListener = () => {
        //appChatsManager.editChatDefaultBannedRights(this.chatId, p.takeOut());
        const rights = p.takeOut();
        if(this.participant._ === 'channelParticipantBanned' && deepEqual(this.participant.banned_rights.pFlags, rights.pFlags)) {
          return;
        }

        appChatsManager.editBanned(this.chatId, this.participant, rights);
      };

      this.eventListener.addEventListener('destroy', destroyListener);

      this.scrollable.append(section.container);
    }
    
    {
      const section = new SettingSection({});

      if(this.participant._ === 'channelParticipantBanned') {
        const btnDeleteException = Button('btn-primary btn-transparent danger', {icon: 'delete', text: 'Delete Exception'});

        attachClickEvent(btnDeleteException, () => {
          const toggle = toggleDisability([btnDeleteException], true);
          appChatsManager.clearChannelParticipantBannedRights(this.chatId, this.participant).then(() => {
            this.eventListener.removeEventListener('destroy', destroyListener);
            this.close();
          }, () => {
            toggle();
          });
        }, {listenerSetter: this.listenerSetter});
  
        section.content.append(btnDeleteException);
      }

      const btnDelete = Button('btn-primary btn-transparent danger', {icon: 'deleteuser', text: 'Ban and Remove From Group'});

      attachClickEvent(btnDelete, () => {
        new PopupPeer('popup-group-kick-user', {
          peerId: -this.chatId,
          title: 'Ban User?',
          description: `Are you sure you want to ban <b>${appPeersManager.getPeerTitle(this.userId)}</b>`,
          buttons: addCancelButton([{
            text: 'BAN',
            callback: () => {
              const toggle = toggleDisability([btnDelete], true);

              appChatsManager.kickFromChannel(this.chatId, this.participant).then(() => {
                this.eventListener.removeEventListener('destroy', destroyListener);
                this.close();
              }, () => {
                toggle();
              });
            },
            isDanger: true
          }])
        }).show();
      }, {listenerSetter: this.listenerSetter});

      section.content.append(btnDelete);

      this.scrollable.append(section.container);
    }
  }
}
