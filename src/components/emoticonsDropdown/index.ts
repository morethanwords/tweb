/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import IS_TOUCH_SUPPORTED from '../../environment/touchSupport';
import appImManager from '../../lib/appManagers/appImManager';
import rootScope from '../../lib/rootScope';
import animationIntersector, {AnimationItemGroup} from '../animationIntersector';
import {horizontalMenu} from '../horizontalMenu';
import LazyLoadQueue from '../lazyLoadQueue';
import Scrollable, {ScrollableX} from '../scrollable';
import appSidebarRight from '../sidebarRight';
import StickyIntersector from '../stickyIntersector';
import EmojiTab from './tabs/emoji';
import GifsTab from './tabs/gifs';
import StickersTab, {EmoticonsTabC, StickersTabCategory} from './tabs/stickers';
import {MOUNT_CLASS_TO} from '../../config/debug';
import AppGifsTab from '../sidebarRight/tabs/gifs';
import AppStickersTab from '../sidebarRight/tabs/stickers';
import findUpClassName from '../../helpers/dom/findUpClassName';
import findUpTag from '../../helpers/dom/findUpTag';
import blurActiveElement from '../../helpers/dom/blurActiveElement';
import whichChild from '../../helpers/dom/whichChild';
import cancelEvent from '../../helpers/dom/cancelEvent';
import DropdownHover from '../../helpers/dropdownHover';
import pause from '../../helpers/schedulers/pause';
import {IS_APPLE_MOBILE} from '../../environment/userAgent';
import {AppManagers} from '../../lib/appManagers/managers';
import type LazyLoadQueueIntersector from '../lazyLoadQueueIntersector';
import {attachClickEvent, simulateClickEvent} from '../../helpers/dom/clickEvent';
import overlayCounter from '../../helpers/overlayCounter';
import noop from '../../helpers/noop';
import {FocusDirection, ScrollOptions} from '../../helpers/fastSmoothScroll';
import BezierEasing from '../../vendor/bezierEasing';
import RichInputHandler from '../../helpers/dom/richInputHandler';
import {getCaretPosF} from '../../helpers/dom/getCaretPosNew';
import ListenerSetter from '../../helpers/listenerSetter';
import {ChatRights} from '../../lib/appManagers/appChatsManager';
import {toastNew} from '../toast';
import {POSTING_NOT_ALLOWED_MAP} from '../chat/input';

export const EMOTICONSSTICKERGROUP: AnimationItemGroup = 'emoticons-dropdown';

export interface EmoticonsTab {
  content: HTMLElement;
  scrollable: Scrollable;
  menuScroll?: ScrollableX;
  tabId: number;
  init: () => void;
  onOpen?: () => void;
  onOpened?: () => void;
  onClose?: () => void;
  onClosed?: () => void;
}

const easing = BezierEasing(0.42, 0.0, 0.58, 1.0);
const scrollOptions: Partial<ScrollOptions> = {
  forceDuration: 200,
  transitionFunction: easing
};

export class EmoticonsDropdown extends DropdownHover {
  public static lazyLoadQueue = new LazyLoadQueue(1);

  private emojiTab: EmojiTab;
  private stickersTab: StickersTab;
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

  private rights: {[action in ChatRights]?: boolean};

  constructor() {
    super({
      element: document.getElementById('emoji-dropdown') as HTMLDivElement,
      ignoreOutClickClassName: 'input-message-input'
    });

    this.rights = {
      send_gifs: undefined,
      send_stickers: undefined
    };

    this.addEventListener('open', async() => {
      if(IS_TOUCH_SUPPORTED) {
        // appImManager.chat.input.saveScroll();
        if(blurActiveElement()) {
          await pause(100);
        }
      }

      if(this.element.parentElement !== appImManager.chat.input.chatInput) {
        appImManager.chat.input.chatInput.append(this.element);
      }

      this.savedRange = this.getGoodRange();

      EmoticonsDropdown.lazyLoadQueue.lock();
      // EmoticonsDropdown.lazyLoadQueue.unlock();
      animationIntersector.lockIntersectionGroup(EMOTICONSSTICKERGROUP);

      const tab = this.tab;
      tab.onOpen?.();
    });

    this.addEventListener('opened', () => {
      animationIntersector.unlockIntersectionGroup(EMOTICONSSTICKERGROUP);
      EmoticonsDropdown.lazyLoadQueue.unlockAndRefresh();

      // this.container.classList.remove('disable-hover');

      const tab = this.tab;
      tab.onOpened?.();
    });

    this.addEventListener('close', () => {
      EmoticonsDropdown.lazyLoadQueue.lock();
      // EmoticonsDropdown.lazyLoadQueue.lock();

      // нужно залочить группу и выключить стикеры
      animationIntersector.lockIntersectionGroup(EMOTICONSSTICKERGROUP);
      animationIntersector.checkAnimations(true, EMOTICONSSTICKERGROUP);

      const tab = this.tab;
      tab.onClose?.();
    });

    this.addEventListener('closed', () => {
      // теперь можно убрать visible, чтобы они не включились после фокуса
      animationIntersector.unlockIntersectionGroup(EMOTICONSSTICKERGROUP);
      EmoticonsDropdown.lazyLoadQueue.unlock();
      EmoticonsDropdown.lazyLoadQueue.refresh();

      // this.container.classList.remove('disable-hover');

      this.savedRange = undefined;

      const tab = this.tab;
      tab.onClosed?.();
    });
  }

  public get tab() {
    return this.tabs[this.tabId];
  }

  public init() {
    this.managers = rootScope.managers;
    this.emojiTab = new EmojiTab({managers: this.managers});
    this.stickersTab = new StickersTab(this.managers);
    this.gifsTab = new GifsTab(this.managers);

    this.tabs = {};
    [this.emojiTab, this.stickersTab, this.gifsTab].forEach((tab, idx) => {
      tab.tabId = idx;
      this.tabs[idx] = tab;
    });

    this.container = this.element.querySelector('.emoji-container .tabs-container') as HTMLDivElement;
    this.container.prepend(this.emojiTab.container, this.stickersTab.container);
    this.tabsEl = this.element.querySelector('.emoji-tabs') as HTMLUListElement;
    this.selectTab = horizontalMenu(this.tabsEl, this.container, this.onSelectTabClick, () => {
      const {tab} = this;
      tab.init?.();
      animationIntersector.checkAnimations(false, EMOTICONSSTICKERGROUP);
    });

    this.searchButton = this.element.querySelector('.emoji-tabs-search');
    this.searchButton.addEventListener('click', () => {
      if(this.tabId === this.stickersTab.tabId) {
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
    attachClickEvent(this.deleteBtn, (e) => {
      cancelEvent(e);
      const input = appImManager.chat.input.messageInput;
      // RichInputHandler.getInstance().makeFocused(appImManager.chat.input.messageInput);
      let range = RichInputHandler.getInstance().getSavedRange(input);
      if(!range) {
        range = document.createRange();
        range.setStartAfter(input.lastChild);
      }

      const newRange = range.cloneRange();
      // if(range.endOffset === range.startOffset && range.endContainer === range.startContainer) {
      if(range.collapsed) {
        const {node, offset} = getCaretPosF(input, range.endContainer, range.endOffset);
        let newStartNode: Node;
        if(offset) {
          newStartNode = node;
        } else {
          newStartNode = node.previousSibling;
          if(!newStartNode) {
            return;
          }

          while(newStartNode.nodeType === newStartNode.TEXT_NODE && !newStartNode.nodeValue && (newStartNode = newStartNode.previousSibling)) {

          }

          if(newStartNode.nodeType === newStartNode.ELEMENT_NODE && !(newStartNode as HTMLElement).isContentEditable) {
            return;
          }
        }

        if(newStartNode.nodeType === newStartNode.ELEMENT_NODE && (newStartNode as any).tagName === 'IMG') {
          newRange.selectNode(newStartNode);
        } else {
          const text = [...newStartNode.textContent];
          let t: string;
          if(offset) {
            let length = 0;
            t = text.find((text) => (length += text.length, length >= offset));
          } else {
            t = text.pop() || '';
          }

          const newOffset = offset ? offset - t.length : newStartNode.textContent.length - t.length;
          newRange.setStart(newStartNode, newOffset);
        }
      }

      newRange.deleteContents();

      appImManager.chat.input.messageInputField.simulateInputEvent();
      // const selection = document.getSelection();
      // if(selection.isCollapsed) {
      //   selection.modify('extend', 'backward', 'character');
      // }

      // selection.deleteFromDocument();
      // (document.activeElement as HTMLElement).blur();

      // document.execCommand('undo', false, null);
      // const input = appImManager.chat.input.messageInput;
      // if((input.lastChild as any)?.tagName) {
      //   input.lastElementChild.remove();
      // } else if(input.lastChild) {
      //   if(!input.lastChild.textContent.length) {
      //     input.lastChild.remove();
      //   } else {
      //     input.lastChild.textContent = input.lastChild.textContent.slice(0, -1);
      //   }
      // }

      // const event = new Event('input', {bubbles: true, cancelable: true});
      // appImManager.chat.input.messageInput.dispatchEvent(event);
      // // appSidebarRight.stickersTab.init();
    });

    const HIDE_EMOJI_TAB = IS_APPLE_MOBILE && false;

    const INIT_TAB_ID = HIDE_EMOJI_TAB ? this.stickersTab.tabId : this.emojiTab.tabId;

    if(HIDE_EMOJI_TAB) {
      (this.tabsEl.children[1] as HTMLElement).classList.add('hide');
    }

    simulateClickEvent(this.tabsEl.children[INIT_TAB_ID + 1] as HTMLElement);
    if(this.tabs[INIT_TAB_ID].init) {
      this.tabs[INIT_TAB_ID].init(); // onTransitionEnd не вызовется, т.к. это первая открытая вкладка
    }

    if(!IS_TOUCH_SUPPORTED) {
      let lastMouseMoveEvent: MouseEvent, mouseMoveEventAttached = false;
      const onMouseMove = (e: MouseEvent) => {
        lastMouseMoveEvent = e;
      };
      overlayCounter.addEventListener('change', (isActive) => {
        if(isActive) {
          if(!mouseMoveEventAttached) {
            document.body.addEventListener('mousemove', onMouseMove);
            mouseMoveEventAttached = true;
          }
        } else if(mouseMoveEventAttached) {
          document.body.removeEventListener('mousemove', onMouseMove);
          if(lastMouseMoveEvent) {
            this.onMouseOut(lastMouseMoveEvent);
          }
        }
      });
    }

    appImManager.addEventListener('peer_changing', () => {
      this.toggle(false);
    });
    appImManager.addEventListener('peer_changed', this.checkRights);
    this.checkRights();

    return super.init();
  }

  public getElement() {
    return this.element;
  }

  public scrollTo(tab: EmoticonsTab, element: HTMLElement) {
    tab.scrollable.scrollIntoViewNew({
      element: element as HTMLElement,
      axis: 'y',
      position: 'start',
      ...scrollOptions
    });
  }

  private onSelectTabClick = (id: number) => {
    if(this.tabId === id) {
      const {tab} = this;
      this.scrollTo(tab, tab.scrollable.container.firstElementChild as HTMLElement);
      return;
    }

    const rights: {[tabId: number]: ChatRights} = {
      [this.stickersTab.tabId]: 'send_stickers',
      [this.gifsTab.tabId]: 'send_gifs'
    };

    const action = rights[id];
    if(action && !this.rights[action]) {
      toastNew({langPackKey: POSTING_NOT_ALLOWED_MAP[action]});
      return false;
    }

    animationIntersector.checkAnimations(true, EMOTICONSSTICKERGROUP);

    this.tabId = id;
    this.searchButton.classList.toggle('hide', this.tabId === this.emojiTab.tabId);
    this.deleteBtn.classList.toggle('hide', this.tabId !== this.emojiTab.tabId);
  };

  private checkRights = async() => {
    const {peerId, threadId} = appImManager.chat;

    const actions = Object.keys(this.rights) as ChatRights[];

    const rights = await Promise.all(actions.map((action) => {
      return this.managers.appMessagesManager.canSendToPeer(peerId, threadId, action);
    }));

    actions.forEach((action, idx) => {
      this.rights[action] = rights[idx];
    });

    const active = this.tabsEl.querySelector('.active');
    if(active && whichChild(active) !== (this.emojiTab.tabId + 1) && (!this.rights['send_stickers'] || !this.rights['send_gifs'])) {
      this.selectTab(this.emojiTab.tabId, false);
    }
  };

  public static menuOnClick = (
    emoticons: EmoticonsTabC<any>,
    menu: HTMLElement,
    scrollable: Scrollable,
    menuScroll?: ScrollableX,
    prevTab?: StickersTabCategory<any>,
    listenerSetter?: ListenerSetter
  ) => {
    let jumpedTo = -1;

    const scrollToTab = (tab: typeof prevTab, f?: boolean) => {
      const m = tab.menuScroll || menuScroll;
      if(m) {
        m.scrollIntoViewNew({
          element: tab.elements.menuTab,
          position: 'center',
          axis: 'x',
          getElementPosition: f ? ({elementPosition}) => {
            return elementPosition - 106;
          } : undefined,
          ...scrollOptions
        });
      }
    };

    const setActive = (tab: typeof prevTab, scroll = true) => {
      if(tab === prevTab) {
        return false;
      }

      let f = false;
      if(prevTab) {
        prevTab.elements.menuTab.classList.remove('active');
        if(prevTab.menuScroll && prevTab.menuScroll !== tab.menuScroll) {
          f = true;
          // scroll to first
          prevTab.menuScroll.container.parentElement.classList.remove('active');
          prevTab.menuScroll.scrollIntoViewNew({
            element: prevTab.menuScroll.container.firstElementChild as HTMLElement,
            forceDirection: scroll ? undefined : FocusDirection.Static,
            position: 'center',
            axis: 'x',
            ...scrollOptions
          });
        }
      }

      tab.elements.menuTab.classList.add('active');

      if(tab.menuScroll) {
        tab.menuScroll.container.parentElement.classList.add('active');
        scroll && menuScroll.scrollIntoViewNew({
          element: tab.menuScroll.container.parentElement,
          position: 'center',
          axis: 'x',
          ...scrollOptions
        });
      }

      if(prevTab) {
        scrollToTab(tab, f);
      }

      prevTab = tab;

      return true;
    };

    const setActiveStatic = (tab: typeof prevTab) => {
      if(prevTab?.local) {
        return;
      }

      emoticons.scrollable.scrollTop = tab.elements.container.offsetTop + 1;
      const s = emoticons.menuScroll.container;
      const e = tab.elements.menuTab;
      s.scrollLeft = e.offsetLeft - s.clientWidth / 2 + e.offsetWidth / 2;
      setActive(tab, false);
    };

    let scrollingToContent = false;
    const stickyIntersector = new StickyIntersector(scrollable.container, (stuck, target) => {
      if(scrollingToContent) {
        return;
      }

      // console.log('sticky scrollTop', stuck, target, scrollable.container.scrollTop, jumpedTo);

      if(Math.abs(jumpedTo - scrollable.container.scrollTop) <= 1) {
        return;
      } else {
        jumpedTo = -1;
      }

      const tab = emoticons.getCategoryByContainer(target);
      const which = whichChild(target);
      if(!stuck && (which || tab.menuScroll)) {
        return;
      }

      setActive(tab);
    });

    attachClickEvent(menu, (e) => {
      let target = findUpClassName(e.target as HTMLElement, 'menu-horizontal-div-item');
      if(!target) {
        target = findUpClassName(e.target as HTMLElement, 'menu-horizontal-inner');
        if(!target || target.classList.contains('active')) {
          return;
        }

        target = target.firstElementChild.firstElementChild as HTMLElement;
      }

      const which = whichChild(target);

      const tab = emoticons.getCategoryByMenuTab(target);

      /* if(menuScroll) {
        menuScroll.scrollIntoView(target, false, 0);
      } */

      if(setActive(tab)) {
        // scrollToTab(tab);
        // return;
      }

      let offsetTop = 0, additionalOffset = 0;
      if(which > 0 || tab.menuScroll) {
        const element = tab.elements.container;
        additionalOffset = 1;
        offsetTop = element.offsetTop + additionalOffset; // * due to stickyIntersector
      }

      jumpedTo = offsetTop;

      scrollingToContent = true;
      scrollable.scrollIntoViewNew({
        element: offsetTop ? tab.elements.container : scrollable.container.firstElementChild,
        position: 'start',
        axis: 'y',
        getElementPosition: offsetTop ? ({elementPosition}) => elementPosition + additionalOffset : undefined,
        ...scrollOptions
      }).finally(() => {
        setActive(tab);
        scrollingToContent = false;
      });
    }, {listenerSetter});

    const a = scrollable.onAdditionalScroll ? scrollable.onAdditionalScroll.bind(scrollable) : noop;
    scrollable.onAdditionalScroll = () => {
      emoticons.content.parentElement.classList.toggle('scrolled-top', !scrollable.scrollTop);
      a();
    };

    return {stickyIntersector, setActive, setActiveStatic};
  };

  public static onMediaClick = async(e: {target: EventTarget | Element}, clearDraft = false, silent?: boolean) => {
    const target = findUpTag(e.target as HTMLElement, 'DIV');
    if(!target) return false;

    const docId = target.dataset.docId;
    if(!docId) return false;

    return this.sendDocId(docId, clearDraft, silent);
  };

  public static async sendDocId(docId: DocId, clearDraft?: boolean, silent?: boolean) {
    if(await appImManager.chat.input.sendMessageWithDocument(docId, undefined, clearDraft, silent)) {
      /* dropdown.classList.remove('active');
      toggleEl.classList.remove('active'); */
      if(emoticonsDropdown.container) {
        emoticonsDropdown.forceClose = true;
        // emoticonsDropdown.container.classList.add('disable-hover');
        emoticonsDropdown.toggle(false);
      }

      return true;
    } else {
      console.warn('got no doc by id:', docId);
      return false;
    }
  }

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
