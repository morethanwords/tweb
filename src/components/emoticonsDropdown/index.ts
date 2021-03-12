import { isTouchSupported } from "../../helpers/touchSupport";
import appChatsManager from "../../lib/appManagers/appChatsManager";
import appImManager from "../../lib/appManagers/appImManager";
import rootScope from "../../lib/rootScope";
import { blurActiveElement, findUpClassName, findUpTag, whichChild } from "../../helpers/dom";
import animationIntersector from "../animationIntersector";
import { horizontalMenu } from "../horizontalMenu";
import LazyLoadQueue, { LazyLoadQueueIntersector } from "../lazyLoadQueue";
import Scrollable, { ScrollableX } from "../scrollable";
import appSidebarRight from "../sidebarRight";
import StickyIntersector from "../stickyIntersector";
import EmojiTab from "./tabs/emoji";
import GifsTab from "./tabs/gifs";
import StickersTab from "./tabs/stickers";
import { pause } from "../../helpers/schedulers";
import { MOUNT_CLASS_TO } from "../../config/debug";
import AppGifsTab from "../sidebarRight/tabs/gifs";

export const EMOTICONSSTICKERGROUP = 'emoticons-dropdown';

export interface EmoticonsTab {
  init: () => void,
  onCloseAfterTimeout?: () => void
}

const test = false;

export class EmoticonsDropdown {
  public static lazyLoadQueue = new LazyLoadQueue();
  private element: HTMLElement;

  public emojiTab: EmojiTab;
  public stickersTab: StickersTab;
  public gifsTab: GifsTab;

  private container: HTMLElement;
  private tabsEl: HTMLElement;
  private tabId = -1;

  private tabs: {[id: number]: EmoticonsTab};

  public searchButton: HTMLElement;
  public deleteBtn: HTMLElement;
  
  private displayTimeout: number;

  public events: {
    onClose: Array<() => void>,
    onCloseAfter: Array<() => void>,
    onOpen: Array<() => void>,
    onOpenAfter: Array<() => void>
  } = {
    onClose: [],
    onCloseAfter: [],
    onOpen: [],
    onOpenAfter: []
  };

  private selectTab: ReturnType<typeof horizontalMenu>;
  private forceClose = false;

  constructor() {
    this.element = document.getElementById('emoji-dropdown') as HTMLDivElement;
  }

  public attachButtonListener(button: HTMLElement) {
    let firstTime = true;
    if(isTouchSupported) {
      button.addEventListener('click', () => {
        if(firstTime) {
          firstTime = false;
          this.toggle(true);
        } else {
          this.toggle();
        }
      });
    } else {
      button.onmouseover = (e) => {
        //console.log('onmouseover button');
        clearTimeout(this.displayTimeout);
        //this.displayTimeout = setTimeout(() => {
          if(firstTime) {
            button.onmouseout = this.onMouseOut;

            firstTime = false;
          }

          this.toggle(true);
        //}, 0/* 200 */);
      };
    }
  }

  private onMouseOut = (e: MouseEvent) => {
    if(test) return;
    if(!this.element.classList.contains('active')) return;

    const toElement = (e as any).toElement as Element;
    if(toElement && findUpClassName(toElement, 'emoji-dropdown')) {
      return;
    }

    clearTimeout(this.displayTimeout);
    this.displayTimeout = window.setTimeout(() => {
      this.toggle(false);
    }, 200);
  };

  private init() {
    this.emojiTab = new EmojiTab();
    this.stickersTab = new StickersTab();
    this.gifsTab = new GifsTab();

    this.tabs = {
      0: this.emojiTab,
      1: this.stickersTab,
      2: this.gifsTab
    };

    this.container = this.element.querySelector('.emoji-container .tabs-container') as HTMLDivElement;
    this.tabsEl = this.element.querySelector('.emoji-tabs') as HTMLUListElement;
    this.selectTab = horizontalMenu(this.tabsEl, this.container, this.onSelectTabClick, () => {
      const tab = this.tabs[this.tabId];
      if(tab.init) {
        tab.init();
      }

      tab.onCloseAfterTimeout && tab.onCloseAfterTimeout();
      animationIntersector.checkAnimations(false, EMOTICONSSTICKERGROUP);
    });

    this.searchButton = this.element.querySelector('.emoji-tabs-search');
    this.searchButton.addEventListener('click', () => {
      if(this.tabId === 1) {
        appSidebarRight.stickersTab.init();
      } else {
        new AppGifsTab(appSidebarRight).open();
      }
    });

    this.deleteBtn = this.element.querySelector('.emoji-tabs-delete');
    this.deleteBtn.addEventListener('click', () => {
      const input = appImManager.chat.input.messageInput;
      if((input.lastChild as any)?.tagName) {
        input.lastElementChild.remove();
      } else if(input.lastChild) {
        if(!input.lastChild.textContent.length) {
          input.lastChild.remove();
        } else {
          input.lastChild.textContent = input.lastChild.textContent.slice(0, -1);
        }
      }

      const event = new Event('input', {bubbles: true, cancelable: true});
      appImManager.chat.input.messageInput.dispatchEvent(event);
      //appSidebarRight.stickersTab.init();
    });

    (this.tabsEl.children[1] as HTMLLIElement).click(); // set emoji tab
    if(this.tabs[0].init) {
      this.tabs[0].init(); // onTransitionEnd не вызовется, т.к. это первая открытая вкладка
    }

    rootScope.on('peer_changed', this.checkRights);
    this.checkRights();

    if(!isTouchSupported) {
      this.element.onmouseout = this.onMouseOut;
      this.element.onmouseover = (e) => {
        if(this.forceClose) {
          return;
        }

        //console.log('onmouseover element');
        clearTimeout(this.displayTimeout);
      };
    }
  }

  private onSelectTabClick = (id: number) => {
    if(this.tabId === id) {
      return;
    }
    
    animationIntersector.checkAnimations(true, EMOTICONSSTICKERGROUP);

    this.tabId = id;
    this.searchButton.classList.toggle('hide', this.tabId === 0);
    this.deleteBtn.classList.toggle('hide', this.tabId !== 0);
  };

  public checkRights = () => {
    const peerId = appImManager.chat.peerId;
    const children = this.tabsEl.children;
    const tabsElements = Array.from(children) as HTMLElement[];

    const canSendStickers = peerId > 0 || appChatsManager.hasRights(peerId, 'send', 'send_stickers');
    tabsElements[2].toggleAttribute('disabled', !canSendStickers);

    const canSendGifs = peerId > 0 || appChatsManager.hasRights(peerId, 'send', 'send_gifs');
    tabsElements[3].toggleAttribute('disabled', !canSendGifs);

    const active = this.tabsEl.querySelector('.active');
    if(active && whichChild(active) !== 1 && (!canSendStickers || !canSendGifs)) {
      this.selectTab(0, false);
    }
  };

  public toggle = async(enable?: boolean) => {
    //if(!this.element) return;
    const willBeActive = (!!this.element.style.display && enable === undefined) || enable;
    if(this.init) {
      if(willBeActive) {
        this.init();
        this.init = null;
      } else {
        return;
      }
    }

    if(isTouchSupported) {
      if(willBeActive) {
        //appImManager.chat.input.saveScroll();
        if(blurActiveElement()) {
          await pause(100);
        }
      }
    }

    if(this.element.parentElement !== appImManager.chat.input.chatInput) {
      appImManager.chat.input.chatInput.append(this.element);
    }
    
    if((this.element.style.display && enable === undefined) || enable) {
      this.events.onOpen.forEach(cb => cb());

      EmoticonsDropdown.lazyLoadQueue.lock();
      //EmoticonsDropdown.lazyLoadQueue.unlock();
      animationIntersector.lockIntersectionGroup(EMOTICONSSTICKERGROUP);

      this.element.style.display = '';
      void this.element.offsetLeft; // reflow
      this.element.classList.add('active');

      clearTimeout(this.displayTimeout);
      this.displayTimeout = window.setTimeout(() => {
        animationIntersector.unlockIntersectionGroup(EMOTICONSSTICKERGROUP);
        EmoticonsDropdown.lazyLoadQueue.unlock();
        EmoticonsDropdown.lazyLoadQueue.refresh();

        this.forceClose = false;
        this.container.classList.remove('disable-hover');

        this.events.onOpenAfter.forEach(cb => cb());
      }, isTouchSupported ? 0 : 200);

      // ! can't use together with resizeObserver
      /* if(isTouchSupported) {
        const height = this.element.scrollHeight + appImManager.chat.input.inputContainer.scrollHeight - 10;
        console.log('[ESG]: toggle: enable height', height);
        appImManager.chat.bubbles.scrollable.scrollTop += height;
      } */

      /* if(touchSupport) {
        this.restoreScroll();
      } */
    } else {
      this.events.onClose.forEach(cb => cb());

      EmoticonsDropdown.lazyLoadQueue.lock();
      //EmoticonsDropdown.lazyLoadQueue.lock();

      // нужно залочить группу и выключить стикеры
      animationIntersector.lockIntersectionGroup(EMOTICONSSTICKERGROUP);
      animationIntersector.checkAnimations(true, EMOTICONSSTICKERGROUP);

      this.element.classList.remove('active');

      clearTimeout(this.displayTimeout);
      this.displayTimeout = window.setTimeout(() => {
        this.element.style.display = 'none';

        // теперь можно убрать visible, чтобы они не включились после фокуса
        animationIntersector.unlockIntersectionGroup(EMOTICONSSTICKERGROUP);
        EmoticonsDropdown.lazyLoadQueue.unlock();
        EmoticonsDropdown.lazyLoadQueue.refresh();

        this.forceClose = false;
        this.container.classList.remove('disable-hover');

        this.events.onCloseAfter.forEach(cb => cb());
      }, isTouchSupported ? 0 : 200);

      /* if(isTouchSupported) {
        const scrollHeight = this.container.scrollHeight;
        if(scrollHeight) {
          const height = this.container.scrollHeight + appImManager.chat.input.inputContainer.scrollHeight - 10;
          appImManager.chat.bubbles.scrollable.scrollTop -= height;
        }
      } */

      /* if(touchSupport) {
        this.restoreScroll();
      } */
    }

    //animationIntersector.checkAnimations(false, EMOTICONSSTICKERGROUP);
  };

  public static menuOnClick = (menu: HTMLElement, scroll: Scrollable, menuScroll?: ScrollableX) => {
    let prevId = 0;
    let jumpedTo = -1;

    const setActive = (id: number) => {
      if(id === prevId) {
        return false;
      }

      menu.children[prevId].classList.remove('active');
      menu.children[id].classList.add('active');
      prevId = id;

      return true;
    };

    const stickyIntersector = new StickyIntersector(scroll.container, (stuck, target) => {
      //console.log('sticky scrollTOp', stuck, target, scroll.container.scrollTop);

      if(Math.abs(jumpedTo - scroll.container.scrollTop) <= 1) {
        return;
      } else {
        jumpedTo = -1;
      }

      const which = whichChild(target);
      if(!stuck && which) { // * due to stickyIntersector
        return;
      }

      setActive(which);

      if(menuScroll) {
        if(which < menu.childElementCount - 4) {
          menuScroll.container.scrollLeft = (which - 3) * 47;
        } else {
          menuScroll.container.scrollLeft = which * 47;
        }
      }
    });

    menu.addEventListener('click', (e) => {
      let target = e.target as HTMLElement;
      target = findUpClassName(target, 'menu-horizontal-div-item');

      if(!target) {
        return;
      }

      const which = whichChild(target);

      /* if(menuScroll) {
        menuScroll.scrollIntoView(target, false, 0);
      } */

      if(!setActive(which)) {
        return;
      }

      const element = (scroll.splitUp || scroll.container).children[which] as HTMLElement;
      const offsetTop = element.offsetTop + 1; // * due to stickyIntersector

      scroll.container.scrollTop = jumpedTo = offsetTop;

      //console.log('set scrollTop:', offsetTop);
    });

    return stickyIntersector;
  };

  public static onMediaClick = (e: MouseEvent, clearDraft = false) => {
    let target = e.target as HTMLElement;
    target = findUpTag(target, 'DIV');

    if(!target) return;
    
    const fileId = target.dataset.docId;
    if(!fileId) return;

    if(appImManager.chat.input.sendMessageWithDocument(fileId, undefined, clearDraft)) {
      /* dropdown.classList.remove('active');
      toggleEl.classList.remove('active'); */
      emoticonsDropdown.forceClose = true;
      emoticonsDropdown.container.classList.add('disable-hover');
      emoticonsDropdown.toggle(false);
    } else {
      console.warn('got no doc by id:', fileId);
    }
  };

  public addLazyLoadQueueRepeat(lazyLoadQueue: LazyLoadQueueIntersector, processInvisibleDiv: (div: HTMLElement) => void) {
    this.events.onClose.push(() => {
      lazyLoadQueue.lock();
    });

    this.events.onCloseAfter.push(() => {
      const divs = lazyLoadQueue.intersector.getVisible();

      for(const div of divs) {
        processInvisibleDiv(div);
      }

      lazyLoadQueue.intersector.clearVisible();
    });

    this.events.onOpenAfter.push(() => {
      lazyLoadQueue.unlockAndRefresh();
    });
  }
}

const emoticonsDropdown = new EmoticonsDropdown();
MOUNT_CLASS_TO && (MOUNT_CLASS_TO.emoticonsDropdown = emoticonsDropdown);
export default emoticonsDropdown;
