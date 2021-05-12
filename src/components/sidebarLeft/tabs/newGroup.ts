/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import appSidebarLeft from "..";
import { InputFile } from "../../../layer";
import appChatsManager from "../../../lib/appManagers/appChatsManager";
import appDialogsManager from "../../../lib/appManagers/appDialogsManager";
import appUsersManager from "../../../lib/appManagers/appUsersManager";
import { SearchGroup } from "../../appSearch";
import InputField from "../../inputField";
import { SliderSuperTab } from "../../slider";
import AvatarEdit from "../../avatarEdit";
import { i18n } from "../../../lib/langPack";
import ButtonCorner from "../../buttonCorner";

export default class AppNewGroupTab extends SliderSuperTab {
  private searchGroup = new SearchGroup(true, 'contacts', true, 'new-group-members disable-hover', false);
  private avatarEdit: AvatarEdit;
  private uploadAvatar: () => Promise<InputFile> = null;
  private userIds: number[];
  private nextBtn: HTMLButtonElement;
  private groupNameInputField: InputField;

  protected init() {
    this.container.classList.add('new-group-container');
    this.setTitle('NewGroup');

    this.avatarEdit = new AvatarEdit((_upload) => {
      this.uploadAvatar = _upload;
    });

    const inputWrapper = document.createElement('div');
    inputWrapper.classList.add('input-wrapper');

    this.groupNameInputField = new InputField({
      label: 'CreateGroup.NameHolder',
      maxLength: 128
    });

    inputWrapper.append(this.groupNameInputField.container);

    this.groupNameInputField.input.addEventListener('input', () => {
      const value = this.groupNameInputField.value;
      this.nextBtn.classList.toggle('is-visible', !!value.length && !this.groupNameInputField.input.classList.contains('error'));
    });

    this.nextBtn = ButtonCorner({icon: 'arrow_next'});

    this.nextBtn.addEventListener('click', () => {
      const title = this.groupNameInputField.value;

      this.nextBtn.disabled = true;
      appChatsManager.createChat(title, this.userIds).then((chatId) => {
        if(this.uploadAvatar) {
          this.uploadAvatar().then((inputFile) => {
            appChatsManager.editPhoto(chatId, inputFile);
          });
        }
        
        appSidebarLeft.removeTabFromHistory(this);
        appSidebarLeft.selectTab(0);
      });
    });

    const chatsContainer = document.createElement('div');
    chatsContainer.classList.add('chatlist-container');
    chatsContainer.append(this.searchGroup.container);

    this.content.append(this.nextBtn);
    this.scrollable.append(this.avatarEdit.container, inputWrapper, chatsContainer);
  }

  public onCloseAfterTimeout() {
    this.searchGroup.clear();
    this.avatarEdit.clear();
    this.uploadAvatar = null;
    this.groupNameInputField.value = '';
    this.nextBtn.disabled = false;
  }

  public open(userIds: number[]) {
    const result = super.open();
    result.then(() => {
      this.userIds = userIds;

      this.userIds.forEach(userId => {
        let {dom} = appDialogsManager.addDialogNew({
          dialog: userId,
          container: this.searchGroup.list,
          drawStatus: false,
          rippleEnabled: false,
          avatarSize: 48
        });

        dom.lastMessageSpan.append(appUsersManager.getUserStatusString(userId));
      });

      this.searchGroup.nameEl.textContent = '';
      this.searchGroup.nameEl.append(i18n('Members', [this.userIds.length]));
      this.searchGroup.setActive();
    });
    
    return result;
  }
}