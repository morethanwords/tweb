/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import { SliderSuperTab } from "../../slider"
import InputField from "../../inputField";
import EditPeer from "../../editPeer";
import { SettingSection } from "../../sidebarLeft";
import Row from "../../row";
import CheckboxField from "../../checkboxField";
import Button from "../../button";
import PeerTitle from "../../peerTitle";
import rootScope from "../../../lib/rootScope";
import PopupPeer from "../../popups/peer";
import { addCancelButton } from "../../popups";
import { i18n } from "../../../lib/langPack";
import { attachClickEvent } from "../../../helpers/dom/clickEvent";
import toggleDisability from "../../../helpers/dom/toggleDisability";
import getPeerId from "../../../lib/appManagers/utils/peers/getPeerId";
import formatUserPhone from "../../wrappers/formatUserPhone";

export default class AppEditContactTab extends SliderSuperTab {
  private nameInputField: InputField;
  private lastNameInputField: InputField;
  private editPeer: EditPeer;
  public peerId: PeerId;

  protected async init() {
    this.container.classList.add('edit-peer-container', 'edit-contact-container');
    const isNew = !(await this.managers.appUsersManager.isContact(this.peerId.toUserId()));
    this.setTitle(isNew ? 'AddContactTitle' : 'Edit');

    {
      const section = new SettingSection({noDelimiter: true});
      const inputFields: InputField[] = [];

      const inputWrapper = document.createElement('div');
      inputWrapper.classList.add('input-wrapper');
  
      this.nameInputField = new InputField({
        label: 'FirstName',
        name: 'contact-name',
        maxLength: 70,
        required: true
      });
      this.lastNameInputField = new InputField({
        label: 'LastName',
        name: 'contact-lastname',
        maxLength: 70
      });

      if(this.peerId) {
        const user = await this.managers.appUsersManager.getUser(this.peerId);

        if(isNew) {
          this.nameInputField.setDraftValue(user.first_name);
          this.lastNameInputField.setDraftValue(user.last_name);
        } else {
          this.nameInputField.setOriginalValue(user.first_name);
          this.lastNameInputField.setOriginalValue(user.last_name);
        }
      }
      
      inputWrapper.append(this.nameInputField.container, this.lastNameInputField.container);
      inputFields.push(this.nameInputField, this.lastNameInputField);

      this.editPeer = new EditPeer({
        peerId: this.peerId,
        inputFields,
        listenerSetter: this.listenerSetter,
        doNotEditAvatar: true
      });
      this.content.append(this.editPeer.nextBtn);

      if(this.peerId) {
        const div = document.createElement('div');
        div.classList.add('avatar-edit');
        div.append(this.editPeer.avatarElem);
  
        const notificationsCheckboxField = new CheckboxField({
          text: 'Notifications'
        });
  
        notificationsCheckboxField.input.addEventListener('change', (e) => {
          if(!e.isTrusted) {
            return;
          }
  
          this.managers.appMessagesManager.togglePeerMute(this.peerId);
        });
  
        this.listenerSetter.add(rootScope)('notify_settings', async(update) => {
          if(update.peer._ !== 'notifyPeer') return;
          const peerId = getPeerId(update.peer.peer);
          if(this.peerId === peerId) {
            const enabled = !(await this.managers.appNotificationsManager.isMuted(update.notify_settings));
            if(enabled !== notificationsCheckboxField.checked) {
              notificationsCheckboxField.checked = enabled;
            }
          }
        });
  
        const profileNameDiv = document.createElement('div');
        profileNameDiv.classList.add('profile-name');
        profileNameDiv.append(new PeerTitle({
          peerId: this.peerId
        }).element);
        //profileNameDiv.innerHTML = 'Karen Stanford';
  
        const profileSubtitleDiv = document.createElement('div');
        profileSubtitleDiv.classList.add('profile-subtitle');
        profileSubtitleDiv.append(i18n('EditContact.OriginalName'));

        section.content.append(div, profileNameDiv, profileSubtitleDiv, inputWrapper);

        if(!isNew) {
          const notificationsRow = new Row({
            checkboxField: notificationsCheckboxField,
            listenerSetter: this.listenerSetter
          });
    
          const enabled = !(await this.managers.appNotificationsManager.isPeerLocalMuted(this.peerId, false));
          notificationsCheckboxField.checked = enabled;

          section.content.append(notificationsRow.container);
        } else {
          const user = await this.managers.appUsersManager.getUser(this.peerId);

          const phoneRow = new Row({
            icon: 'phone',
            titleLangKey: user.phone ? undefined : 'MobileHidden',
            title: user.phone ? formatUserPhone(user.phone)  : undefined,
            subtitleLangKey: user.phone ? 'Phone' : 'MobileHiddenExceptionInfo',
            subtitleLangArgs: user.phone ? undefined : [new PeerTitle({peerId: this.peerId}).element]
          });

          section.content.append(phoneRow.container);
        }
      } else {
        section.content.append(inputWrapper);
      }

      this.scrollable.append(section.container);

      attachClickEvent(this.editPeer.nextBtn, async() => {
        this.editPeer.nextBtn.disabled = true;

        this.managers.appUsersManager.addContact(
          this.peerId, 
          this.nameInputField.value, 
          this.lastNameInputField.value, 
          (await this.managers.appUsersManager.getUser(this.peerId)).phone
        ).finally(() => {
          this.editPeer.nextBtn.removeAttribute('disabled');
          this.close();
        });
      }, {listenerSetter: this.listenerSetter});
    }

    if(!isNew) {
      const section = new SettingSection({
        
      });

      const btnDelete = Button('btn-primary btn-transparent danger', {icon: 'delete', text: 'PeerInfo.DeleteContact'});

      attachClickEvent(btnDelete, () => {
        new PopupPeer('popup-delete-contact', {
          peerId: this.peerId,
          titleLangKey: 'DeleteContact',
          descriptionLangKey: 'AreYouSureDeleteContact',
          buttons: addCancelButton([{
            langKey: 'Delete',
            callback: () => {
              const toggle = toggleDisability([btnDelete], true);

              this.managers.appUsersManager.deleteContacts([this.peerId]).then(() => {
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
