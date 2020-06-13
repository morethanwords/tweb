import { horizontalMenu } from "./misc";

export interface SliderTab {
  onClose?: () => void,
  onCloseAfterTimeout?: () => void
}

export default class SidebarSlider {
  protected _selectTab: (id: number) => void;
  public historyTabIDs: number[] = [];

  constructor(public sidebarEl: HTMLElement, public tabs: {[id: number]: SliderTab}) {
    this._selectTab = horizontalMenu(null, this.sidebarEl.querySelector('.sidebar-slider') as HTMLDivElement, null, null, 420);
    this._selectTab(0);

    let onCloseBtnClick = () => {
      console.log('sidebar-close-button click:', this.historyTabIDs);
      let closingID = this.historyTabIDs.pop(); // pop current
      this.onCloseTab(closingID);
      this._selectTab(this.historyTabIDs[this.historyTabIDs.length - 1] || 0);
    };
    Array.from(this.sidebarEl.querySelectorAll('.sidebar-close-button') as any as HTMLElement[]).forEach(el => {
      el.addEventListener('click', onCloseBtnClick);
    });
  }

  public selectTab(id: number) {
    this.historyTabIDs.push(id);
    this._selectTab(id);
  }

  public removeTabFromHistory(id: number) {
    this.historyTabIDs.findAndSplice(i => i == id);
    this.onCloseTab(id);
  }

  public onCloseTab(id: number) {
    let tab = this.tabs[id];
    if(tab) {
      if('onClose' in tab) {
        tab.onClose();
      }

      if('onCloseAfterTimeout' in tab) {
        setTimeout(() => {
          tab.onCloseAfterTimeout();
        }, 420);
      }
    }
  }
}