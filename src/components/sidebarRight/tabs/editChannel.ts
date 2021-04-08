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
import appChatsManager from "../../../lib/appManagers/appChatsManager";
import appProfileManager from "../../../lib/appManagers/appProfileManager";
import { attachClickEvent, toggleDisability } from "../../../helpers/dom";
import PopupPeer from "../../popups/peer";
import { addCancelButton } from "../../popups";
import { i18n } from "../../../lib/langPack";
import { numberThousandSplitter } from "../../../helpers/number";

export default class AppEditChannelTab extends SliderSuperTab {
  private nameInputField: InputField;
  private descriptionInputField: InputField;
  private editPeer: EditPeer;
  public peerId: number;

  protected async init() {
    this.container.classList.add('edit-peer-container', 'edit-channel-container');
    this.setTitle('Edit');

    const chatFull = await appProfileManager.getChannelFull(-this.peerId, true);

    {
      const section = new SettingSection({noDelimiter: true});

      if(appChatsManager.hasRights(-this.peerId, 'change_info')) {
        const inputFields: InputField[] = [];

        const inputWrapper = document.createElement('div');
        inputWrapper.classList.add('input-wrapper');
    
        this.nameInputField = new InputField({
          label: 'Channel.ChannelNameHolder',
          name: 'channel-name',
          maxLength: 255
        });
        this.descriptionInputField = new InputField({
          label: 'DescriptionPlaceholder',
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
          titleLangKey: 'ChannelType',
          subtitleLangKey: 'TypePrivate',
          clickable: true,
          icon: 'lock'
        });
  
        section.content.append(channelTypeRow.container);
      }

      if(appChatsManager.hasRights(-this.peerId, 'change_info')) {
        const discussionRow = new Row({
          titleLangKey: 'PeerInfo.Discussion',
          subtitleLangKey: 'PeerInfo.Discussion.Add',
          clickable: true,
          icon: 'message'
        });

        section.content.append(discussionRow.container);
      }

      const administratorsRow = new Row({
        titleLangKey: 'PeerInfo.Administrators',
        subtitle: '' + chatFull.admins_count,
        icon: 'admin',
        clickable: true
      });

      section.content.append(administratorsRow.container);

      if(appChatsManager.hasRights(-this.peerId, 'change_info')) {
        const signMessagesCheckboxField = new CheckboxField({
          text: 'PeerInfo.SignMessages',
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
        titleLangKey: 'PeerInfo.Subscribers',
        icon: 'newgroup',
        clickable: true
      });

      subscribersRow.subtitle.append(i18n('Subscribers', [numberThousandSplitter(335356)]));

      section.content.append(subscribersRow.container);

      this.scrollable.append(section.container);
    }

    if(appChatsManager.hasRights(-this.peerId, 'delete_chat')) {
      const section = new SettingSection({
        
      });

      const btnDelete = Button('btn-primary btn-transparent danger', {icon: 'delete', text: 'PeerInfo.DeleteChannel'});

      attachClickEvent(btnDelete, () => {
        new PopupPeer('popup-delete-channel', {
          peerId: this.peerId,
          titleLangKey: 'ChannelDeleteMenu',
          descriptionLangKey: 'AreYouSureDeleteAndExitChannel',
          buttons: addCancelButton([{
            langKey: 'ChannelDeleteMenu',
            callback: () => {
              const toggle = toggleDisability([btnDelete], true);

            },
            isDanger: true
          }, {
            langKey: 'DeleteChannelForAll',
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
