import { SliderSuperTab } from "../../slider"
import InputField from "../../inputField";
import EditPeer from "../../editPeer";
import { SettingSection } from "../../sidebarLeft";
import Row from "../../row";
import CheckboxField from "../../checkboxField";
import Button from "../../button";
import appChatsManager from "../../../lib/appManagers/appChatsManager";
import appProfileManager from "../../../lib/appManagers/appProfileManager";
import { attachClickEvent, toggleDisability } from "../../../helpers/dom";
import { ChatFull } from "../../../layer";
import PopupPeer from "../../popups/peer";
import { addCancelButton } from "../../popups";

export default class AppEditGroupTab extends SliderSuperTab {
  private groupNameInputField: InputField;
  private descriptionInputField: InputField;
  private editPeer: EditPeer;
  public peerId: number;

  protected async init() {
    this.container.classList.add('edit-peer-container', 'edit-group-container');
    this.title.innerHTML = 'Edit';

    const chatFull = await appProfileManager.getChatFull(-this.peerId, true);

    {
      const section = new SettingSection({noDelimiter: true});
      const inputFields: InputField[] = [];

      const inputWrapper = document.createElement('div');
      inputWrapper.classList.add('input-wrapper');
  
      this.groupNameInputField = new InputField({
        label: 'Group Name',
        name: 'group-name',
        maxLength: 255
      });
      this.descriptionInputField = new InputField({
        label: 'Description',
        name: 'group-description',
        maxLength: 255
      });
      
      this.groupNameInputField.setOriginalValue(appChatsManager.getChat(-this.peerId).title);

      this.descriptionInputField.setOriginalValue(chatFull.about);

      inputWrapper.append(this.groupNameInputField.container, this.descriptionInputField.container);
      
      inputFields.push(this.groupNameInputField, this.descriptionInputField);

      this.editPeer = new EditPeer({
        peerId: this.peerId,
        inputFields,
        listenerSetter: this.listenerSetter
      });
      this.content.append(this.editPeer.nextBtn);

      //section.content.append(this.editPeer.avatarEdit.container, inputWrapper);

      const groupTypeRow = new Row({
        title: 'Group Type',
        subtitle: 'Private',
        clickable: true,
        icon: 'lock'
      });

      const permissionsRow = new Row({
        title: 'Permissions',
        subtitle: '8/8',
        icon: 'permissions',
        clickable: true
      });

      const administratorsRow = new Row({
        title: 'Administrators',
        subtitle: '' + ((chatFull as ChatFull.channelFull).admins_count || 1),
        icon: 'admin',
        clickable: true
      });

      section.content.append(this.editPeer.avatarEdit.container, inputWrapper, groupTypeRow.container, permissionsRow.container, administratorsRow.container);

      this.scrollable.append(section.container);

      attachClickEvent(this.editPeer.nextBtn, () => {
        this.editPeer.nextBtn.disabled = true;
  
        let promises: Promise<any>[] = [];

        const id = -this.peerId;
        if(this.groupNameInputField.isValid()) {
          promises.push(appChatsManager.editTitle(id, this.groupNameInputField.value));
        }

        if(this.descriptionInputField.isValid()) {
          promises.push(appChatsManager.editAbout(id, this.descriptionInputField.value));
        }

        if(this.editPeer.uploadAvatar) {
          promises.push(this.editPeer.uploadAvatar().then(inputFile => {
            return appChatsManager.editPhoto(id, inputFile);
          }));
        }
  
        Promise.race(promises).finally(() => {
          this.editPeer.nextBtn.removeAttribute('disabled');
          this.close();
        });
      }, {listenerSetter: this.listenerSetter});
    }

    {
      const section = new SettingSection({

      });

      const membersRow = new Row({
        title: 'Members',
        subtitle: '2 500',
        icon: 'newgroup',
        clickable: true
      });

      const showChatHistoryCheckboxField = new CheckboxField({
        text: 'Show chat history for new members'
      });

      if(appChatsManager.isChannel(-this.peerId) && !(chatFull as ChatFull.channelFull).pFlags.hidden_prehistory) {
        showChatHistoryCheckboxField.value = true;
      }

      section.content.append(membersRow.container, showChatHistoryCheckboxField.label);

      this.scrollable.append(section.container);
    }

    if(appChatsManager.isChannel(-this.peerId)) {
      const section = new SettingSection({});

      const btnDelete = Button('btn-primary btn-transparent danger', {icon: 'delete', text: 'Delete Group'});

      attachClickEvent(btnDelete, () => {
        new PopupPeer('popup-delete-group', {
          peerId: this.peerId,
          title: 'Delete Group?',
          description: `Are you sure you want to delete this group? All members will be removed, and all messages will be lost.`,
          buttons: addCancelButton([{
            text: 'DELETE',
            callback: () => {
              toggleDisability([btnDelete], true);

              appChatsManager.deleteChannel(-this.peerId).then(() => {
                this.close();
              }, () => {
                toggleDisability([btnDelete], false);
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
