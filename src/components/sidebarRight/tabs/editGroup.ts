import { SliderSuperTab } from "../../slider"
import InputField from "../../inputField";
import EditPeer from "../../editPeer";
import { SettingSection } from "../../sidebarLeft";
import Row from "../../row";
import CheckboxField from "../../checkboxField";
import Button from "../../button";
import appChatsManager, { ChatRights } from "../../../lib/appManagers/appChatsManager";
import appProfileManager from "../../../lib/appManagers/appProfileManager";
import { attachClickEvent, toggleDisability } from "../../../helpers/dom";
import { ChatFull } from "../../../layer";
import PopupPeer from "../../popups/peer";
import { addCancelButton } from "../../popups";
import AppGroupTypeTab from "./groupType";
import rootScope from "../../../lib/rootScope";
import AppGroupPermissionsTab from "./groupPermissions";

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
    this.title.innerHTML = 'Edit';

    const chatFull = await appProfileManager.getChatFull(this.chatId, true);

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
          title: 'Group Type',
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
          groupTypeRow.subtitle.innerHTML = chat.username ? 'Public' : 'Private';
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
          title: 'Permissions',
          clickable: () => {
            const tab = new AppGroupPermissionsTab(this.slider);
            tab.chatId = this.chatId;
            tab.open();
          },
          icon: 'permissions',
        });

        const setPermissionsLength = () => {
          permissionsRow.subtitle.innerHTML = flags.reduce((acc, f) => acc + +appChatsManager.hasRights(this.chatId, f, 0), 0) + '/' + flags.length;
        };

        setPermissionsLength();        
        section.content.append(permissionsRow.container);

        this.listenerSetter.add(rootScope, 'chat_update', (chatId) => {
          if(this.chatId === chatId) {
            setPermissionsLength();
          }
        });
      }

      const administratorsRow = new Row({
        title: 'Administrators',
        subtitle: '' + ((chatFull as ChatFull.channelFull).admins_count || 1),
        icon: 'admin',
        clickable: true
      });

      section.content.append(administratorsRow.container);

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

    {
      const section = new SettingSection({

      });

      const membersRow = new Row({
        title: 'Members',
        subtitle: '2 500',
        icon: 'newgroup',
        clickable: true
      });

      section.content.append(membersRow.container);

      if(appChatsManager.hasRights(this.chatId, 'change_permissions')) {
        const showChatHistoryCheckboxField = new CheckboxField({
          text: 'Show chat history for new members'
        });
  
        if(appChatsManager.isChannel(this.chatId) && !(chatFull as ChatFull.channelFull).pFlags.hidden_prehistory) {
          showChatHistoryCheckboxField.checked = true;
        }
  
        section.content.append(showChatHistoryCheckboxField.label);
      }

      this.scrollable.append(section.container);
    }

    if(appChatsManager.isChannel(this.chatId) && appChatsManager.hasRights(this.chatId, 'delete_chat')) {
      const section = new SettingSection({});

      const btnDelete = Button('btn-primary btn-transparent danger', {icon: 'delete', text: 'Delete Group'});

      attachClickEvent(btnDelete, () => {
        new PopupPeer('popup-delete-group', {
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
        }).show();
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
