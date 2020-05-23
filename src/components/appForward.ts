import appSidebarRight from "../lib/appManagers/appSidebarRight";
import appMessagesManager from "../lib/appManagers/appMessagesManager";
import { putPreloader } from "./misc";
import { AppSelectPeers } from "./appSelectPeers";

class AppForward {
  private container = document.getElementById('forward-container') as HTMLDivElement;
  private closeBtn = this.container.querySelector('.sidebar-close-button') as HTMLButtonElement;
  private sendBtn = this.container.querySelector('.btn-circle') as HTMLButtonElement;

  private selector: AppSelectPeers;
  private msgIDs: number[] = [];

  constructor() {
    this.closeBtn.addEventListener('click', () => {
      this.cleanup();
      this.container.classList.remove('active');
    });

    this.sendBtn.addEventListener('click', () => {
      let peerIDs = this.selector.getSelected();
      
      if(this.msgIDs.length && peerIDs.length) {
        this.sendBtn.classList.remove('tgico-send');
        this.sendBtn.disabled = true;
        putPreloader(this.sendBtn);
        this.selector.freezed = true;

        let s = () => {
          let promises = peerIDs.splice(0, 3).map(peerID => {
            return appMessagesManager.forwardMessages(peerID, this.msgIDs);
          });
          
          Promise.all(promises).then(() => {
            if(peerIDs.length) {
              return s();
            } else {
              this.closeBtn.click();
            }
          });
        };
        
        s();
      }
    });
  }

  public cleanup() {
    if(this.selector) {
      this.selector.container.remove();
      this.selector = null;
    }
  }

  public init(ids: number[]) {
    this.cleanup();
    this.msgIDs = ids;

    this.container.classList.add('active');
    this.sendBtn.innerHTML = '';
    this.sendBtn.classList.add('tgico-send');
    this.sendBtn.disabled = false;

    this.selector = new AppSelectPeers(this.container, (length) => {
      if(length) {
        this.sendBtn.classList.add('is-visible');
      } else {
        this.sendBtn.classList.remove('is-visible');
      }
    }, 'dialogs', () => {
      console.log('forward rendered:', this.container.querySelector('.selector ul').childElementCount);
      appSidebarRight.toggleSidebar(true);
    });
  }
}

export default new AppForward();