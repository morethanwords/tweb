import appImManager from "../../lib/appManagers/appImManager";
import SidebarSlider from "../slider";
import AppStickersTab from "./tabs/stickers";
import AppPollResultsTab from "./tabs/pollResults";
import AppGifsTab from "./tabs/gifs";
import mediaSizes, { ScreenSize } from "../../helpers/mediaSizes";
import AppPrivateSearchTab from "./tabs/search";
import AppSharedMediaTab from "./tabs/sharedMedia";
//import AppForwardTab from "./tabs/forward";
import { MOUNT_CLASS_TO } from "../../lib/mtproto/mtproto_config";

export const RIGHT_COLUMN_ACTIVE_CLASSNAME = 'is-right-column-shown';

const sharedMediaTab = new AppSharedMediaTab();
const searchTab = new AppPrivateSearchTab();
//const forwardTab = new AppForwardTab();
const stickersTab = new AppStickersTab();
const pollResultsTab = new AppPollResultsTab();
const gifsTab = new AppGifsTab();

export class AppSidebarRight extends SidebarSlider {
  public static SLIDERITEMSIDS = {
    sharedMedia: 0,
    search: 1,
    //forward: 2,
    stickers: 2,
    pollResults: 3,
    gifs: 4,
  };

  public sharedMediaTab: AppSharedMediaTab;
  public searchTab: AppPrivateSearchTab;
  //public forwardTab: AppForwardTab;
  public stickersTab: AppStickersTab;
  public pollResultsTab: AppPollResultsTab;
  public gifsTab: AppGifsTab;

  constructor() {
    super(document.getElementById('column-right') as HTMLElement, {
      [AppSidebarRight.SLIDERITEMSIDS.sharedMedia]: sharedMediaTab,
      [AppSidebarRight.SLIDERITEMSIDS.search]: searchTab,
      //[AppSidebarRight.SLIDERITEMSIDS.forward]: forwardTab,
      [AppSidebarRight.SLIDERITEMSIDS.stickers]: stickersTab,
      [AppSidebarRight.SLIDERITEMSIDS.pollResults]: pollResultsTab,
      [AppSidebarRight.SLIDERITEMSIDS.gifs]: gifsTab
    }, true);

    //this._selectTab(3);

    this.sharedMediaTab = sharedMediaTab;
    this.searchTab = searchTab;
    //this.forwardTab = forwardTab;
    this.stickersTab = stickersTab;
    this.pollResultsTab = pollResultsTab;
    this.gifsTab = gifsTab;

    mediaSizes.addListener('changeScreen', (from, to) => {
      if(from !== undefined && to == ScreenSize.medium && from !== ScreenSize.mobile) {
        this.toggleSidebar(false);
      }
    });
  }

  public onCloseTab(id: number) {
    if(!this.historyTabIDs.length) {
      this.toggleSidebar(false);
    }

    super.onCloseTab(id);
  }

  /* public selectTab(id: number) {
    const res = super.selectTab(id);

    if(id !== -1) {
      this.toggleSidebar(true);
    }

    return res;
  } */

  public toggleSidebar(enable?: boolean, saveStatus = true) {
    /////this.log('sidebarEl', this.sidebarEl, enable, isElementInViewport(this.sidebarEl));

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

    if(saveStatus) {
      appImManager.hideRightSidebar = false;
    }

    if(!active && !this.historyTabIDs.length) {
      this.selectTab(AppSidebarRight.SLIDERITEMSIDS.sharedMedia);
    }

    document.body.classList.toggle(RIGHT_COLUMN_ACTIVE_CLASSNAME, enable);
    //console.log('sidebar selectTab', enable, willChange);
    if(mediaSizes.isMobile) {
      //appImManager._selectTab(active ? 1 : 2);
      appImManager.selectTab(active ? 1 : 2);
      return new Promise(resolve => {
        setTimeout(resolve, 250); // delay of slider animation
      });    
    }

    return new Promise(resolve => {
      setTimeout(resolve, 200); // delay for third column open
    });
    //return Promise.resolve();

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
MOUNT_CLASS_TO && (MOUNT_CLASS_TO.appSidebarRight = appSidebarRight);
export default appSidebarRight;
