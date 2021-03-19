import { attachClickEvent } from "../../../helpers/dom";
import { deepEqual } from "../../../helpers/object";
import { ChannelParticipant } from "../../../layer";
import appChatsManager from "../../../lib/appManagers/appChatsManager";
import appDialogsManager from "../../../lib/appManagers/appDialogsManager";
import appProfileManager from "../../../lib/appManagers/appProfileManager";
import appUsersManager from "../../../lib/appManagers/appUsersManager";
import Button from "../../button";
import { SettingSection } from "../../sidebarLeft";
import { SliderSuperTabEventable } from "../../sliderTab";
import { ChatPermissions } from "./groupPermissions";

export default class AppUserPermissionsTab extends SliderSuperTabEventable {
  public participant: ChannelParticipant.channelParticipantBanned;
  public chatId: number;
  public userId: number;

  protected init() {
    this.container.classList.add('edit-peer-container', 'user-permissions-container');
    this.title.innerHTML = 'User Permissions';

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
        participant: this.participant
      });

      this.eventListener.addEventListener('destroy', () => {
        //appChatsManager.editChatDefaultBannedRights(this.chatId, p.takeOut());
        const rights = p.takeOut();
        if(deepEqual(this.participant.banned_rights.pFlags, rights.pFlags)) {
          return;
        }

        appChatsManager.editBanned(this.chatId, this.participant, rights);
      });

      this.scrollable.append(section.container);
    }
    
    {
      const section = new SettingSection({});

      const btnDelete = Button('btn-primary btn-transparent danger', {icon: 'deleteuser', text: 'Ban and Remove From Group'});

      attachClickEvent(btnDelete, () => {
        /* new PopupPeer('popup-delete-group', {
          peerId: -this.chatId,
          title: 'Delete Group?',
          description: `Are you sure you want to delete this group? All members will be removed, and all messages will be lost.`,
          buttons: addCancelButton([{
            text: 'DELETE',
            callback: () => {
              toggleDisability([btnDelete], true);

              appChatsManager.deleteChannel(this.chatId).then(() => {
                this.close();
              }, () => {
                toggleDisability([btnDelete], false);
              });
            },
            isDanger: true
          }])
        }).show(); */
      }, {listenerSetter: this.listenerSetter});

      section.content.append(btnDelete);

      this.scrollable.append(section.container);
    }
  }
}
