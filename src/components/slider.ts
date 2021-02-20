import { attachClickEvent } from "../helpers/dom";
import { horizontalMenu } from "./horizontalMenu";
import { TransitionSlider } from "./transition";
import appNavigationController, { NavigationItem } from "./appNavigationController";
import SliderSuperTab, { SliderTab } from "./sliderTab";

const TRANSITION_TIME = 250;

export type {SliderTab};
export {SliderSuperTab};

export default class SidebarSlider {
  protected _selectTab: ReturnType<typeof horizontalMenu>;
  public historyTabIds: (number | SliderSuperTab)[] = []; // * key is any, since right sidebar is ugly nowz
  public tabsContainer: HTMLElement;
  public sidebarEl: HTMLElement;
  public tabs: Map<any, SliderTab>; // * key is any, since right sidebar is ugly now
  private canHideFirst = false;
  private navigationType: NavigationItem['type']

  constructor(options: {
    sidebarEl: SidebarSlider['sidebarEl'],
    tabs?: SidebarSlider['tabs'],
    canHideFirst?: SidebarSlider['canHideFirst'],
    navigationType: SidebarSlider['navigationType']
  }) {
    for(const i in options) {
      // @ts-ignore
      this[i] = options[i];
    }

    if(!this.tabs) {
      this.tabs = new Map();
    }

    this.tabsContainer = this.sidebarEl.querySelector('.sidebar-slider');
    this._selectTab = TransitionSlider(this.tabsContainer, 'navigation', TRANSITION_TIME);
    if(!this.canHideFirst) {
      this._selectTab(0);
    }

    Array.from(this.sidebarEl.querySelectorAll('.sidebar-close-button') as any as HTMLElement[]).forEach(el => {
      attachClickEvent(el, this.onCloseBtnClick);
    });
  }

  private onCloseBtnClick = () => {
    appNavigationController.back(this.navigationType);
    // this.closeTab();
  };

  public closeTab = (id?: number | SliderSuperTab, animate?: boolean) => {
    if(id !== undefined && this.historyTabIds[this.historyTabIds.length - 1] !== id) {
      return false;
    }

    //console.log('sidebar-close-button click:', this.historyTabIDs);
    const closingId = this.historyTabIds.pop(); // pop current
    this.onCloseTab(closingId, animate);
    
    const tab = this.historyTabIds[this.historyTabIds.length - 1];
    this._selectTab(tab !== undefined ? (tab instanceof SliderSuperTab ? tab.container : tab) : (this.canHideFirst ? -1 : 0), animate);
    return true;
  };

  public selectTab(id: number | SliderSuperTab): boolean {
    /* if(id instanceof SliderSuperTab) {
      id = id.id;
    } */

    if(this.historyTabIds[this.historyTabIds.length - 1] === id) {
      return false;
    }

    const tab: SliderTab = id instanceof SliderSuperTab ? id : this.tabs.get(id);
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

    //if(!this.canHideFirst || this.historyTabIds.length) {
      appNavigationController.pushItem({
        type: this.navigationType, 
        onPop: (canAnimate) => {
          this.closeTab(undefined, canAnimate);
          return true;
        }
      });
    //}
    
    this.historyTabIds.push(id);
    this._selectTab(id instanceof SliderSuperTab ? id.container : id);
    return true;
  }

  public removeTabFromHistory(id: number | SliderSuperTab) {
    this.historyTabIds.findAndSplice(i => i === id);
    this.onCloseTab(id, undefined);
  }

  public onCloseTab(id: number | SliderSuperTab, animate: boolean) {
    const tab: SliderTab = id instanceof SliderSuperTab ? id : this.tabs.get(id);
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

  public addTab(tab: SliderSuperTab) {
    if(!tab.container.parentElement) {
      this.tabsContainer.append(tab.container);

      if(tab.closeBtn) {
        tab.closeBtn.addEventListener('click', this.onCloseBtnClick);
      }
    }
  }
}
