/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import appImManager, {APP_TABS} from '@lib/appImManager';
import SidebarSlider from '@components/slider';
import mediaSizes, {ScreenSize} from '@helpers/mediaSizes';
import AppSharedMediaTab from '@components/sidebarRight/tabs/sharedMedia';
import {MOUNT_CLASS_TO} from '@config/debug';
import {AppManagers} from '@lib/managers';
import appNavigationController from '@components/appNavigationController';
import rootScope from '@lib/rootScope';
import {installColumnWidthsUpdater} from '@helpers/updateColumnWidths';
import installColumnResize from '@helpers/installColumnResize';


export const RIGHT_COLUMN_ACTIVE_CLASSNAME = 'is-right-column-shown';

export class AppSidebarRight extends SidebarSlider {
  public sharedMediaTab: AppSharedMediaTab;
  // public rect: DOMRect;

  constructor() {
    super({
      sidebarEl: document.getElementById('column-right') as HTMLElement,
      canHideFirst: true,
      navigationType: 'right'
    });
  }

  construct(managers: AppManagers) {
    this.managers = managers;

    mediaSizes.addEventListener('changeScreen', (from, to) => {
      if(to === ScreenSize.medium && from !== ScreenSize.mobile) {
        this.toggleSidebar(false);
      }
    });

    installColumnWidthsUpdater();
    installColumnResize({columnEl: this.sidebarEl, side: 'right'});
  }

  public createSharedMediaTab() {
    const tab = this.createTab(AppSharedMediaTab, false, true);
    tab.slider = this;
    // this.tabsContainer.prepend(tab.container);
    return tab;
  }

  public replaceSharedMediaTab(tab?: AppSharedMediaTab) {
    const previousTab = this.sharedMediaTab;
    if(previousTab) {
      const idx = this.historyTabIds.indexOf(previousTab);

      if(this._selectTab.getFrom() === previousTab.container) {
        this._selectTab.setFrom(tab?.container);
      }

      if(tab) {
        if(idx !== -1) {
          this.historyTabIds[idx] = tab;
        }

        const wasActive = previousTab.container.classList.contains('active');
        if(wasActive) {
          tab.container.classList.add('active');
        }

        previousTab.container.replaceWith(tab.container);
      } else {
        if(idx !== -1) {
          this.historyTabIds.splice(idx, 1);
        }

        previousTab.container.remove();
      }
    } else {
      this.tabsContainer.prepend(tab.container);
    }

    this.sharedMediaTab = tab;
  }

  public onCloseTab(id: number, animate: boolean, isNavigation?: boolean) {
    if(!this.historyTabIds.length) {
      this.toggleSidebar(false, animate);
    }

    super.onCloseTab(id, animate, isNavigation);
  }

  public hide() {
    document.body.classList.remove(RIGHT_COLUMN_ACTIVE_CLASSNAME);
    appNavigationController.removeByType('right');
    rootScope.dispatchEventSingle('right_sidebar_toggle', false);
  }

  public toggleSidebar(enable?: boolean, animate?: boolean) {
    const active = document.body.classList.contains(RIGHT_COLUMN_ACTIVE_CLASSNAME);
    let willChange: boolean;
    if(enable !== undefined) {
      if(enable) {
        if(!active) {
          willChange = true;
        }
      } else if(active) {
        willChange = true;
      }
    } else {
      willChange = true;
    }

    if(!willChange) return Promise.resolve();

    if(!active && !this.historyTabIds.length) {
      this.sharedMediaTab.open();
    }

    const animationPromise = appImManager.selectTab(active ? APP_TABS.CHAT : APP_TABS.PROFILE, animate);
    if(!enable) this.hide();
    else {
      document.body.classList.add(RIGHT_COLUMN_ACTIVE_CLASSNAME);
      if(!appNavigationController.findItemByType('right')) {
        this.pushNavigationItem(this.sharedMediaTab);
      }
      rootScope.dispatchEventSingle('right_sidebar_toggle', true);
    }
    return animationPromise;

    /* return new Promise((resolve, reject) => {
      const hidden: {element: HTMLDivElement, height: number}[] = [];
      const observer = new IntersectionObserver((entries) => {
        for(const entry of entries) {
          const bubble = entry.target as HTMLDivElement;
          if(!entry.isIntersecting) {
            hidden.push({element: bubble, height: bubble.scrollHeight});
          }
        }

        for(const item of hidden) {
          item.element.style.minHeight = item.height + 'px';
          (item.element.firstElementChild as HTMLElement).style.display = 'none';
          item.element.style.width = '1px';
        }

        //console.log('hidden', hidden);
        observer.disconnect();

        set();

        setTimeout(() => {
          for(const item of hidden) {
            item.element.style.minHeight = '';
            item.element.style.width = '';
            (item.element.firstElementChild as HTMLElement).style.display = '';
          }

          resolve();
        }, 200);
      });

      const length = Object.keys(appImManager.bubbles).length;
      if(length) {
        for(const i in appImManager.bubbles) {
          observer.observe(appImManager.bubbles[i]);
        }
      } else {
        set();
        setTimeout(resolve, 200);
      }
    }); */
  }
}

const appSidebarRight = new AppSidebarRight();
MOUNT_CLASS_TO.appSidebarRight = appSidebarRight;
export default appSidebarRight;
