/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import {horizontalMenu} from './horizontalMenu';
import TransitionSlider from './transition';
import appNavigationController, {NavigationItem} from './appNavigationController';
import SliderSuperTab, {SliderSuperTabConstructable} from './sliderTab';
import indexOfAndSplice from '../helpers/array/indexOfAndSplice';
import safeAssign from '../helpers/object/safeAssign';
import {AppManagers} from '../lib/appManagers/managers';
import {getMiddleware, MiddlewareHelper} from '../helpers/middleware';
import {MaybePromise} from '../types';

const TRANSITION_TIME = 250;

export {SliderSuperTab};

export type SidebarSliderOptions = {
  sidebarEl: SidebarSlider['sidebarEl'],
  tabs?: SidebarSlider['tabs'],
  canHideFirst?: SidebarSlider['canHideFirst'],
  navigationType: SidebarSlider['navigationType']
}

export default class SidebarSlider {
  protected _selectTab: ReturnType<typeof horizontalMenu>;
  protected historyTabIds: (number | SliderSuperTab)[] = []; // * key is any, since right sidebar is ugly nowz
  protected tabsContainer: HTMLElement;
  public sidebarEl: HTMLElement;
  protected tabs: Map<any, SliderSuperTab>; // * key is any, since right sidebar is ugly now
  private canHideFirst = false;
  private navigationType: NavigationItem['type'];
  protected managers: AppManagers;
  protected middlewareHelper: MiddlewareHelper;
  public onOpenTab: () => MaybePromise<void>;
  public onTabsCountChange?: () => void;

  constructor(options: SidebarSliderOptions) {
    safeAssign(this, options);

    this.tabs ??= new Map();

    this.tabsContainer = this.sidebarEl.querySelector('.sidebar-slider');
    this._selectTab = TransitionSlider({
      content: this.tabsContainer,
      type: 'navigation',
      transitionTime: TRANSITION_TIME
    });
    if(!this.canHideFirst) {
      this._selectTab(0);
    }

    this.middlewareHelper = getMiddleware();

    // Array.from(this.sidebarEl.querySelectorAll('.sidebar-close-button') as any as HTMLElement[]).forEach((el) => {
    //   attachClickEvent(el, this.onCloseBtnClick);
    // });
  }

  public getMiddleware() {
    return this.middlewareHelper.get();
  }

  public onCloseBtnClick = () => {
    const item = appNavigationController.findItemByType(this.navigationType);
    if(item) {
      appNavigationController.back(this.navigationType);
      this.onTabsCountChange?.();
    } else if(this.historyTabIds.length) {
      this.closeTab(this.historyTabIds[this.historyTabIds.length - 1]);
    }
    // this.closeTab();
  };

  public closeTab = (id?: number | SliderSuperTab, animate?: boolean, isNavigation?: boolean) => {
    if(id !== undefined && this.historyTabIds[this.historyTabIds.length - 1] !== id) {
      this.removeTabFromHistory(id);
      return false;
    }

    // console.log('sidebar-close-button click:', this.historyTabIDs);
    const closingId = this.historyTabIds.pop(); // pop current
    this.onCloseTab(closingId, animate, isNavigation);

    const tab = this.historyTabIds[this.historyTabIds.length - 1];
    this._selectTab(tab !== undefined ? (tab instanceof SliderSuperTab ? tab.container : tab) : (this.canHideFirst ? -1 : 0), animate);
    return true;
  };

  protected pushNavigationItem(tab: SliderSuperTab) {
    const navigationItem: NavigationItem = {
      type: this.navigationType,
      onPop: (canAnimate) => {
        if(tab.isConfirmationNeededOnClose) {
          const result = tab.isConfirmationNeededOnClose();
          if(result) {
            Promise.resolve(result).then(() => {
              appNavigationController.removeItem(navigationItem);
              this.onTabsCountChange?.();

              this.closeTab(undefined, undefined, true);
            }, () => {});

            return false;
          }
        }

        this.closeTab(undefined, canAnimate, true);
        this.onTabsCountChange?.();
        return true;
      }
    };

    // if(!this.canHideFirst || this.historyTabIds.length) {
    appNavigationController.pushItem(navigationItem);
    this.onTabsCountChange?.();
    // }
  }

  public async selectTab(id: number | SliderSuperTab) {
    /* if(id instanceof SliderSuperTab) {
      id = id.id;
    } */

    if(this.historyTabIds[this.historyTabIds.length - 1] === id) {
      return false;
    }

    const tab: SliderSuperTab = id instanceof SliderSuperTab ? id : this.tabs.get(id);
    this.onOpenTab && await this.onOpenTab();

    if(tab) {
      // @ts-ignore
      tab.onOpen?.();

      // @ts-ignore
      if(tab.onOpenAfterTimeout) {
        setTimeout(() => {
          // @ts-ignore
          tab.onOpenAfterTimeout();
        }, TRANSITION_TIME);
      }
    }

    this.pushNavigationItem(tab);

    this.historyTabIds.push(id);
    this._selectTab(id instanceof SliderSuperTab ? id.container : id);
    return true;
  }

  public removeTabFromHistory(id: number | SliderSuperTab) {
    indexOfAndSplice(this.historyTabIds, id);
    this.onCloseTab(id, undefined);
  }

  public closeAllTabs() {
    const hasTabs = this.hasTabsInNavigation();
    for(let i = this.historyTabIds.length - 1; i >= 0; --i) {
      const tabId = this.historyTabIds[i];
      const tab = tabId instanceof SliderSuperTab ? tabId : this.tabs.get(tabId);
      tab.close();
    }
    return hasTabs;
  }

  public sliceTabsUntilTab(tabConstructor: SliderSuperTabConstructable, preserveTab: SliderSuperTab) {
    for(let i = this.historyTabIds.length - 1; i >= 0; --i) {
      const tab = this.historyTabIds[i];
      if(tab === preserveTab) continue;
      else if(tab instanceof tabConstructor) {
        break;
      }

      this.removeTabFromHistory(tab);
      // appNavigationController.removeByType(this.navigationType, true);
    }
  }

  public getTab<T extends SliderSuperTab>(tabConstructor: SliderSuperTabConstructable<T>) {
    return this.historyTabIds.find((t) => t instanceof tabConstructor) as T;
  }

  public getHistory() {
    return this.historyTabIds;
  }

  public isTabExists(tabConstructor: SliderSuperTabConstructable) {
    return !!this.getTab(tabConstructor);
  }

  protected onCloseTab(id: number | SliderSuperTab, animate: boolean, isNavigation?: boolean) {
    if(!isNavigation) {
      appNavigationController.removeByType(this.navigationType, true);
      this.onTabsCountChange?.();
    }

    const tab: SliderSuperTab = id instanceof SliderSuperTab ? id : this.tabs.get(id);
    if(tab) {
      try {
        // @ts-ignore
        tab.onClose?.();
      } catch(err) {
        console.error('tab onClose error', tab);
      }

      // @ts-ignore
      if(tab.onCloseAfterTimeout) {
        setTimeout(() => {
          // @ts-ignore
          tab.onCloseAfterTimeout();
        }, TRANSITION_TIME + 30);
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

  public deleteTab(tab: SliderSuperTab) {
    this.tabs.delete(tab);
  }

  public createTab<T extends SliderSuperTab>(
    ctor: SliderSuperTabConstructable<T>,
    destroyable = true,
    doNotAppend?: boolean
  ) {
    const tab = new ctor(doNotAppend ? undefined : this, destroyable);
    tab.managers = this.managers;
    return tab;
  }

  public hasTabsInNavigation() {
    return !!appNavigationController.findItemByType(this.navigationType);
  }
}
