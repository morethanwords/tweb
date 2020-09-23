import { horizontalMenu } from "./horizontalMenu";

export interface SliderTab {
  onOpen?: () => void,
  onOpenAfterTimeout?: () => void,
  onClose?: () => void,
  onCloseAfterTimeout?: () => void
}

const TRANSITION_TIME = 250;

export default class SidebarSlider {
  protected _selectTab: (id: number) => void;
  public historyTabIDs: number[] = [];

  constructor(public sidebarEl: HTMLElement, public tabs: {[id: number]: SliderTab}, canHideFirst = false) {
    this._selectTab = horizontalMenu(null, this.sidebarEl.querySelector('.sidebar-slider') as HTMLDivElement, null, null, TRANSITION_TIME);
    if(!canHideFirst) {
      this._selectTab(0);
    }

    let onCloseBtnClick = () => {
      //console.log('sidebar-close-button click:', this.historyTabIDs);
      let closingID = this.historyTabIDs.pop(); // pop current
      this.onCloseTab(closingID);
      this._selectTab(this.historyTabIDs[this.historyTabIDs.length - 1] ?? (canHideFirst ? -1 : 0));
    };
    Array.from(this.sidebarEl.querySelectorAll('.sidebar-close-button') as any as HTMLElement[]).forEach(el => {
      el.addEventListener('click', onCloseBtnClick);
    });
  }

  public selectTab(id: number) {
    if(this.historyTabIDs[this.historyTabIDs.length - 1] == id) {
      return false;
    }

    const tab = this.tabs[id];
    if(tab) {
      if(tab.onOpen) {
        tab.onOpen();
      }
  
      if(tab.onOpenAfterTimeout) {
        setTimeout(() => {
          tab.onOpenAfterTimeout();
        }, TRANSITION_TIME);
      }
    }
    
    this.historyTabIDs.push(id);
    this._selectTab(id);
    return true;
  }

  public removeTabFromHistory(id: number) {
    this.historyTabIDs.findAndSplice(i => i == id);
    this.onCloseTab(id);
  }

  public onCloseTab(id: number) {
    let tab = this.tabs[id];
    if(tab) {
      if(tab.onClose) {
        tab.onClose();
      }

      if(tab.onCloseAfterTimeout) {
        setTimeout(() => {
          tab.onCloseAfterTimeout();
        }, TRANSITION_TIME);
      }
    }
  }
}