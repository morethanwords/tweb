/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import appImManager, {APP_TABS} from '../../lib/appManagers/appImManager';
import SidebarSlider from '../slider';
import mediaSizes, {ScreenSize} from '../../helpers/mediaSizes';
import AppSharedMediaTab from './tabs/sharedMedia';
import {MOUNT_CLASS_TO} from '../../config/debug';
import {AppManagers} from '../../lib/appManagers/managers';

export const RIGHT_COLUMN_ACTIVE_CLASSNAME = 'is-right-column-shown';

export class AppSidebarRight extends SidebarSlider {
  private isColumnProportionSet = false;
  private sharedMediaTab: AppSharedMediaTab;
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

    mediaSizes.addEventListener('resize', () => {
      this.setColumnProportion();
    });
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

  private setColumnProportion() {
    const proportion = this.sidebarEl.scrollWidth / this.sidebarEl.previousElementSibling.scrollWidth;
    document.documentElement.style.setProperty('--right-column-proportion', '' + proportion);
    // this.rect = this.sidebarEl.getBoundingClientRect();
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

    if(!this.isColumnProportionSet) {
      this.setColumnProportion();
      this.isColumnProportionSet = true;
    }

    const animationPromise = appImManager.selectTab(active ? APP_TABS.CHAT : APP_TABS.PROFILE, animate);
    document.body.classList.toggle(RIGHT_COLUMN_ACTIVE_CLASSNAME, enable);
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
