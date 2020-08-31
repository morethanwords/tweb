import { SliderTab } from "../slider";
import { AppSelectPeers } from "../appSelectPeers";
import { putPreloader } from "../misc";
import appChatsManager from "../../lib/appManagers/appChatsManager";
import appSidebarLeft, { AppSidebarLeft } from "../../lib/appManagers/appSidebarLeft";

export default class AppAddMembersTab implements SliderTab {
  private container = document.querySelector('.addmembers-container') as HTMLDivElement;
  private contentDiv = this.container.querySelector('.sidebar-content') as HTMLDivElement;
  private backBtn = this.container.querySelector('.sidebar-close-button') as HTMLButtonElement;
  private nextBtn = this.contentDiv.querySelector('.btn-corner') as HTMLButtonElement;
  private selector: AppSelectPeers;
  private peerType: 'channel' | 'chat';
  private peerID: number; // always positive
  private takeOut: (peerIDs: number[]) => void
  private skippable: boolean;

  constructor() {
    this.nextBtn.addEventListener('click', () => {
      if(this.skippable) {
        this.backBtn.click();
        return;
      }

      const peerIDs = this.selector.getSelected();
      if(peerIDs.length) {
        if(this.takeOut) {
          this.takeOut(peerIDs);
          return;
        }

        this.nextBtn.classList.remove('tgico-next');
        this.nextBtn.disabled = true;
        putPreloader(this.nextBtn);
        this.selector.freezed = true;

        appChatsManager.inviteToChannel(this.peerID, peerIDs).then(() => {
          this.backBtn.click();
        });
      }
    });
  }

  public onCloseAfterTimeout() {
    if(this.selector) {
      this.selector.container.remove();
      this.selector = null;
    }
  }

  public init(id: number, type: 'channel' | 'chat', skippable: boolean, takeOut?: AppAddMembersTab['takeOut']) {
    this.peerID = Math.abs(id);
    this.peerType = type;
    this.takeOut = takeOut;
    this.skippable = skippable;

    this.onCloseAfterTimeout();
    this.selector = new AppSelectPeers(this.contentDiv, skippable ? null : (length) => {
      this.nextBtn.classList.toggle('is-visible', !!length);
    }, ['contacts']);

    this.nextBtn.innerHTML = '';
    this.nextBtn.disabled = false;
    this.nextBtn.classList.add('tgico-next');
    this.nextBtn.classList.toggle('is-visible', skippable);

    appSidebarLeft.selectTab(AppSidebarLeft.SLIDERITEMSIDS.addMembers);
  }
}