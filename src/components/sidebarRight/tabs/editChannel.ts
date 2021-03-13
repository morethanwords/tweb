import { SliderSuperTab } from "../../slider"
import InputField from "../../inputField";
import EditPeer from "../../editPeer";
import { SettingSection } from "../../sidebarLeft";
import Row from "../../row";
import CheckboxField from "../../checkboxField";
import Button from "../../button";
import appChatsManager from "../../../lib/appManagers/appChatsManager";
import appProfileManager from "../../../lib/appManagers/appProfileManager";
import { attachClickEvent } from "../../../helpers/dom";

export default class AppEditChannelTab extends SliderSuperTab {
  private nameInputField: InputField;
  private descriptionInputField: InputField;
  private editPeer: EditPeer;
  public peerId: number;

  protected init() {
    this.container.classList.add('edit-peer-container', 'edit-channel-container');
    this.title.innerHTML = 'Edit';

    {
      const section = new SettingSection({noDelimiter: true});
      const inputFields: InputField[] = [];

      const inputWrapper = document.createElement('div');
      inputWrapper.classList.add('input-wrapper');
  
      this.nameInputField = new InputField({
        label: 'Name',
        name: 'channel-name',
        maxLength: 255
      });
      this.descriptionInputField = new InputField({
        label: 'Description',
        name: 'channel-description',
        maxLength: 255
      });
      
      this.nameInputField.setOriginalValue(appChatsManager.getChat(-this.peerId).title);

      appProfileManager.getChatFull(-this.peerId).then(chatFull => {
        this.descriptionInputField.setOriginalValue(chatFull.about);
      });

      inputWrapper.append(this.nameInputField.container, this.descriptionInputField.container);
      
      inputFields.push(this.nameInputField, this.descriptionInputField);

      this.editPeer = new EditPeer({
        peerId: this.peerId,
        inputFields,
        listenerSetter: this.listenerSetter
      });
      this.content.append(this.editPeer.nextBtn);

      const groupTypeRow = new Row({
        title: 'Channel Type',
        subtitle: 'Private',
        clickable: true,
        icon: 'lock'
      });

      const administratorsRow = new Row({
        title: 'Administrators',
        subtitle: '5',
        icon: 'admin',
        clickable: true
      });

      const signMessagesCheckboxField = new CheckboxField({
        text: 'Sign Messages',
        checked: false
      });

      section.content.append(this.editPeer.avatarEdit.container, inputWrapper, groupTypeRow.container, administratorsRow.container, signMessagesCheckboxField.label);

      this.scrollable.append(section.container);

      attachClickEvent(this.editPeer.nextBtn, () => {
        this.editPeer.nextBtn.disabled = true;
  
        let promises: Promise<any>[] = [];

        const id = -this.peerId;
        if(this.nameInputField.isValid()) {
          promises.push(appChatsManager.editTitle(id, this.nameInputField.value));
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

      const subscribersRow = new Row({
        title: 'Subscribers',
        subtitle: '335 356 subscribers',
        icon: 'newgroup',
        clickable: true
      });

      section.content.append(subscribersRow.container);

      this.scrollable.append(section.container);
    }

    {
      const section = new SettingSection({
        
      });

      const btnDelete = Button('btn-primary btn-transparent danger', {icon: 'delete', text: 'Delete Channel'});

      section.content.append(btnDelete);

      this.scrollable.append(section.container);
    }
  }
}
