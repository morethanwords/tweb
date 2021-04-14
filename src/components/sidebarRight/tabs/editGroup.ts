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
import Button from "../../button";
import appChatsManager, { ChatRights } from "../../../lib/appManagers/appChatsManager";
import appProfileManager from "../../../lib/appManagers/appProfileManager";
import { attachClickEvent, toggleDisability } from "../../../helpers/dom";
import { ChatFull } from "../../../layer";
import AppGroupTypeTab from "./groupType";
import rootScope from "../../../lib/rootScope";
import AppGroupPermissionsTab from "./groupPermissions";
import { i18n } from "../../../lib/langPack";
import PopupDeleteDialog from "../../popups/deleteDialog";

export default class AppEditGroupTab extends SliderSuperTab {
  private groupNameInputField: InputField;
  private descriptionInputField: InputField;
  private editPeer: EditPeer;
  public chatId: number;

  protected async _init() {
    // * cleanup prev
    this.listenerSetter.removeAll();
    this.scrollable.container.innerHTML = '';

    this.container.classList.add('edit-peer-container', 'edit-group-container');
    this.setTitle('Edit');

    const chatFull = await appProfileManager.getChatFull(this.chatId, true);

    {
      const section = new SettingSection({noDelimiter: true});
      const inputFields: InputField[] = [];

      const inputWrapper = document.createElement('div');
      inputWrapper.classList.add('input-wrapper');
  
      this.groupNameInputField = new InputField({
        label: 'CreateGroup.NameHolder',
        name: 'group-name',
        maxLength: 255
      });
      this.descriptionInputField = new InputField({
        label: 'DescriptionPlaceholder',
        name: 'group-description',
        maxLength: 255
      });

      const chat = appChatsManager.getChat(this.chatId);
      
      this.groupNameInputField.setOriginalValue(chat.title);

      this.descriptionInputField.setOriginalValue(chatFull.about);

      inputWrapper.append(this.groupNameInputField.container, this.descriptionInputField.container);
      
      inputFields.push(this.groupNameInputField, this.descriptionInputField);

      this.editPeer = new EditPeer({
        peerId: -this.chatId,
        inputFields,
        listenerSetter: this.listenerSetter
      });
      this.content.append(this.editPeer.nextBtn);

      section.content.append(this.editPeer.avatarEdit.container, inputWrapper);

      if(appChatsManager.hasRights(this.chatId, 'change_type')) {
        const groupTypeRow = new Row({
          titleLangKey: 'GroupType',
          clickable: () => {
            const tab = new AppGroupTypeTab(this.slider);
            tab.peerId = -this.chatId;
            tab.chatFull = chatFull;
            tab.open();

            this.listenerSetter.add(tab.eventListener, 'destroy', setGroupTypeSubtitle);
          },
          icon: 'lock'
        });

        const setGroupTypeSubtitle = () => {
          groupTypeRow.subtitle.textContent = '';
          groupTypeRow.subtitle.append(i18n(chat.username ? 'TypePublicGroup' : 'TypePrivateGroup'));
        };

        setGroupTypeSubtitle();
        section.content.append(groupTypeRow.container);
      }

      if(appChatsManager.hasRights(this.chatId, 'change_permissions')) {
        const flags = [
          'send_messages',
          'send_media',
          'send_stickers',
          'send_polls',
          'embed_links',
          'invite_users',
          'pin_messages',
          'change_info'
        ] as ChatRights[];

        const permissionsRow = new Row({
          titleLangKey: 'ChannelPermissions',
          clickable: () => {
            const tab = new AppGroupPermissionsTab(this.slider);
            tab.chatId = this.chatId;
            tab.open();
          },
          icon: 'permissions',
        });

        const setPermissionsLength = () => {
          permissionsRow.subtitle.innerHTML = flags.reduce((acc, f) => acc + +appChatsManager.hasRights(this.chatId, f, chat.default_banned_rights), 0) + '/' + flags.length;
        };

        setPermissionsLength();        
        section.content.append(permissionsRow.container);

        this.listenerSetter.add(rootScope, 'chat_update', (chatId) => {
          if(this.chatId === chatId) {
            setPermissionsLength();
          }
        });
      }

      /* const administratorsRow = new Row({
        titleLangKey: 'PeerInfo.Administrators',
        subtitle: '' + ((chatFull as ChatFull.channelFull).admins_count || 1),
        icon: 'admin',
        clickable: true
      });

      section.content.append(administratorsRow.container); */

      this.scrollable.append(section.container);

      attachClickEvent(this.editPeer.nextBtn, () => {
        this.editPeer.nextBtn.disabled = true;
  
        let promises: Promise<any>[] = [];

        const id = this.chatId;
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

    /* {
      const section = new SettingSection({

      });

      const membersRow = new Row({
        titleLangKey: 'GroupMembers',
        subtitle: '2 500',
        icon: 'newgroup',
        clickable: true
      });

      section.content.append(membersRow.container);

      if(appChatsManager.hasRights(this.chatId, 'change_permissions')) {
        const showChatHistoryCheckboxField = new CheckboxField({
          text: 'Show chat history for new members',
          withRipple: true
        });
  
        if(appChatsManager.isChannel(this.chatId) && !(chatFull as ChatFull.channelFull).pFlags.hidden_prehistory) {
          showChatHistoryCheckboxField.checked = true;
        }
  
        section.content.append(showChatHistoryCheckboxField.label);
      }

      this.scrollable.append(section.container);
    } */

    if(appChatsManager.hasRights(this.chatId, 'delete_chat')) {
      const section = new SettingSection({});

      const btnDelete = Button('btn-primary btn-transparent danger', {icon: 'delete', text: 'DeleteMega'});

      attachClickEvent(btnDelete, () => {
        new PopupDeleteDialog(-this.chatId, undefined, (promise) => {
          const toggle = toggleDisability([btnDelete], true);
          promise.then(() => {
            this.close();
          }, () => {
            toggle();
          });
        });
      }, {listenerSetter: this.listenerSetter});

      section.content.append(btnDelete);

      this.scrollable.append(section.container);
    }

    // ! this one will fire earlier than tab's closeAfterTimeout (destroy) event and listeners will be erased, so destroy won't fire
    this.listenerSetter.add(rootScope, 'dialog_migrate', ({migrateFrom, migrateTo}) => {
      if(-this.chatId === migrateFrom) {
        this.chatId = -migrateTo;
        this._init();
      }
    });
  }

  protected init() {
    return this._init();
  }
}
