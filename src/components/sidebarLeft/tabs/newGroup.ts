import appSidebarLeft, { AppSidebarLeft } from "..";
import appChatsManager from "../../../lib/appManagers/appChatsManager";
import appDialogsManager from "../../../lib/appManagers/appDialogsManager";
import appUsersManager from "../../../lib/appManagers/appUsersManager";
import { SearchGroup } from "../../appSearch";
import PopupAvatar from "../../popupAvatar";
import Scrollable from "../../scrollable";
import { SliderTab } from "../../slider";

export default class AppNewGroupTab implements SliderTab {
  private container = document.querySelector('.new-group-container') as HTMLDivElement;
  private contentDiv = this.container.querySelector('.sidebar-content') as HTMLDivElement;
  private canvas = this.container.querySelector('.avatar-edit-canvas') as HTMLCanvasElement;
  private groupNameInput = this.container.querySelector('.new-group-name') as HTMLInputElement;
  private nextBtn = this.container.querySelector('.btn-corner') as HTMLButtonElement;
  private searchGroup = new SearchGroup(' ', 'contacts', true, 'new-group-members disable-hover', false);
  private uploadAvatar: () => Promise<any> = null;
  private userIDs: number[];
  
  constructor() {
    this.container.querySelector('.avatar-edit').addEventListener('click', () => {
      new PopupAvatar().open(this.canvas, (_upload) => {
        this.uploadAvatar = _upload;
      });
    });

    this.groupNameInput.addEventListener('input', () => {
      const value = this.groupNameInput.value;
      this.nextBtn.classList.toggle('is-visible', !!value.length);
    });

    this.nextBtn.addEventListener('click', () => {
      const title = this.groupNameInput.value;

      this.nextBtn.disabled = true;
      appChatsManager.createChat(title, this.userIDs).then((chatID) => {
        if(this.uploadAvatar) {
          this.uploadAvatar().then((inputFile: any) => {
            appChatsManager.editPhoto(chatID, inputFile);
          });
        }
        
        appSidebarLeft.selectTab(0);
      });
    });

    const chatsContainer = document.createElement('div');
    chatsContainer.classList.add('chats-container');
    chatsContainer.append(this.searchGroup.container);

    const scrollable = new Scrollable(chatsContainer);

    this.contentDiv.append(chatsContainer);
  }

  public onClose() {

  }

  public onCloseAfterTimeout() {
    this.searchGroup.clear();

    const ctx = this.canvas.getContext('2d');
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    this.uploadAvatar = null;
    this.groupNameInput.value = '';
    this.nextBtn.disabled = false;
    this.searchGroup.clear();
  }

  public init(userIDs: number[]) {
    this.userIDs = userIDs;

    appSidebarLeft.selectTab(AppSidebarLeft.SLIDERITEMSIDS.newGroup);
    this.userIDs.forEach(userID => {
      let {dom} = appDialogsManager.addDialog(userID, this.searchGroup.list, false, false);

      let subtitle = '';
      subtitle = appUsersManager.getUserStatusString(userID);
      if(subtitle == 'online') {
        subtitle = `<i>${subtitle}</i>`;
      }

      if(subtitle) {
        dom.lastMessageSpan.innerHTML = subtitle;
      }
    });

    this.searchGroup.nameEl.innerText = this.userIDs.length + ' members';
    this.searchGroup.setActive();
  }
}