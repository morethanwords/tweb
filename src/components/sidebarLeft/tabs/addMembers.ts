import { SliderTab } from "../../slider";
import AppSelectPeers from "../../appSelectPeers";
import { putPreloader } from "../../misc";
import appChatsManager from "../../../lib/appManagers/appChatsManager";
import appSidebarLeft, { AppSidebarLeft } from "..";

export default class AppAddMembersTab implements SliderTab {
  private container = document.querySelector('.addmembers-container') as HTMLDivElement;
  private contentDiv = this.container.querySelector('.sidebar-content') as HTMLDivElement;
  private backBtn = this.container.querySelector('.sidebar-close-button') as HTMLButtonElement;
  private nextBtn = this.contentDiv.querySelector('.btn-corner') as HTMLButtonElement;
  private selector: AppSelectPeers;
  private peerType: 'channel' | 'chat';
  private peerId: number; // always positive
  private takeOut: (peerIds: number[]) => void
  private skippable: boolean;

  constructor() {
    this.nextBtn.addEventListener('click', () => {
      if(this.skippable) {
        appSidebarLeft.closeTab(AppSidebarLeft.SLIDERITEMSIDS.addMembers);
        return;
      }

      const peerIds = this.selector.getSelected();
      if(peerIds.length) {
        if(this.takeOut) {
          this.takeOut(peerIds);
          return;
        }

        this.nextBtn.classList.remove('tgico-arrow-next');
        this.nextBtn.disabled = true;
        putPreloader(this.nextBtn);
        this.selector.freezed = true;

        appChatsManager.inviteToChannel(this.peerId, peerIds).then(() => {
          appSidebarLeft.closeTab(AppSidebarLeft.SLIDERITEMSIDS.addMembers);
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
    this.peerId = Math.abs(id);
    this.peerType = type;
    this.takeOut = takeOut;
    this.skippable = skippable;

    this.onCloseAfterTimeout();
    this.selector = new AppSelectPeers(this.contentDiv, skippable ? null : (length) => {
      this.nextBtn.classList.toggle('is-visible', !!length);
    }, ['contacts']);

    this.nextBtn.innerHTML = '';
    this.nextBtn.disabled = false;
    this.nextBtn.classList.add('tgico-arrow-next');
    this.nextBtn.classList.toggle('is-visible', skippable);

    appSidebarLeft.selectTab(AppSidebarLeft.SLIDERITEMSIDS.addMembers);
  }
}