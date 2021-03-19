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
import PopupPeer from "../../popups/peer";
import { addCancelButton } from "../../popups";

export default class AppEditChannelTab extends SliderSuperTab {
  private nameInputField: InputField;
  private descriptionInputField: InputField;
  private editPeer: EditPeer;
  public peerId: number;

  protected async init() {
    this.container.classList.add('edit-peer-container', 'edit-channel-container');
    this.title.innerHTML = 'Edit';

    const chatFull = await appProfileManager.getChannelFull(-this.peerId, true);

    {
      const section = new SettingSection({noDelimiter: true});

      if(appChatsManager.hasRights(-this.peerId, 'change_info')) {
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

        this.descriptionInputField.setOriginalValue(chatFull.about);

        inputWrapper.append(this.nameInputField.container, this.descriptionInputField.container);
        
        inputFields.push(this.nameInputField, this.descriptionInputField);

        this.editPeer = new EditPeer({
          peerId: this.peerId,
          inputFields,
          listenerSetter: this.listenerSetter
        });
        this.content.append(this.editPeer.nextBtn);

        section.content.append(this.editPeer.avatarEdit.container, inputWrapper);

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

      if(appChatsManager.hasRights(-this.peerId, 'change_type')) {
        const channelTypeRow = new Row({
          title: 'Channel Type',
          subtitle: 'Private',
          clickable: true,
          icon: 'lock'
        });
  
        section.content.append(channelTypeRow.container);
      }

      if(appChatsManager.hasRights(-this.peerId, 'change_info')) {
        const discussionRow = new Row({
          title: 'Discussion',
          subtitle: 'Add',
          clickable: true,
          icon: 'message'
        });

        section.content.append(discussionRow.container);
      }

      const administratorsRow = new Row({
        title: 'Administrators',
        subtitle: '' + chatFull.admins_count,
        icon: 'admin',
        clickable: true
      });

      section.content.append(administratorsRow.container);

      if(appChatsManager.hasRights(-this.peerId, 'change_info')) {
        const signMessagesCheckboxField = new CheckboxField({
          text: 'Sign Messages',
          checked: false
        });

        section.content.append(signMessagesCheckboxField.label);
      }

      this.scrollable.append(section.container);
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

    if(appChatsManager.hasRights(-this.peerId, 'delete_chat')) {
      const section = new SettingSection({
        
      });

      const btnDelete = Button('btn-primary btn-transparent danger', {icon: 'delete', text: 'Delete Channel'});

      attachClickEvent(btnDelete, () => {
        new PopupPeer('popup-delete-channel', {
          peerId: this.peerId,
          title: 'Delete Channel?',
          description: `Are you sure you want to delete this channel? All subscribers will be removed and all messages will be lost.`,
          buttons: addCancelButton([{
            text: 'DELETE',
            callback: () => {
              const toggle = toggleDisability([btnDelete], true);

              appChatsManager.deleteChannel(-this.peerId).then(() => {
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
