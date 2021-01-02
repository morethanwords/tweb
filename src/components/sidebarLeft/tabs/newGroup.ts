import appSidebarLeft, { AppSidebarLeft } from "..";
import { InputFile } from "../../../layer";
import appChatsManager from "../../../lib/appManagers/appChatsManager";
import appDialogsManager from "../../../lib/appManagers/appDialogsManager";
import appUsersManager from "../../../lib/appManagers/appUsersManager";
import { SearchGroup } from "../../appSearch";
import Button from "../../button";
import InputField from "../../inputField";
import PopupAvatar from "../../popups/avatar";
import Scrollable from "../../scrollable";
import { SliderSuperTab } from "../../slider";
import AvatarEdit from "../../avatarEdit";

export default class AppNewGroupTab extends SliderSuperTab {
  private canvas = this.container.querySelector('.avatar-edit-canvas') as HTMLCanvasElement;
  private searchGroup = new SearchGroup(' ', 'contacts', true, 'new-group-members disable-hover', false);
  private avatarEdit: AvatarEdit;
  private uploadAvatar: () => Promise<InputFile> = null;
  private userIds: number[];
  private nextBtn: HTMLButtonElement;
  private groupNameInputField: InputField;
  
  constructor(appSidebarLeft: AppSidebarLeft) {
    super(appSidebarLeft);
  }

  private construct() {
    this.container.classList.add('new-group-container');
    this.title.innerText = 'New Group';

    this.avatarEdit = new AvatarEdit((_upload) => {
      this.uploadAvatar = _upload;
    });

    const inputWrapper = document.createElement('div');
    inputWrapper.classList.add('input-wrapper');

    this.groupNameInputField = new InputField({
      label: 'Group Name',
      maxLength: 128
    });

    inputWrapper.append(this.groupNameInputField.container);

    this.groupNameInputField.input.addEventListener('input', () => {
      const value = this.groupNameInputField.value;
      this.nextBtn.classList.toggle('is-visible', !!value.length && !this.groupNameInputField.input.classList.contains('error'));
    });

    this.nextBtn = Button('btn-corner btn-circle', {icon: 'arrow-next'});

    this.nextBtn.addEventListener('click', () => {
      const title = this.groupNameInputField.value;

      this.nextBtn.disabled = true;
      appChatsManager.createChat(title, this.userIds).then((chatId) => {
        if(this.uploadAvatar) {
          this.uploadAvatar().then((inputFile) => {
            appChatsManager.editPhoto(chatId, inputFile);
          });
        }
        
        appSidebarLeft.removeTabFromHistory(this.id);
        appSidebarLeft.selectTab(0);
      });
    });

    const chatsContainer = document.createElement('div');
    chatsContainer.classList.add('chatlist-container');
    chatsContainer.append(this.searchGroup.container);

    this.content.append(this.nextBtn);
    this.scrollable.append(this.avatarEdit.container, inputWrapper, chatsContainer);
  }

  public onClose() {

  }

  public onCloseAfterTimeout() {
    this.searchGroup.clear();
    this.avatarEdit.clear();
    this.uploadAvatar = null;
    this.groupNameInputField.value = '';
    this.nextBtn.disabled = false;
  }

  public init(userIds: number[]) {
    if(this.construct) {
      this.construct();
      this.construct = null;
    }

    this.userIds = userIds;

    this.open();
    this.userIds.forEach(userId => {
      let {dom} = appDialogsManager.addDialogNew({
        dialog: userId,
        container: this.searchGroup.list,
        drawStatus: false,
        rippleEnabled: false,
        avatarSize: 48
      });

      let subtitle = '';
      subtitle = appUsersManager.getUserStatusString(userId);
      if(subtitle == 'online') {
        subtitle = `<i>${subtitle}</i>`;
      }

      if(subtitle) {
        dom.lastMessageSpan.innerHTML = subtitle;
      }
    });

    this.searchGroup.nameEl.innerText = this.userIds.length + ' members';
    this.searchGroup.setActive();
  }
}