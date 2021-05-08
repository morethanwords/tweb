/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import { horizontalMenu } from "./horizontalMenu";
import { TransitionSlider } from "./transition";
import appNavigationController, { NavigationItem } from "./appNavigationController";
import SliderSuperTab, { SliderSuperTabConstructable, SliderTab } from "./sliderTab";
import { safeAssign } from "../helpers/object";
import { attachClickEvent } from "../helpers/dom/clickEvent";

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
    safeAssign(this, options);

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

  public onCloseBtnClick = () => {
    const item = appNavigationController.findItemByType(this.navigationType);
    if(item) {
      appNavigationController.back(this.navigationType);
    } else if(this.historyTabIds.length) {
      this.closeTab(this.historyTabIds[this.historyTabIds.length - 1]);
    }
    // this.closeTab();
  };

  public closeTab = (id?: number | SliderSuperTab, animate?: boolean, isNavigation?: boolean) => {
    if(id !== undefined && this.historyTabIds[this.historyTabIds.length - 1] !== id) {
      return false;
    }

    //console.log('sidebar-close-button click:', this.historyTabIDs);
    const closingId = this.historyTabIds.pop(); // pop current
    this.onCloseTab(closingId, animate, isNavigation);

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
          this.closeTab(undefined, canAnimate, true);
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

  public sliceTabsUntilTab(tabConstructor: SliderSuperTabConstructable, preserveTab: SliderSuperTab) {
    for(let i = this.historyTabIds.length - 1; i >= 0; --i) {
      const tab = this.historyTabIds[i];
      if(tab === preserveTab) continue;
      else if(tab instanceof tabConstructor) {
        break;
      }

      this.removeTabFromHistory(tab);
      //appNavigationController.removeByType(this.navigationType, true);
    }
  }

  public getTab(tabConstructor: SliderSuperTabConstructable) {
    return this.historyTabIds.find(t => t instanceof tabConstructor) as SliderSuperTab;
  }

  public isTabExists(tabConstructor: SliderSuperTabConstructable) {
    return !!this.getTab(tabConstructor);
  }

  protected onCloseTab(id: number | SliderSuperTab, animate: boolean, isNavigation?: boolean) {
    if(!isNavigation) {
      appNavigationController.removeByType(this.navigationType, true);
    }

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
