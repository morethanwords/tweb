import { SliderSuperTab } from "../../slider"
import InputField from "../../inputField";
import EditPeer from "../../editPeer";
import { SettingSection } from "../../sidebarLeft";
import Row from "../../row";
import CheckboxField from "../../checkboxField";
import Button from "../../button";
import appChatsManager from "../../../lib/appManagers/appChatsManager";
import { attachClickEvent } from "../../../helpers/dom";
import appUsersManager from "../../../lib/appManagers/appUsersManager";
import appNotificationsManager from "../../../lib/appManagers/appNotificationsManager";
import PeerTitle from "../../peerTitle";

export default class AppEditContactTab extends SliderSuperTab {
  private nameInputField: InputField;
  private lastNameInputField: InputField;
  private editPeer: EditPeer;
  public peerId: number;

  protected init() {
    this.container.classList.add('edit-peer-container', 'edit-contact-container');
    this.title.innerHTML = 'Edit';

    {
      const section = new SettingSection({noDelimiter: true});
      const inputFields: InputField[] = [];

      const inputWrapper = document.createElement('div');
      inputWrapper.classList.add('input-wrapper');
  
      this.nameInputField = new InputField({
        label: 'Name',
        name: 'contact-name',
        maxLength: 70
      });
      this.lastNameInputField = new InputField({
        label: 'Last Name',
        name: 'contact-lastname',
        maxLength: 70
      });
      
      const user = appUsersManager.getUser(this.peerId);

      this.nameInputField.setOriginalValue(user.first_name);
      this.lastNameInputField.setOriginalValue(user.last_name);

      inputWrapper.append(this.nameInputField.container, this.lastNameInputField.container);
      
      inputFields.push(this.nameInputField, this.lastNameInputField);

      this.editPeer = new EditPeer({
        peerId: this.peerId,
        inputFields,
        listenerSetter: this.listenerSetter,
        doNotEditAvatar: true
      });
      this.content.append(this.editPeer.nextBtn);

      const div = document.createElement('div');
      div.classList.add('avatar-edit');
      div.append(this.editPeer.avatarElem);

      const notificationsCheckboxField = new CheckboxField({
        text: 'Notifications'
      });

      const notificationsRow = new Row({
        checkboxField: notificationsCheckboxField
      });

      notificationsCheckboxField.value = !appNotificationsManager.isPeerLocalMuted(this.peerId, false);

      const profileNameDiv = document.createElement('div');
      profileNameDiv.classList.add('profile-name');
      profileNameDiv.append(new PeerTitle({
        peerId: this.peerId
      }).element);
      //profileNameDiv.innerHTML = 'Karen Stanford';

      const profileSubtitleDiv = document.createElement('div');
      profileSubtitleDiv.classList.add('profile-subtitle');
      profileSubtitleDiv.innerHTML = 'original name';

      section.content.append(div, profileNameDiv, profileSubtitleDiv, inputWrapper, notificationsRow.container);

      this.scrollable.append(section.container);

      attachClickEvent(this.editPeer.nextBtn, () => {
        this.editPeer.nextBtn.disabled = true;
  
        let promises: Promise<any>[] = [];

        const id = -this.peerId;
        if(this.nameInputField.isValid()) {
          promises.push(appChatsManager.editTitle(id, this.nameInputField.value));
        }

        if(this.lastNameInputField.isValid()) {
          promises.push(appChatsManager.editAbout(id, this.lastNameInputField.value));
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

      const btnDelete = Button('btn-primary btn-transparent danger', {icon: 'delete', text: 'Delete Contact'});

      section.content.append(btnDelete);

      this.scrollable.append(section.container);
    }
  }
}
