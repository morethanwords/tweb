/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import Scrollable from '@components/scrollable';
import InputSearch from '@components/inputSearch';
import SettingSection from '@components/settingSection';
import PeerTitle from '@components/peerTitle';
import {avatarNew} from '@components/avatarNew';
import Icon from '@components/icon';
import Tabs from '@components/tabs';
import {observeResize} from '@components/resizeObserver';
import replaceContent from '@helpers/dom/replaceContent';
import findUpClassName from '@helpers/dom/findUpClassName';
import {attachClickEvent} from '@helpers/dom/clickEvent';
import liteMode from '@helpers/liteMode';
import {FocusDirection} from '@helpers/fastSmoothScroll';
import {Middleware, MiddlewareHelper} from '@helpers/middleware';

export default class SelectorSearch {
  public section: SettingSection;
  public selectedContainer: HTMLElement;
  public inputSearch: InputSearch;
  public input: HTMLInputElement;
  public gradient: HTMLElement;
  private selectedScrollable: Scrollable;
  private capturedRects: Map<HTMLElement, DOMRect>;
  private flipElements: Set<HTMLElement>;
  private middlewareHelper: MiddlewareHelper;
  private chipsMap: Map<string, HTMLElement>;

  constructor(options: {
    middlewareHelper: MiddlewareHelper,
    multiSelect: boolean,
    onInput: () => void,
    onChipClick: (key: string | PeerId) => void
  }) {
    this.middlewareHelper = options.middlewareHelper;
    this.chipsMap = new Map();
    this.flipElements = new Set();

    this.inputSearch = new InputSearch({
      placeholder: 'Search',
      onChange: options.onInput,
      debounceTime: 200,
      noBorder: true,
      noFocusEffect: true,
      noPlaceholderAnimation: true
    });
    this.input = this.inputSearch.input;
    this.inputSearch.container.classList.add('selector-search-input-container');
    this.input.classList.add('selector-search-input');
    this.inputSearch.clearBtn.remove();

    const section = this.section = new SettingSection({});
    section.innerContainer.classList.add('selector-search-section');
    section.container.classList.add('selector-search-section-container');
    const topContainer = document.createElement('div');
    topContainer.classList.add('selector-search-container');

    this.selectedContainer = document.createElement('div');
    this.selectedContainer.classList.add('selector-search');

    this.selectedContainer.append(this.inputSearch.container);
    this.flipElements.add(this.inputSearch.container);
    topContainer.append(this.selectedContainer);
    this.selectedScrollable = new Scrollable(topContainer);

    this.setupHeightAnimation();

    if(options.multiSelect) attachClickEvent(this.selectedContainer, (e) => {
      let target = e.target as HTMLElement;
      target = findUpClassName(target, 'selector-user');
      if(!target) return;
      let key: string | PeerId = target.dataset.key;
      key = key.isPeerId() ? key.toPeerId() : key;
      options.onChipClick(key);
    });

    section.content.append(topContainer);

    this.gradient = Tabs.MenuGradient({
      color: 'background',
      className: 'selector-search-gradient',
      smaller: true
    }) as HTMLElement;
  }

  private setupHeightAnimation() {
    if(!liteMode.isAvailable('animations')) return;

    let prevHeight = 0;
    let isAnimating = false;
    const el = this.selectedContainer;
    const unobserve = observeResize(el, () => {
      if(isAnimating) return;

      el.style.height = '';
      const targetHeight = el.clientHeight;
      if(!prevHeight || targetHeight === prevHeight) {
        prevHeight = targetHeight;
        return;
      }

      if(!targetHeight) {
        prevHeight = targetHeight;
        return;
      }

      isAnimating = true;
      el.style.height = prevHeight + 'px';
      void el.offsetHeight;
      el.style.height = targetHeight + 'px';
      prevHeight = targetHeight;
    });

    el.addEventListener('transitionend', (e) => {
      if(e.target === el && e.propertyName === 'height') {
        isAnimating = false;
        el.style.height = '';
      }
    });

    this.middlewareHelper.get().onDestroy(unobserve);
  }

  private captureChildRects(exclude?: HTMLElement) {
    if(!liteMode.isAvailable('animations')) return;
    this.capturedRects = new Map();
    for(const el of this.flipElements) {
      if(el !== exclude) {
        this.capturedRects.set(el, el.getBoundingClientRect());
      }
    }
  }

  private animateChildrenFlip(exclude?: HTMLElement) {
    const rects = this.capturedRects;
    if(!rects) return;
    this.capturedRects = undefined;

    const toAnimate: HTMLElement[] = [];
    for(const [el, prevRect] of rects) {
      if(el === exclude) {
        continue;
      }

      const newRect = el.getBoundingClientRect();
      const dx = prevRect.left - newRect.left;
      const dy = prevRect.top - newRect.top;
      if(!dx && !dy) continue;

      el.style.transition = 'none';
      el.style.transform = `translate(${dx}px, ${dy}px)`;
      toAnimate.push(el);
    }

    if(!toAnimate.length) return;
    void this.selectedContainer.offsetHeight;
    for(const el of toAnimate) {
      el.style.transition = '';
      el.style.transform = '';
    }
  }

  public addChip({key, middleware, title, scroll = true, avatarSize = 30, fallbackIcon}: {
    key: PeerId | string,
    middleware: Middleware,
    title?: string | HTMLElement,
    scroll?: boolean,
    avatarSize?: number,
    fallbackIcon?: Icon
  }) {
    const rendered = SelectorSearch.renderEntity({
      key,
      middleware,
      title,
      avatarSize,
      fallbackIcon
    });
    const {element, promises} = rendered;

    const keyStr = '' + key;
    this.chipsMap.set(keyStr, element);

    const insert = () => {
      if(this.chipsMap.get(keyStr) !== element) {
        return;
      }

      if(scroll) {
        element.classList.add('scale-in');
        element.addEventListener('animationend', () => {
          element.classList.remove('scale-in');
        }, {once: true});
      }

      const prevLast = this.inputSearch.container.previousElementSibling as HTMLElement;
      if(prevLast?.classList.contains('selector-user')) {
        prevLast.classList.remove('is-last');
      }
      element.classList.add('is-last');

      this.captureChildRects();
      this.flipElements.add(element);
      this.inputSearch.container.before(element);
      this.animateChildrenFlip();

      if(scroll) {
        this.selectedScrollable.scrollIntoViewNew({
          element: this.inputSearch.container,
          position: 'center'
        });
      }
    };

    if(promises.length) {
      Promise.all(promises).then(insert);
    } else {
      insert();
    }

    return rendered;
  }

  public removeChip(key: PeerId | string, onRemoved?: () => void) {
    const keyStr = '' + key;
    const div = this.chipsMap.get(keyStr) as HTMLElement;
    const cleanup = () => {
      if(div) {
        div.remove();
        div.middlewareHelper.destroy();
      }

      onRemoved?.();
    };

    this.chipsMap.delete(keyStr);
    if(div) this.flipElements.delete(div);

    if(!div?.parentElement) {
      cleanup();
      return;
    }

    const animate = liteMode.isAvailable('animations');
    const wasLast = div.classList.contains('is-last');

    if(animate) {
      this.captureChildRects(div);
      const chipRect = div.getBoundingClientRect();
      const containerRect = this.selectedContainer.getBoundingClientRect();
      const scrollEl = this.selectedScrollable.container;
      const scrollBefore = scrollEl.scrollTop;

      // Take chip out of flex flow so layout reflows immediately
      div.classList.remove('scale-in', 'is-last');
      div.style.position = 'absolute';
      div.style.left = (chipRect.left - containerRect.left) + 'px';

      const initialTop = chipRect.top - containerRect.top;
      const scrollDelta = scrollBefore - scrollEl.scrollTop;

      if(scrollDelta) {
        // Start at old visual position (compensated), then smoothly
        // transition to the new position — matching the FLIP animation of neighbors
        div.style.top = (initialTop - scrollDelta) + 'px';
        void div.offsetHeight;
        div.style.transition = 'top .15s ease';
        div.style.top = initialTop + 'px';
      } else {
        div.style.top = initialTop + 'px';
      }
    } else {
      div.classList.remove('scale-in');
      cleanup();
    }

    if(wasLast) {
      const newLast = (animate ? div : this.inputSearch.container).previousElementSibling as HTMLElement;
      if(newLast?.classList.contains('selector-user')) {
        newLast.classList.add('is-last');
      }
    }

    if(animate) {
      void div.offsetWidth;
      div.classList.add('scale-out');
      this.animateChildrenFlip();

      div.addEventListener('animationend', cleanup, {once: true});
    }
  }

  public clearInput() {
    this.inputSearch.value = '';
  }

  public get value() {
    return this.inputSearch.value;
  }

  public scrollToInput(forceDirection?: FocusDirection) {
    this.selectedScrollable.scrollIntoViewNew({
      element: this.inputSearch.container,
      position: 'center',
      forceDirection
    });
  }

  public destroy() {
    this.inputSearch.remove();
  }

  public static renderEntity({key, middleware, title, avatarSize, fallbackIcon, meAsSaved = true}: {
    key: PeerId | string,
    middleware: Middleware,
    title?: string | HTMLElement,
    avatarSize: number,
    fallbackIcon?: Icon,
    meAsSaved?: boolean
  }) {
    const div = document.createElement('div');
    div.classList.add('selector-user');
    div.middlewareHelper = middleware.create();

    const avatarContainer = document.createElement('div');
    avatarContainer.classList.add('selector-user-avatar-container');
    const avatarClose = document.createElement('div');
    avatarClose.classList.add('selector-user-avatar-close');
    avatarClose.append(Icon('close'));
    const avatarEl = avatarNew({
      middleware: div.middlewareHelper.get(),
      size: avatarSize,
      isDialog: meAsSaved
    });
    avatarEl.node.classList.add('selector-user-avatar');
    avatarContainer.append(avatarEl.node, avatarClose);

    const keyStr = '' + key;
    let threadId: number;
    if(keyStr.includes('_')) {
      const [_peerId, _threadId] = keyStr.split('_');
      key = _peerId.toPeerId();
      threadId = +_threadId;
    }

    div.dataset.key = keyStr;
    const promises: Promise<any>[] = [];
    if(key.isPeerId()) {
      if(title === undefined) {
        const peerTitle = new PeerTitle();
        promises.push(peerTitle.update({peerId: key.toPeerId(), threadId, dialog: meAsSaved}));
        title = peerTitle.element;
      }

      avatarEl.render({
        peerId: key.toPeerId(),
        threadId
      });

      promises.push(avatarEl.readyThumbPromise);
    } else if(fallbackIcon) {
      avatarEl.setIcon(fallbackIcon);
    }

    if(title) {
      const t = document.createElement('div');
      t.classList.add('selector-user-title');
      if(typeof(title) === 'string') {
        t.innerHTML = title;
      } else {
        replaceContent(t, title);
        t.append(title);
      }
      div.append(t);
    }

    div.insertAdjacentElement('afterbegin', avatarContainer);

    return {element: div, avatar: avatarEl, promises};
  }
}
