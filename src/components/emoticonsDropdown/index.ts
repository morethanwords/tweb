/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import type LazyLoadQueueIntersector from '../lazyLoadQueueIntersector';
import IS_TOUCH_SUPPORTED from '../../environment/touchSupport';
import appImManager from '../../lib/appManagers/appImManager';
import rootScope from '../../lib/rootScope';
import animationIntersector, {AnimationItemGroup} from '../animationIntersector';
import {horizontalMenu} from '../horizontalMenu';
import LazyLoadQueue from '../lazyLoadQueue';
import Scrollable, {ScrollableX} from '../scrollable';
import appSidebarRight from '../sidebarRight';
import StickyIntersector from '../stickyIntersector';
import EmojiTab, {EmojiTabCategory, getEmojiFromElement} from './tabs/emoji';
import GifsTab from './tabs/gifs';
import StickersTab from './tabs/stickers';
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
import ChatInput, {POSTING_NOT_ALLOWED_MAP} from '../chat/input';
import safeAssign from '../../helpers/object/safeAssign';
import ButtonIcon from '../buttonIcon';
import StickersTabCategory from './category';
import {Middleware} from '../../helpers/middleware';

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

export interface EmoticonsTabConstructable<T extends EmoticonsTab = any> {
  new(...args: any[]): T;
}

const easing = BezierEasing(0.42, 0.0, 0.58, 1.0);
const scrollOptions: Partial<ScrollOptions> = {
  forceDuration: 150,
  transitionFunction: easing,
  maxDistance: 150
};
const renderEmojiDropdownElement = (): HTMLDivElement => {
  const div = document.createElement('div');
  div.innerHTML =
    `<div class="emoji-dropdown" style="display: none;">
      <div class="emoji-container">
        <div class="tabs-container"></div>
      </div>
      <div class="emoji-tabs menu-horizontal-div emoticons-menu no-stripe"></div>
    </div>`;
  const a: [string, string, number][] = [
    ['search justify-self-start', 'search', -1],
    ['emoji', 'smile', 0],
    ['stickers', 'stickers_face', 1],
    ['gifs', 'gifs', 2],
    ['delete justify-self-end', 'deleteleft', -1]
  ];
  const d = div.firstElementChild as HTMLDivElement;
  d.lastElementChild.append(...a.map(([className, icon, tabId]) => {
    const button = ButtonIcon(`${icon} menu-horizontal-div-item emoji-tabs-${className}`, {noRipple: true});
    button.dataset.tab = '' + tabId;
    return button;
  }));
  return d;
}

export const EMOJI_TEXT_COLOR = 'primary-text-color';

export class EmoticonsDropdown extends DropdownHover {
  public lazyLoadQueue = new LazyLoadQueue(1);

  private container: HTMLElement;
  private tabsEl: HTMLElement;
  private tabId = -1;

  private tabs: {[id: number]: EmoticonsTab};

  private searchButton: HTMLElement;
  private deleteBtn: HTMLElement;

  private selectTab: ReturnType<typeof horizontalMenu>;

  private savedRange: Range;
  private tabsToRender: EmoticonsTab[] = [];
  private managers: AppManagers;

  private rights: {[action in ChatRights]?: boolean};

  private listenerSetter: ListenerSetter;

  private _chatInput: ChatInput;
  public textColor: string;

  public isStandalone: boolean;

  constructor(options: {
    customParentElement?: HTMLElement,
    // customAnchorElement?: HTMLElement,
    getOpenPosition?: () => DOMRectEditable,
    tabsToRender?: EmoticonsTab[],
    customOnSelect?: (emoji: {element: HTMLElement} & ReturnType<typeof getEmojiFromElement>) => void,
  } = {}) {
    super({
      element: renderEmojiDropdownElement(),
      ignoreOutClickClassName: 'input-message-input'
    });
    safeAssign(this, options);

    this.listenerSetter = new ListenerSetter();
    this.isStandalone = !!options?.tabsToRender;
    this.element.classList.toggle('is-standalone', this.isStandalone)

    this.rights = {
      send_gifs: undefined,
      send_stickers: undefined
    };

    this.addEventListener('open', async() => {
      if(IS_TOUCH_SUPPORTED) {
        // this.chatInput.saveScroll();
        if(blurActiveElement()) {
          await pause(100);
        }
      }

      if(options.getOpenPosition) {
        const rect = options.getOpenPosition();
        this.element.style.setProperty('--top', rect.top + 'px');
        this.element.style.setProperty('--left', rect.left + 'px');
      }/*  else if(options.customAnchorElement) {
        const anchorRect = options.customAnchorElement.getBoundingClientRect();
        const offset = 64;
        this.element.style.left = anchorRect.left + 'px' as string;
        this.element.style.bottom = anchorRect.top + offset + 'px' as string;
      } */

      if(options.customParentElement) {
        options.customParentElement.append(this.element);
      } else if(this.element.parentElement !== this.chatInput.chatInput) {
        this.chatInput.chatInput.append(this.element);
      }

      this.savedRange = this.getGoodRange();

      this.lazyLoadQueue.lock();
      // this.lazyLoadQueue.unlock();
      animationIntersector.lockIntersectionGroup(EMOTICONSSTICKERGROUP);

      const tab = this.tab;
      tab.onOpen?.();
    });

    this.addEventListener('opened', () => {
      animationIntersector.unlockIntersectionGroup(EMOTICONSSTICKERGROUP);
      this.lazyLoadQueue.unlockAndRefresh();

      // this.container.classList.remove('disable-hover');

      const tab = this.tab;
      tab.onOpened?.();
    });

    this.addEventListener('openAfterLayout', () => {
      if(options.getOpenPosition) {
        this.element.style.setProperty('--width', this.element.offsetWidth + 'px');
      }
    });

    this.addEventListener('close', () => {
      this.lazyLoadQueue.lock();

      // нужно залочить группу и выключить стикеры
      animationIntersector.lockIntersectionGroup(EMOTICONSSTICKERGROUP);
      animationIntersector.checkAnimations(true, EMOTICONSSTICKERGROUP);

      const tab = this.tab;
      tab.onClose?.();
    });

    this.addEventListener('closed', () => {
      // теперь можно убрать visible, чтобы они не включились после фокуса
      animationIntersector.unlockIntersectionGroup(EMOTICONSSTICKERGROUP);
      this.lazyLoadQueue.unlock();
      this.lazyLoadQueue.refresh();

      // this.container.classList.remove('disable-hover');

      this.savedRange = undefined;

      const tab = this.tab;
      tab.onClosed?.();
    });
  }

  public canUseEmoji(emoji: AppEmoji, showToast?: boolean) {
    this.init?.();
    return this.getTab(EmojiTab).canUseEmoji(emoji, undefined, showToast);
  }

  public get tab() {
    return this.tabs[this.tabId];
  }

  public get chatInput() {
    return this._chatInput || appImManager.chat.input;
  }

  public set chatInput(chatInput: ChatInput) {
    const changed = this._chatInput !== chatInput;
    this._chatInput = chatInput;
    if(!this.init && changed && this.chatInput !== undefined) {
      this.checkRights();
    }
  }

  public get intersectionOptions(): IntersectionObserverInit {
    return {root: this.getElement()};
  }

  public setTextColor(textColor: string = EMOJI_TEXT_COLOR) {
    this.textColor = textColor;
    this.getTab(EmojiTab)?.setTextColor(textColor);
  }

  public getTab<T extends EmoticonsTab>(instance: EmoticonsTabConstructable<T>) {
    return this.tabsToRender.find((tab) => tab instanceof instance) as T;
  }

  public init() {
    this.managers = rootScope.managers;

    if(!this.tabsToRender.length) {
      this.tabsToRender = [
        new EmojiTab({managers: this.managers, preloaderDelay: 200}),
        new StickersTab(this.managers),
        new GifsTab({managers: this.managers})
      ];
    }

    this.tabs = {};
    this.tabsToRender.forEach((tab, idx) => {
      (tab as EmojiTab).emoticonsDropdown = this;
      tab.tabId = idx;
      this.tabs[idx] = tab;
    });

    this.container = this.element.querySelector('.emoji-container .tabs-container') as HTMLDivElement;
    this.container.prepend(...this.tabsToRender.map((tab) => (tab as EmojiTab).container));
    this.tabsEl = this.element.querySelector('.emoji-tabs') as HTMLUListElement;

    this.selectTab = horizontalMenu(this.tabsEl, this.container, this.onSelectTabClick, () => {
      const {tab} = this;
      tab.init?.();
      animationIntersector.checkAnimations(false, EMOTICONSSTICKERGROUP);
    });

    this.searchButton = this.element.querySelector('.emoji-tabs-search');
    this.listenerSetter.add(this.searchButton)('click', () => {
      if(this.tabId === this.getTab(StickersTab)?.tabId) {
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
      const input = this.chatInput.messageInput;
      // RichInputHandler.getInstance().makeFocused(this.chatInput.messageInput);
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

      this.chatInput.messageInputField.simulateInputEvent();
    }, {listenerSetter: this.listenerSetter});

    const HIDE_EMOJI_TAB = IS_APPLE_MOBILE && false;

    const INIT_TAB_ID = HIDE_EMOJI_TAB ? this.getTab(StickersTab).tabId : this.getTab(EmojiTab).tabId;

    if(HIDE_EMOJI_TAB) {
      (this.tabsEl.children[1] as HTMLElement).classList.add('hide');
    }

    simulateClickEvent(this.tabsEl.children[INIT_TAB_ID + 1] as HTMLElement);
    if(this.tabsToRender.length <= 1) {
      this.tabsEl.classList.add('hide');
    }
    this.tabs[INIT_TAB_ID].init?.(); // onTransitionEnd не вызовется, т.к. это первая открытая вкладка

    if(!IS_TOUCH_SUPPORTED) {
      let lastMouseMoveEvent: MouseEvent, mouseMoveEventAttached = false;
      const onMouseMove = (e: MouseEvent) => {
        lastMouseMoveEvent = e;
      };
      this.listenerSetter.add(overlayCounter)('change', (isActive) => {
        if(isActive) {
          if(!mouseMoveEventAttached) {
            this.listenerSetter.add(document.body)('mousemove', onMouseMove);
            mouseMoveEventAttached = true;
          }
        } else if(mouseMoveEventAttached) {
          this.listenerSetter.removeManual(document.body, 'mousemove', onMouseMove);
          if(lastMouseMoveEvent) {
            this.onMouseOut(lastMouseMoveEvent);
          }
        }
      });
    }

    const onPeerChanging = () => {
      if(this._chatInput || this.isStandalone) {
        return;
      }

      this.toggle(false);
    };

    const onPeerChanged = () => {
      if(this._chatInput || this.isStandalone) {
        return;
      }

      this.checkRights();
    };

    this.listenerSetter.add(appImManager)('peer_changing', onPeerChanging);
    this.listenerSetter.add(appImManager)('peer_changed', onPeerChanged);
    onPeerChanged();

    const ret = super.init();
    this.init = undefined;
    return ret;
  }

  public getElement() {
    return this.element;
  }

  public scrollTo(tab: EmoticonsTab, element: HTMLElement) {
    tab.scrollable.scrollIntoViewNew({
      element: element as HTMLElement,
      axis: 'y',
      position: 'start',
      getElementPosition: tab.scrollable.container === element ? () => -element.scrollTop : undefined,
      ...scrollOptions
    });
  }

  private onSelectTabClick = (id: number) => {
    if(this.tabId === id) {
      const {tab} = this;
      this.scrollTo(tab, tab.scrollable.container as HTMLElement);
      return;
    }

    const rights: {[tabId: number]: ChatRights} = {
      ...(this.getTab(StickersTab) && {[this.getTab(StickersTab).tabId]: 'send_stickers'}),
      ...(this.getTab(GifsTab) && {[this.getTab(GifsTab).tabId]: 'send_gifs'})
    };

    const action = rights[id];
    if(action && !this.rights[action]) {
      toastNew({langPackKey: POSTING_NOT_ALLOWED_MAP[action]});
      return false;
    }

    animationIntersector.checkAnimations(true, EMOTICONSSTICKERGROUP);

    this.tabId = id;
    this.searchButton.classList.toggle('hide', this.tabId === this.getTab(EmojiTab)?.tabId);
    this.deleteBtn.classList.toggle('hide', this.tabId !== this.getTab(EmojiTab)?.tabId);
  };

  private checkRights = async() => {
    const {peerId, threadId} = this.chatInput.chat;

    const actions = Object.keys(this.rights) as ChatRights[];

    const rights = await Promise.all(actions.map((action) => {
      return this.managers.appMessagesManager.canSendToPeer(peerId, threadId, action);
    }));

    actions.forEach((action, idx) => {
      this.rights[action] = rights[idx];
    });

    const emojiTab = this.getTab(EmojiTab);
    const active = this.tabsEl.querySelector('.active');
    if(active && whichChild(active) !== (emojiTab?.tabId + 1) && (!this.rights['send_stickers'] || !this.rights['send_gifs'])) {
      this.selectTab(emojiTab.tabId, false);
    }

    emojiTab?.toggleCustomCategory();
  };

  public static menuOnClick = (
    emoticons: EmojiTab | StickersTab,
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
            element: prevTab.menuScroll.firstElementChild as HTMLElement,
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

      emoticons.scrollable.scrollPosition = tab.elements.container.offsetTop + 1;
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

      if(Math.abs(jumpedTo - scrollable.scrollPosition) <= 1) {
        return;
      } else {
        jumpedTo = -1;
      }

      const tab = emoticons.getCategoryByContainer(target);
      if(!tab.elements.menuTab) {
        return;
      }

      const which = whichChild(target);
      if(!stuck && (which || tab.menuScroll)) {
        return;
      }

      setActive(tab);
    });

    attachClickEvent(menu, (e) => {
      cancelEvent(e);
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
        element: offsetTop ? tab.elements.container : scrollable.firstElementChild as HTMLElement,
        position: 'start',
        axis: 'y',
        getElementPosition: offsetTop ? ({elementPosition}) => elementPosition + additionalOffset : undefined,
        startCallback: () => {
          if(emoticons instanceof EmojiTab && !emoticons.isCategoryVisible(tab as EmojiTabCategory)) {
            emoticons._onCategoryVisibility(tab as EmojiTabCategory, true);
          }
        },
        ...scrollOptions
      }).finally(() => {
        setActive(tab);
        scrollingToContent = false;
      });
    }, {listenerSetter});

    const a = scrollable.onAdditionalScroll ? scrollable.onAdditionalScroll.bind(scrollable) : noop;
    scrollable.onAdditionalScroll = () => {
      emoticons.content.parentElement.classList.toggle('no-border-top',
        scrollable.scrollPosition <= 0 ||
        emoticons.container.classList.contains('is-searching')
      );
      a();
    };

    emoticons.content.parentElement.classList.add('no-border-top');

    return {stickyIntersector, setActive, setActiveStatic};
  };

  public onMediaClick = async(e: {target: EventTarget | Element}, clearDraft = false, silent?: boolean, ignoreNoPremium?: boolean) => {
    const target = findUpTag(e.target as HTMLElement, 'DIV');
    if(!target) return false;

    const docId = target.dataset.docId;
    if(!docId) return false;

    return this.sendDocId({document: docId, clearDraft, silent, target, ignoreNoPremium});
  };

  public async sendDocId(options: Parameters<ChatInput['sendMessageWithDocument']>[0]) {
    if(await this.chatInput.sendMessageWithDocument(options)) {
      /* dropdown.classList.remove('active');
      toggleEl.classList.remove('active'); */
      if(emoticonsDropdown.container) {
        emoticonsDropdown.forceClose = true;
        // emoticonsDropdown.container.classList.add('disable-hover');
        emoticonsDropdown.toggle(false);
      }

      return true;
    } else {
      console.warn('got no doc by id:', document);
      return false;
    }
  }

  public addLazyLoadQueueRepeat(lazyLoadQueue: LazyLoadQueueIntersector, processInvisibleDiv: (div: HTMLElement) => void, middleware: Middleware) {
    const listenerSetter = new ListenerSetter();
    listenerSetter.add(this)('close', () => {
      lazyLoadQueue.lock();
    });

    listenerSetter.add(this)('closed', () => {
      const divs = lazyLoadQueue.intersector.getVisible();

      for(const div of divs) {
        processInvisibleDiv(div);
      }

      lazyLoadQueue.intersector.clearVisible();
    });

    listenerSetter.add(this)('opened', () => {
      lazyLoadQueue.unlockAndRefresh();
    });

    middleware.onClean(() => {
      listenerSetter.removeAll();
    });
  }

  public getSavedRange() {
    return this.getGoodRange() || this.savedRange;
  }

  private getGoodRange() {
    const sel = document.getSelection();
    if(sel.rangeCount && document.activeElement === this.chatInput.messageInput) {
      return sel.getRangeAt(0);
    }
  }

  public destroy() {
    this.cleanup();
    this.listenerSetter.removeAll();
    this.tabsToRender.forEach((tab) => (tab as EmojiTab).destroy?.());
    this.element.remove();
  }

  public hideAndDestroy() {
    return this.toggle(false).then(() => {
      return this.destroy();
    });
  }
}

const emoticonsDropdown = new EmoticonsDropdown();
MOUNT_CLASS_TO.emoticonsDropdown = emoticonsDropdown;
export default emoticonsDropdown;
