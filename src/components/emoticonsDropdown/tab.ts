/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import {EmoticonsTab, EmoticonsDropdown, EMOTICONSSTICKERGROUP, EMOJI_TEXT_COLOR} from '.';
import createStickersContextMenu from '../../helpers/dom/createStickersContextMenu';
import customProperties from '../../helpers/dom/customProperties';
import positionElementByIndex from '../../helpers/dom/positionElementByIndex';
import {IgnoreMouseOutType} from '../../helpers/dropdownHover';
import ListenerSetter from '../../helpers/listenerSetter';
import {MiddlewareHelper, getMiddleware, Middleware} from '../../helpers/middleware';
import safeAssign from '../../helpers/object/safeAssign';
import Animated from '../../helpers/solid/animations';
import windowSize from '../../helpers/windowSize';
import {EmojiGroup, StickerSet} from '../../layer';
import {AppManagers} from '../../lib/appManagers/managers';
import {LangPackKey, i18n} from '../../lib/langPack';
import {AnyFunction} from '../../types';
import {createSignal, createMemo, createResource, createEffect, untrack} from 'solid-js';
import {render, Portal} from 'solid-js/web';
import Icon from '../icon';
import Scrollable, {ScrollableX} from '../scrollable';
import attachStickerViewerListeners from '../stickerViewer';
import VisibilityIntersector from '../visibilityIntersector';
import StickersTabCategory, {EmoticonsTabStyles, StickersTabStyles} from './category';
import EmoticonsSearch from './search';
import wrapStickerSetThumb from '../wrappers/stickerSetThumb';
import wrapEmojiText from '../../lib/richTextProcessor/wrapEmojiText';
import type {MyDocument} from '../../lib/appManagers/appDocsManager';
import SuperStickerRenderer from './tabs/SuperStickerRenderer';

export default class EmoticonsTabC<Category extends StickersTabCategory<any, any>, T = any> implements EmoticonsTab {
  public content: HTMLElement;
  public menuScroll: ScrollableX;
  public container: HTMLElement;
  public menuWrapper: HTMLElement;
  public menu: HTMLElement;
  public emoticonsDropdown: EmoticonsDropdown;

  protected categories: {[id: string]: Category};
  protected categoriesMap: Map<HTMLElement, Category>;
  protected categoriesByMenuTabMap: Map<HTMLElement, Category>;
  protected categoriesIntersector: VisibilityIntersector;
  protected categoriesContainer: HTMLElement;
  protected localCategories: Category[];

  protected listenerSetter: ListenerSetter;

  public scrollable: Scrollable;
  protected mounted = false;
  protected menuOnClickResult: ReturnType<typeof EmoticonsDropdown['menuOnClick']>;

  public tabId: number;

  protected postponedEvents: {cb: AnyFunction, args: any[]}[];

  public getContainerSize: Category['getContainerSize'];

  public middlewareHelper: MiddlewareHelper;
  private disposeSearch: () => void;

  public managers: AppManagers;
  protected noMenu: boolean;
  protected searchFetcher?: (value: string) => Promise<T>;
  protected groupFetcher?: (group: EmojiGroup) => Promise<T>;
  protected processSearchResult?: (result: {data: T, searching: boolean, grouping: boolean}) => Promise<HTMLElement>;
  protected searchNoLoader: boolean;
  protected searchPlaceholder?: LangPackKey;
  protected searchType: Parameters<typeof EmoticonsSearch>[0]['type'];

  constructor(options: {
    managers: AppManagers,
    noMenu?: boolean,
    searchFetcher?: EmoticonsTabC<Category, T>['searchFetcher'],
    groupFetcher?: EmoticonsTabC<Category, T>['groupFetcher'],
    processSearchResult?: EmoticonsTabC<Category, T>['processSearchResult'],
    searchNoLoader?: boolean,
    searchPlaceholder?: LangPackKey,
    searchType?: Parameters<typeof EmoticonsSearch>[0]['type']
  }) {
    safeAssign(this, options);
    this.categories = {};
    this.categoriesMap = new Map();
    this.categoriesByMenuTabMap = new Map();
    this.localCategories = [];
    this.postponedEvents = [];

    this.listenerSetter = new ListenerSetter();
    this.middlewareHelper = getMiddleware();

    this.container = document.createElement('div');
    this.container.classList.add('tabs-tab', 'emoticons-container');

    if(this.noMenu) {
      this.container.classList.add('no-menu');
    } else {
      this.createMenu();
    }

    this.content = document.createElement('div');
    this.content.classList.add('emoticons-content');

    this.container.append(...[this.menuWrapper, this.content].filter(Boolean));

    this.scrollable = new Scrollable(this.content, 'STICKERS');

    this.categoriesContainer = document.createElement('div');
    this.categoriesContainer.classList.add('emoticons-categories-container');

    if(!this.noMenu) {
      this.scrollable.container.classList.add('emoticons-will-move-up');
      this.categoriesContainer.classList.add('emoticons-will-move-down');
    }

    if(options.searchFetcher) {
      this.createSearch();
    } else {
      this.scrollable.append(this.categoriesContainer);
    }
  }

  private createMenu() {
    this.menuWrapper = document.createElement('div');
    this.menuWrapper.classList.add('menu-wrapper', 'emoticons-menu-wrapper', 'emoticons-will-move-up');

    this.menu = document.createElement('nav');
    this.menu.className = 'menu-horizontal-div no-stripe justify-start emoticons-menu';

    this.menuWrapper.append(this.menu);
    this.menuScroll = new ScrollableX(this.menuWrapper);
  }

  private createSearch() {
    const searchContainer = document.createElement('div');
    searchContainer.classList.add('emoticons-search-container');
    if(!this.noMenu) searchContainer.classList.add('emoticons-will-move-down');
    this.scrollable.append(searchContainer);
    this.categoriesContainer.classList.add('emoticons-has-search');
    this.disposeSearch = render(() => {
      const [query, setQuery] = createSignal('');
      const [group, setGroup] = createSignal<EmojiGroup>();
      const [focused, setFocused] = createSignal(false);
      const searching = createMemo(() => !!query());

      const [loadedData, setLoadedData] = createSignal<T>();
      const [data] = createResource(query, this.searchFetcher);
      const [groupData] = this.groupFetcher ? createResource(group, this.groupFetcher) : [];
      const [element] = createResource(() => {
        return {
          data: loadedData(),
          grouping: !!untrack(group),
          searching: untrack(searching)
        };
      }, this.processSearchResult);

      const loading = this.searchNoLoader ? undefined : createMemo(() => searching() && element.loading);
      const shouldMoveSearch = createMemo(() => focused() || searching() || !!group());
      const shouldUseContainer = createMemo(() => element() || this.categoriesContainer);

      Portal({
        mount: this.scrollable.container,
        children: Animated({
          type: 'cross-fade',
          get children() {
            return shouldUseContainer();
          }
        })
      });

      createEffect(() => {
        const useData = group() ? groupData : data;
        if(!useData.loading) {
          setLoadedData(() => useData());
        }
      });

      createEffect(() => {
        this.container.classList.toggle('is-searching', shouldMoveSearch());
      });

      return EmoticonsSearch({
        type: this.searchType,
        placeholder: this.searchPlaceholder,
        loading,
        onValue: setQuery,
        onFocusChange: setFocused,
        onGroup: this.groupFetcher ? setGroup : undefined
      });
    }, searchContainer);
  }

  public getCategoryByContainer(container: HTMLElement) {
    return this.categoriesMap.get(container);
  }

  public getCategoryByMenuTab(menuTab: HTMLElement) {
    return this.categoriesByMenuTabMap.get(menuTab);
  }

  public createCategory({
    stickerSet,
    title,
    isLocal,
    noMenuTab = !stickerSet,
    styles
  }: {
    stickerSet?: StickerSet,
    title?: HTMLElement | DocumentFragment,
    isLocal?: boolean,
    noMenuTab?: boolean,
    styles: StickersTabStyles
  }) {
    if(this.noMenu) {
      noMenuTab = true;
    }

    const category: Category = new StickersTabCategory({
      id: '' + stickerSet?.id,
      title,
      overflowElement: this.content,
      getContainerSize: () => {
        let width: number, height: number;
        if(this.getContainerSize) {
          const size = this.getContainerSize();
          width = size.width;
          height = size.height;
        } else {
          const element = this.emoticonsDropdown.getElement();
          const propertyWidth = element.style.getPropertyValue('--width');
          width = propertyWidth ? parseInt(propertyWidth) : element.offsetWidth;
          // const esgWidth = customProperties.getPropertyAsSize('esg-width');
          // width = esgWidth === undefined ? windowSize.width : esgWidth;
        }

        return {width: width - styles.padding, height};
      },
      styles,
      noMenuTab,
      middleware: this.middlewareHelper.get()
    }) as any;

    if(styles.itemsClassName) {
      category.elements.items.classList.add(styles.itemsClassName);
    }

    const container = category.elements.container;
    container.classList.add('hide');

    if(stickerSet) {
      category.set = stickerSet;
      this.categories[stickerSet.id] = category;
      this.categoriesMap.set(container, category);
      this.categoriesIntersector.observe(container);
    }

    if(!noMenuTab) {
      this.categoriesByMenuTabMap.set(category.elements.menuTab, category);
      this.menuOnClickResult.stickyIntersector.observeStickyHeaderChanges(container);
      !isLocal && category.elements.menuTab.classList.add('not-local');
    }

    return category;
  }

  public positionCategory(category: Category, prepend?: boolean) {
    const {menuTab, container} = category.elements;
    const posItems = prepend ? this.localCategories.filter((category) => category.mounted).length : 0xFFFF;
    let foundMenuScroll = false;
    const posMenu = prepend ? this.localCategories.filter((category) => {
      if(category.menuScroll && !foundMenuScroll) {
        foundMenuScroll = true;
        return true;
      }

      return category.mounted && !category.menuScroll && category.elements.menuTab;
    }).length : 0xFFFF;
    positionElementByIndex(container, this.categoriesContainer, posItems);
    positionElementByIndex(menuTab, this.menu, posMenu);
  }

  public isCategoryVisible(category: Category) {
    return this.categoriesIntersector.isVisible(category.elements.container);
  }

  protected toggleLocalCategory(category: Category, visible: boolean) {
    if(!visible) {
      category.elements.menuTab?.remove();
      category.elements.container.remove();
    } else {
      const idx = this.localCategories.indexOf(category);
      const sliced = this.localCategories.slice(0, idx);
      let notMountedItems = 0, notMountedMenus = 0;
      sliced.forEach((category) => {
        if(!category.mounted) {
          ++notMountedItems;
          ++notMountedMenus;
        } else if(!category.elements.menuTab || category.menuScroll) {
          ++notMountedMenus;
        }
      });
      const itemsIdx = idx - notMountedItems, menuIdx = idx - notMountedMenus;
      category.elements.menuTab && positionElementByIndex(category.elements.menuTab, this.menu, menuIdx);
      positionElementByIndex(category.elements.container, this.categoriesContainer, itemsIdx);
    }

    category.mounted = visible;
    // category.elements.container.classList.toggle('hide', !visible);
  }

  protected createLocalCategory({
    id,
    title,
    icon,
    noMenuTab,
    styles
  }: {
    id?: string,
    title: LangPackKey | '',
    icon?: Icon,
    noMenuTab?: boolean,
    styles: StickersTabStyles
  }) {
    if(this.noMenu) {
      noMenuTab = true;
    }

    const hasId = id !== undefined;

    const category = this.createCategory({
      stickerSet: hasId ? {id} as any : undefined,
      title: title && i18n(title),
      isLocal: true,
      noMenuTab,
      styles
    });
    category.local = true;
    hasId && this.localCategories.push(category);
    if(category.elements.title) {
      category.elements.title.classList.add('disable-hover');
    }

    if(category.elements.menuTab) {
      if(icon) {
        category.elements.menuTab.append(Icon(icon));
      }

      category.elements.menuTabPadding.remove();
    }

    this.toggleLocalCategory(category, false);
    return category;
  }

  protected onLocalCategoryUpdate(category: Category) {
    category.setCategoryItemsHeight();
    this.toggleLocalCategory(category, !!category.items.length);
  }

  protected resizeCategories = () => {
    for(const [container, category] of this.categoriesMap) {
      category.setCategoryItemsHeight();
    }
  };

  protected deleteCategory(category: Category) {
    if(category) {
      category.elements.container.remove();
      category.elements.menuTab?.remove();
      this.categoriesIntersector.unobserve(category.elements.container);
      delete this.categories[category.id];
      this.categoriesMap.delete(category.elements.container);
      this.categoriesByMenuTabMap.delete(category.elements.menuTab);
      category.middlewareHelper.destroy();

      return true;
    }

    return false;
  }

  protected spliceExceed(category: Category) {
    if(category.limit === undefined) {
      return false;
    }

    const {items, limit} = category;
    items.splice(limit, items.length - limit).forEach(({element}) => {
      element.remove();
    });

    this.onLocalCategoryUpdate(category);

    return true;
  }

  public init() {
    this.emoticonsDropdown && this.listenerSetter.add(this.emoticonsDropdown)('closed', () => {
      this.postponedEvents.forEach(({cb, args}) => {
        cb(...args);
      });

      this.postponedEvents.length = 0;
    });
  }

  public destroy() {
    this.getContainerSize = undefined;
    this.postponedEvents.length = 0;
    this.categoriesIntersector?.disconnect();
    this.listenerSetter.removeAll();
    this.scrollable.destroy();
    this.menuScroll?.destroy();
    this.menuOnClickResult?.stickyIntersector?.disconnect();
    this.middlewareHelper.destroy();
    this.disposeSearch?.();
  }

  protected postponedEvent = <K>(cb: (...args: K[]) => void) => {
    return (...args: K[]) => {
      if(this.emoticonsDropdown.isActive()) {
        this.postponedEvents.push({cb, args});
      } else {
        cb(...args);
      }
    };
  };

  protected attachHelpers({getTextColor, verifyRecent, canHaveEmojiTimer, isGif}: {
    getTextColor?: () => string,
    verifyRecent?: (target: HTMLElement) => boolean,
    canHaveEmojiTimer?: boolean,
    isGif?: boolean
  } = {}) {
    attachStickerViewerListeners({
      listenTo: this.content,
      listenerSetter: this.listenerSetter,
      getTextColor
    });

    const type: IgnoreMouseOutType = 'menu';
    createStickersContextMenu({
      listenTo: this.content,
      chatInput: this.emoticonsDropdown.chatInput,
      verifyRecent,
      isEmojis: !!getTextColor,
      isGif,
      canHaveEmojiTimer,
      canViewPack: true,
      onOpen: () => {
        this.emoticonsDropdown.setIgnoreMouseOut(type, true);
      },
      onClose: () => {
        this.emoticonsDropdown.setIgnoreMouseOut(type, false);
      }
    });
  }

  // * common methods for tabs

  public renderStickerSetThumb({set, menuTabPadding, middleware, textColor}: {
    set: StickerSet.stickerSet,
    menuTabPadding: HTMLElement,
    middleware: Middleware,
    textColor?: string
  }) {
    wrapStickerSetThumb({
      set,
      container: menuTabPadding,
      group: EMOTICONSSTICKERGROUP,
      lazyLoadQueue: this.emoticonsDropdown?.lazyLoadQueue,
      width: 32,
      height: 32,
      autoplay: false,
      textColor,
      middleware
    });
  }

  public createStickerRenderer() {
    const superStickerRenderer = new SuperStickerRenderer({
      regularLazyLoadQueue: this.emoticonsDropdown.lazyLoadQueue,
      group: EMOTICONSSTICKERGROUP,
      managers: this.managers,
      intersectionObserverInit: this.emoticonsDropdown.intersectionOptions
    });

    const rendererLazyLoadQueue = superStickerRenderer.lazyLoadQueue;
    this.emoticonsDropdown.addLazyLoadQueueRepeat(
      rendererLazyLoadQueue,
      superStickerRenderer.processInvisible,
      this.middlewareHelper.get()
    );

    return superStickerRenderer;
  }
}
