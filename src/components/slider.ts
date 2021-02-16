import { attachClickEvent } from "../helpers/dom";
import { horizontalMenu } from "./horizontalMenu";
import ButtonIcon from "./buttonIcon";
import Scrollable from "./scrollable";
import { TransitionSlider } from "./transition";
import appNavigationController, { NavigationItem } from "./appNavigationController";
import { isSafari } from "../helpers/userAgent";

export interface SliderTab {
  onOpen?: () => void,
  onOpenAfterTimeout?: () => void,
  onClose?: () => void,
  onCloseAfterTimeout?: () => void
}

export class SliderSuperTab implements SliderTab {
  public container: HTMLElement;

  public header: HTMLElement;
  public closeBtn: HTMLElement;
  public title: HTMLElement;

  public content: HTMLElement;
  public scrollable: Scrollable;

  public id: number;

  constructor(protected slider: SidebarSlider, protected destroyable = false) {
    this.container = document.createElement('div');
    this.container.classList.add('sidebar-slider-item');

    // * Header
    this.header = document.createElement('div');
    this.header.classList.add('sidebar-header');

    this.closeBtn = ButtonIcon('arrow_back sidebar-close-button', {noRipple: true});
    this.title = document.createElement('div');
    this.title.classList.add('sidebar-header__title');
    this.header.append(this.closeBtn, this.title);

    // * Content
    this.content = document.createElement('div');
    this.content.classList.add('sidebar-content');

    this.scrollable = new Scrollable(this.content, undefined, undefined, true);

    this.container.append(this.header, this.content);

    this.id = this.slider.addTab(this);
  }

  public close() {
    return this.slider.closeTab(this.id);
  }

  public async open(...args: any[]) {
    if(this.init) {
      const result = this.init();
      this.init = null;
      await (result instanceof Promise ? result : Promise.resolve());
    }

    return this.slider.selectTab(this);
  }

  protected init(): Promise<any> | any {

  }

  // * fix incompability
  public onOpen() {

  }

  public onCloseAfterTimeout() {
    if(this.destroyable) { // ! WARNING, пока что это будет работать только с самой последней внутренней вкладкой !
      delete this.slider.tabs[this.id];
      this.container.remove();
    }
  }
}

const TRANSITION_TIME = 250;

export default class SidebarSlider {
  protected _selectTab: ReturnType<typeof horizontalMenu>;
  public historyTabIds: number[] = [];
  public tabsContainer: HTMLElement;
  public sidebarEl: HTMLElement;
  public tabs: {[id: number]: SliderTab} = {};
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
    appNavigationController.back();
    // this.closeTab();
  };

  public closeTab = (tabId?: number, animate?: boolean) => {
    if(tabId !== undefined && this.historyTabIds[this.historyTabIds.length - 1] !== tabId) {
      return false;
    }

    //console.log('sidebar-close-button click:', this.historyTabIDs);
    const closingId = this.historyTabIds.pop(); // pop current
    this.onCloseTab(closingId, animate);
    this._selectTab(this.historyTabIds[this.historyTabIds.length - 1] ?? (this.canHideFirst ? -1 : 0), animate);
    return true;
  };

  public selectTab(id: number | SliderSuperTab): boolean {
    if(id instanceof SliderSuperTab) {
      id = id.id;
    }

    if(this.historyTabIds[this.historyTabIds.length - 1] === id) {
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
    this._selectTab(id);
    return true;
  }

  public removeTabFromHistory(id: number) {
    this.historyTabIds.findAndSplice(i => i === id);
    this.onCloseTab(id, undefined);
  }

  public onCloseTab(id: number, animate: boolean) {
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

  public addTab(tab: SliderSuperTab) {
    let id: number;
    if(tab.container.parentElement) {
      id = Array.from(this.tabsContainer.children).findIndex(el => el === tab.container);
    } else {
      id = this.tabsContainer.childElementCount;
      this.tabsContainer.append(tab.container);

      if(tab.closeBtn) {
        tab.closeBtn.addEventListener('click', this.onCloseBtnClick);
      }
    }

    this.tabs[id] = tab;

    return id;
  }
}
