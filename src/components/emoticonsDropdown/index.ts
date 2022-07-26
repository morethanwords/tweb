/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import IS_TOUCH_SUPPORTED from "../../environment/touchSupport";
import appImManager from "../../lib/appManagers/appImManager";
import rootScope from "../../lib/rootScope";
import animationIntersector from "../animationIntersector";
import { horizontalMenu } from "../horizontalMenu";
import LazyLoadQueue from "../lazyLoadQueue";
import Scrollable, { ScrollableX } from "../scrollable";
import appSidebarRight from "../sidebarRight";
import StickyIntersector from "../stickyIntersector";
import EmojiTab from "./tabs/emoji";
import GifsTab from "./tabs/gifs";
import StickersTab from "./tabs/stickers";
import { MOUNT_CLASS_TO } from "../../config/debug";
import AppGifsTab from "../sidebarRight/tabs/gifs";
import AppStickersTab from "../sidebarRight/tabs/stickers";
import findUpClassName from "../../helpers/dom/findUpClassName";
import findUpTag from "../../helpers/dom/findUpTag";
import blurActiveElement from "../../helpers/dom/blurActiveElement";
import whichChild from "../../helpers/dom/whichChild";
import cancelEvent from "../../helpers/dom/cancelEvent";
import DropdownHover from "../../helpers/dropdownHover";
import pause from "../../helpers/schedulers/pause";
import { IS_APPLE_MOBILE } from "../../environment/userAgent";
import { AppManagers } from "../../lib/appManagers/managers";
import type LazyLoadQueueIntersector from "../lazyLoadQueueIntersector";
import { simulateClickEvent } from "../../helpers/dom/clickEvent";

export const EMOTICONSSTICKERGROUP = 'emoticons-dropdown';

export interface EmoticonsTab {
  init: () => void,
  onCloseAfterTimeout?: () => void
}

export class EmoticonsDropdown extends DropdownHover {
  public static lazyLoadQueue = new LazyLoadQueue();

  private emojiTab: EmojiTab;
  public stickersTab: StickersTab;
  private gifsTab: GifsTab;

  private container: HTMLElement;
  private tabsEl: HTMLElement;
  private tabId = -1;

  private tabs: {[id: number]: EmoticonsTab};

  private searchButton: HTMLElement;
  private deleteBtn: HTMLElement;

  private selectTab: ReturnType<typeof horizontalMenu>;

  private savedRange: Range;
  private managers: AppManagers;

  constructor() {
    super({
      element: document.getElementById('emoji-dropdown') as HTMLDivElement
    });

    this.addEventListener('open', async() => {
      if(IS_TOUCH_SUPPORTED) {
        //appImManager.chat.input.saveScroll();
        if(blurActiveElement()) {
          await pause(100);
        }
      }

      if(this.element.parentElement !== appImManager.chat.input.chatInput) {
        appImManager.chat.input.chatInput.append(this.element);
      }

      this.savedRange = this.getGoodRange();

      EmoticonsDropdown.lazyLoadQueue.lock();
      //EmoticonsDropdown.lazyLoadQueue.unlock();
      animationIntersector.lockIntersectionGroup(EMOTICONSSTICKERGROUP);
    });

    this.addEventListener('opened', () => {
      animationIntersector.unlockIntersectionGroup(EMOTICONSSTICKERGROUP);
      EmoticonsDropdown.lazyLoadQueue.unlock();
      EmoticonsDropdown.lazyLoadQueue.refresh();

      this.container.classList.remove('disable-hover');
    });

    this.addEventListener('close', () => {
      EmoticonsDropdown.lazyLoadQueue.lock();
      //EmoticonsDropdown.lazyLoadQueue.lock();

      // нужно залочить группу и выключить стикеры
      animationIntersector.lockIntersectionGroup(EMOTICONSSTICKERGROUP);
      animationIntersector.checkAnimations(true, EMOTICONSSTICKERGROUP);
    });

    this.addEventListener('closed', () => {
      // теперь можно убрать visible, чтобы они не включились после фокуса
      animationIntersector.unlockIntersectionGroup(EMOTICONSSTICKERGROUP);
      EmoticonsDropdown.lazyLoadQueue.unlock();
      EmoticonsDropdown.lazyLoadQueue.refresh();

      this.container.classList.remove('disable-hover');

      this.savedRange = undefined;
    });
  }

  protected init() {
    this.managers = rootScope.managers;
    this.emojiTab = new EmojiTab(this.managers);
    this.stickersTab = new StickersTab(this.managers);
    this.gifsTab = new GifsTab(this.managers);

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
        if(!appSidebarRight.isTabExists(AppStickersTab)) {
          appSidebarRight.createTab(AppStickersTab).open();
        }
      } else {
        if(!appSidebarRight.isTabExists(AppGifsTab)) {
          appSidebarRight.createTab(AppGifsTab).open();
        }
      }
    });

    this.deleteBtn = this.element.querySelector('.emoji-tabs-delete');
    this.deleteBtn.addEventListener('click', (e) => {
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

      cancelEvent(e);
    });
    
    const HIDE_EMOJI_TAB = IS_APPLE_MOBILE;

    const INIT_TAB_ID = HIDE_EMOJI_TAB ? 1 : 0;

    if(HIDE_EMOJI_TAB) {
      (this.tabsEl.children[1] as HTMLElement).classList.add('hide');
    }

    simulateClickEvent(this.tabsEl.children[INIT_TAB_ID + 1] as HTMLElement); // set emoji tab
    if(this.tabs[INIT_TAB_ID].init) {
      this.tabs[INIT_TAB_ID].init(); // onTransitionEnd не вызовется, т.к. это первая открытая вкладка
    }

    appImManager.addEventListener('peer_changed', this.checkRights);
    this.checkRights();

    return super.init();
  }

  public getElement() {
    return this.element;
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

  private checkRights = () => {
    const {peerId, threadId} = appImManager.chat;
    const children = this.tabsEl.children;
    const tabsElements = Array.from(children) as HTMLElement[];

    const canSendStickers = this.managers.appMessagesManager.canSendToPeer(peerId, threadId, 'send_stickers');
    tabsElements[2].toggleAttribute('disabled', !canSendStickers);

    const canSendGifs = this.managers.appMessagesManager.canSendToPeer(peerId, threadId, 'send_gifs');
    tabsElements[3].toggleAttribute('disabled', !canSendGifs);

    const active = this.tabsEl.querySelector('.active');
    if(active && whichChild(active) !== 1 && (!canSendStickers || !canSendGifs)) {
      this.selectTab(0, false);
    }
  };

  public static menuOnClick = (menu: HTMLElement, scroll: Scrollable, menuScroll?: ScrollableX, prevId = 0) => {
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
        menuScroll.scrollIntoViewNew({
          element: menu.children[which] as HTMLElement,
          position: 'center',
          axis: 'x'
        });
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

    return {stickyIntersector, setActive};
  };

  public static onMediaClick = (e: {target: EventTarget | Element}, clearDraft = false) => {
    let target = e.target as HTMLElement;
    target = findUpTag(target, 'DIV');

    if(!target) return false;
    
    const fileId = target.dataset.docId;
    if(!fileId) return false;

    if(appImManager.chat.input.sendMessageWithDocument(fileId, undefined, clearDraft)) {
      /* dropdown.classList.remove('active');
      toggleEl.classList.remove('active'); */
      if(emoticonsDropdown.container) {
        emoticonsDropdown.forceClose = true;
        emoticonsDropdown.container.classList.add('disable-hover');
        emoticonsDropdown.toggle(false);
      }

      return true;
    } else {
      console.warn('got no doc by id:', fileId);
      return false;
    }
  };

  public addLazyLoadQueueRepeat(lazyLoadQueue: LazyLoadQueueIntersector, processInvisibleDiv: (div: HTMLElement) => void) {
    this.addEventListener('close', () => {
      lazyLoadQueue.lock();
    });

    this.addEventListener('closed', () => {
      const divs = lazyLoadQueue.intersector.getVisible();

      for(const div of divs) {
        processInvisibleDiv(div);
      }

      lazyLoadQueue.intersector.clearVisible();
    });

    this.addEventListener('opened', () => {
      lazyLoadQueue.unlockAndRefresh();
    });
  }

  public getSavedRange() {
    return this.getGoodRange() || this.savedRange;
  }

  private getGoodRange() {
    const sel = document.getSelection();
    if(sel.rangeCount && document.activeElement === appImManager.chat.input.messageInput) {
      return sel.getRangeAt(0);
    }
  }
}

const emoticonsDropdown = new EmoticonsDropdown();
MOUNT_CLASS_TO.emoticonsDropdown = emoticonsDropdown;
export default emoticonsDropdown;
