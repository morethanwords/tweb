import { SliderTab } from "../slider";
import { SearchGroup } from "../appSearch";
import popupAvatar from "../popupAvatar";
import appChatsManager from "../../lib/appManagers/appChatsManager";
import appSidebarLeft, { AppSidebarLeft } from "../../lib/appManagers/appSidebarLeft";
import Scrollable from "../scrollable_new";
import appDialogsManager from "../../lib/appManagers/appDialogsManager";
import appUsersManager from "../../lib/appManagers/appUsersManager";

export default class AppNewGroupTab implements SliderTab {
  private container = document.querySelector('.new-group-container') as HTMLDivElement;
  private contentDiv = this.container.querySelector('.sidebar-content') as HTMLDivElement;
  private canvas = this.container.querySelector('.avatar-edit-canvas') as HTMLCanvasElement;
  private groupNameInput = this.container.querySelector('.new-group-name') as HTMLInputElement;
  private nextBtn = this.container.querySelector('.btn-corner') as HTMLButtonElement;
  private searchGroup = new SearchGroup('', 'contacts', true, 'new-group-members disable-hover', false);
  private uploadAvatar: () => Promise<any> = null;
  private userIDs: number[];
  
  constructor() {
    this.container.querySelector('.avatar-edit').addEventListener('click', () => {
      popupAvatar.open(this.canvas, (_upload) => {
        this.uploadAvatar = _upload;
      });
    });

    this.groupNameInput.addEventListener('input', () => {
      let value = this.groupNameInput.value;
      if(value.length) {
        this.nextBtn.classList.add('is-visible');
      } else {
        this.nextBtn.classList.remove('is-visible');
      }
    });

    this.nextBtn.addEventListener('click', () => {
      let title = this.groupNameInput.value;

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

    let chatsContainer = document.createElement('div');
    chatsContainer.classList.add('chats-container');
    chatsContainer.append(this.searchGroup.container);

    let scrollable = new Scrollable(chatsContainer);

    this.contentDiv.append(chatsContainer);
  }

  public onClose() {

  }

  public onCloseAfterTimeout() {
    this.searchGroup.clear();

    let ctx = this.canvas.getContext('2d');
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    this.uploadAvatar = null;
    this.groupNameInput.value = '';
    this.nextBtn.disabled = false;
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