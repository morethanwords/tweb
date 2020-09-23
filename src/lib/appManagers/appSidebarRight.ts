import appImManager from "./appImManager";
import SidebarSlider from "../../components/slider";
import AppStickersTab from "../../components/sidebarRight/stickers";
import AppPollResultsTab from "../../components/sidebarRight/pollResults";
import AppGifsTab from "../../components/sidebarRight/gifs";
import mediaSizes, { ScreenSize } from "../../helpers/mediaSizes";
import AppPrivateSearchTab from "../../components/sidebarRight/search";
import AppSharedMediaTab from "../../components/sidebarRight/sharedMedia";
import AppForwardTab from "../../components/sidebarRight/forward";

const COLUMN_ACTIVE_CLASSNAME = 'is-right-column-shown';

const sharedMediaTab = new AppSharedMediaTab();
const searchTab = new AppPrivateSearchTab();
const forwardTab = new AppForwardTab();
const stickersTab = new AppStickersTab();
const pollResultsTab = new AppPollResultsTab();
const gifsTab = new AppGifsTab();

export class AppSidebarRight extends SidebarSlider {
  public static SLIDERITEMSIDS = {
    sharedMedia: 0,
    search: 1,
    forward: 2,
    stickers: 3,
    pollResults: 4,
    gifs: 5,
  };

  public sharedMediaTab: AppSharedMediaTab;
  public searchTab: AppPrivateSearchTab;
  public forwardTab: AppForwardTab;
  public stickersTab: AppStickersTab;
  public pollResultsTab: AppPollResultsTab;
  public gifsTab: AppGifsTab;

  constructor() {
    super(document.getElementById('column-right') as HTMLElement, {
      [AppSidebarRight.SLIDERITEMSIDS.sharedMedia]: sharedMediaTab,
      [AppSidebarRight.SLIDERITEMSIDS.search]: searchTab,
      [AppSidebarRight.SLIDERITEMSIDS.forward]: forwardTab,
      [AppSidebarRight.SLIDERITEMSIDS.stickers]: stickersTab,
      [AppSidebarRight.SLIDERITEMSIDS.pollResults]: pollResultsTab,
      [AppSidebarRight.SLIDERITEMSIDS.gifs]: gifsTab
    }, true);

    //this._selectTab(3);

    this.sharedMediaTab = sharedMediaTab;
    this.searchTab = searchTab;
    this.forwardTab = forwardTab;
    this.stickersTab = stickersTab;
    this.pollResultsTab = pollResultsTab;
    this.gifsTab = gifsTab;

    mediaSizes.addListener('changeScreen', (from, to) => {
      if(from !== undefined && to == ScreenSize.medium) {
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

  public toggleSidebar(enable?: boolean) {
    /////this.log('sidebarEl', this.sidebarEl, enable, isElementInViewport(this.sidebarEl));
    
    const active = document.body.classList.contains(COLUMN_ACTIVE_CLASSNAME);
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

    if(!active && !this.historyTabIDs.length) {
      this.selectTab(AppSidebarRight.SLIDERITEMSIDS.sharedMedia);
    }

    //console.log('sidebar selectTab', enable, willChange);
    if(mediaSizes.isMobile) {
      appImManager.selectTab(active ? 1 : 2);
      return Promise.resolve();       
    }

    const set = () => {
      document.body.classList.toggle(COLUMN_ACTIVE_CLASSNAME, enable);
    };

    set();
    return new Promise(resolve => {
      setTimeout(resolve, 200);
    });
    //return Promise.resolve();

    return new Promise((resolve, reject) => {
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

          /* if(active) {
            appForward.close();
            this.searchCloseBtn.click();
          } */

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
    });
  }
}

const appSidebarRight = new AppSidebarRight();
// @ts-ignore
if(process.env.NODE_ENV != 'production') {
  (window as any).appSidebarRight = appSidebarRight;
}
export default appSidebarRight;
