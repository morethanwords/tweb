import { SliderTab } from "../../slider";
import popupAvatar from "../../popupAvatar";
import appChatsManager from "../../../lib/appManagers/appChatsManager";
import appSidebarLeft, { AppSidebarLeft } from "..";

export default class AppNewChannelTab implements SliderTab {
  private container = document.querySelector('.new-channel-container') as HTMLDivElement;
  private canvas = this.container.querySelector('.avatar-edit-canvas') as HTMLCanvasElement;
  private channelNameInput = this.container.querySelector('.new-channel-name') as HTMLInputElement;
  private channelDescriptionInput = this.container.querySelector('.new-channel-description') as HTMLInputElement;
  private nextBtn = this.container.querySelector('.btn-corner') as HTMLButtonElement;
  private backBtn = this.container.querySelector('.sidebar-close-button') as HTMLButtonElement;
  private uploadAvatar: () => Promise<any> = null;

  constructor() {
    this.container.querySelector('.avatar-edit').addEventListener('click', () => {
      popupAvatar.open(this.canvas, (_upload) => {
        this.uploadAvatar = _upload;
      });
    });

    this.channelNameInput.addEventListener('input', () => {
      let value = this.channelNameInput.value;
      if(value.length) {
        this.nextBtn.classList.add('is-visible');
      } else {
        this.nextBtn.classList.remove('is-visible');
      }
    });

    this.nextBtn.addEventListener('click', () => {
      let title = this.channelNameInput.value;
      let about = this.channelDescriptionInput.value;

      this.nextBtn.disabled = true;
      appChatsManager.createChannel(title, about).then((channelID) => {
        if(this.uploadAvatar) {
          this.uploadAvatar().then((inputFile: any) => {
            appChatsManager.editPhoto(channelID, inputFile);
          });
        }
        
        appSidebarLeft.removeTabFromHistory(AppSidebarLeft.SLIDERITEMSIDS.newChannel);
        appSidebarLeft.addMembersTab.init(channelID, 'channel', true);
      });
    });
  }

  public onCloseAfterTimeout() {
    let ctx = this.canvas.getContext('2d');
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    this.uploadAvatar = null;
    this.channelNameInput.value = '';
    this.channelDescriptionInput.value = '';
    this.nextBtn.disabled = false;
  }
}