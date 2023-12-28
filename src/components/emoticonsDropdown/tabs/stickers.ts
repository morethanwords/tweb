/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import {EmoticonsDropdown, EMOTICONSSTICKERGROUP, EmoticonsTab} from '..';
import findUpClassName from '../../../helpers/dom/findUpClassName';
import mediaSizes from '../../../helpers/mediaSizes';
import {Document, MessagesAllStickers, StickerSet} from '../../../layer';
import {MyDocument} from '../../../lib/appManagers/appDocsManager';
import {AppManagers} from '../../../lib/appManagers/managers';
import {i18n, LangPackKey} from '../../../lib/langPack';
import wrapEmojiText from '../../../lib/richTextProcessor/wrapEmojiText';
import rootScope from '../../../lib/rootScope';
import animationIntersector, {AnimationItemGroup} from '../../animationIntersector';
import LazyLoadQueue from '../../lazyLoadQueue';
import LazyLoadQueueRepeat from '../../lazyLoadQueueRepeat';
import {putPreloader} from '../../putPreloader';
import PopupStickers from '../../popups/stickers';
import Scrollable, {ScrollableX} from '../../scrollable';
import findAndSplice from '../../../helpers/array/findAndSplice';
import {attachClickEvent} from '../../../helpers/dom/clickEvent';
import positionElementByIndex from '../../../helpers/dom/positionElementByIndex';
import noop from '../../../helpers/noop';
import ButtonIcon from '../../buttonIcon';
import confirmationPopup from '../../confirmationPopup';
import VisibilityIntersector, {OnVisibilityChangeItem} from '../../visibilityIntersector';
import createStickersContextMenu from '../../../helpers/dom/createStickersContextMenu';
import findUpAsChild from '../../../helpers/dom/findUpAsChild';
import forEachReverse from '../../../helpers/array/forEachReverse';
import attachStickerViewerListeners from '../../stickerViewer';
import ListenerSetter from '../../../helpers/listenerSetter';
import wrapSticker from '../../wrappers/sticker';
import wrapStickerSetThumb from '../../wrappers/stickerSetThumb';
import {MediaSize} from '../../../helpers/mediaSize';
import {AnyFunction} from '../../../types';
import {IgnoreMouseOutType} from '../../../helpers/dropdownHover';
import customProperties from '../../../helpers/dom/customProperties';
import windowSize from '../../../helpers/windowSize';
import PopupElement from '../../popups';
import Icon from '../../icon';
import safeAssign from '../../../helpers/object/safeAssign';
import {getMiddleware, Middleware, MiddlewareHelper} from '../../../helpers/middleware';
import apiManagerProxy from '../../../lib/mtproto/mtprotoworker';
import getStickerEffectThumb from '../../../lib/appManagers/utils/stickers/getStickerEffectThumb';

export class SuperStickerRenderer {
  public lazyLoadQueue: LazyLoadQueueRepeat;
  private animated: Set<HTMLElement> = new Set();
  private regularLazyLoadQueue: LazyLoadQueue;
  private group: AnimationItemGroup;
  private managers: AppManagers;
  private intersectionObserverInit: IntersectionObserverInit;
  private visibleRenderOptions: Partial<Parameters<typeof wrapSticker>[0]>;

  constructor(options: {
    regularLazyLoadQueue: LazyLoadQueue,
    group: AnimationItemGroup,
    managers: AppManagers,
    intersectionObserverInit?: SuperStickerRenderer['intersectionObserverInit'],
    visibleRenderOptions?: SuperStickerRenderer['visibleRenderOptions']
  }) {
    safeAssign(this, options);

    this.lazyLoadQueue = new LazyLoadQueueRepeat(undefined, ({target, visible}) => {
      if(!visible) {
        this.processInvisible(target);
      }
    }, this.intersectionObserverInit);
  }

  public clear() {
    this.lazyLoadQueue.clear();
  }

  public renderSticker(doc: MyDocument, element?: HTMLElement, loadPromises?: Promise<any>[]) {
    if(!element) {
      element = document.createElement('div');
      element.classList.add('grid-item', 'super-sticker');
      element.dataset.docId = '' + doc.id;

      if(doc.animated) {
        this.observeAnimated(element);
      }
    }

    // * This will wrap only a thumb
    /* !doc.animated &&  */wrapSticker({
      doc,
      div: element,
      lazyLoadQueue: this.regularLazyLoadQueue,
      group: this.group,
      onlyThumb: doc.animated,
      loadPromises,
      ...(doc.animated ? {} : this.visibleRenderOptions || {})
    });

    return element;
  }

  public observeAnimated(element: HTMLElement) {
    this.animated.add(element);
    this.lazyLoadQueue.observe({
      div: element,
      load: this.processVisible
    });
  }

  public unobserveAnimated(element: HTMLElement) {
    this.animated.delete(element);
    this.lazyLoadQueue.delete({div: element});
  }

  private checkAnimationContainer = (element: HTMLElement, visible: boolean) => {
    // console.error('checkAnimationContainer', div, visible);
    const players = animationIntersector.getAnimations(element);
    players.forEach((player) => {
      if(!visible) {
        animationIntersector.removeAnimation(player);
      } else {
        animationIntersector.checkAnimation(player, false);
      }
    });
  };

  private processVisible = async(element: HTMLElement) => {
    const docId = element.dataset.docId;
    const doc = await this.managers.appDocsManager.getDoc(docId);

    const size = mediaSizes.active.esgSticker.width;

    // console.log('processVisibleDiv:', element);

    const promise = wrapSticker({
      doc,
      div: element,
      width: size,
      height: size,
      lazyLoadQueue: null,
      group: this.group,
      onlyThumb: false,
      play: true,
      loop: true,
      withLock: true,
      ...(this.visibleRenderOptions || {})
    }).then(({render}) => render);

    promise.then(() => {
      // clearTimeout(timeout);
      this.checkAnimationContainer(element, this.lazyLoadQueue.intersector.isVisible(element));
    });

    /* let timeout = window.setTimeout(() => {
      console.error('processVisibleDiv timeout', div, doc);
    }, 1e3); */

    return promise;
  };

  public processInvisible = async(element: HTMLElement) => {
    const docId = element.dataset.docId;
    const doc = await this.managers.appDocsManager.getDoc(docId);

    // console.log('STICKER INvisible:', /* div,  */docId);

    this.checkAnimationContainer(element, false);

    element.replaceChildren();
    this.renderSticker(doc, element as HTMLDivElement);
  };
}

export type StickersTabCategoryItem = {element: HTMLElement};

export class StickersTabCategory<Item extends StickersTabCategoryItem, AdditionalElements extends Record<string, HTMLElement> = {}> {
  public elements: {
    container: HTMLElement,
    title: HTMLElement,
    items: HTMLElement,
    menuTab: HTMLElement,
    menuTabPadding: HTMLElement
  } & AdditionalElements;
  public items: Item[];
  public mounted: boolean;
  public id: string;
  public limit: number;

  public getContainerSize: () => {width: number, height: number};
  private getElementMediaSize: () => MediaSize;

  private gapX: number;
  private gapY: number;

  public set?: StickerSet;
  public local?: boolean;
  public menuScroll?: ScrollableX;

  public middlewareHelper: MiddlewareHelper;

  constructor(options: {
    id: string,
    title: HTMLElement | DocumentFragment,
    overflowElement: HTMLElement,
    getContainerSize: StickersTabCategory<Item>['getContainerSize'],
    getElementMediaSize: StickersTabCategory<Item>['getElementMediaSize'],
    gapX: number,
    gapY: number,
    noMenuTab?: boolean,
    middleware?: Middleware
  }) {
    const container = document.createElement('div');
    container.classList.add('emoji-category');

    const items = document.createElement('div');
    items.classList.add('category-items');

    let title: HTMLElement;
    if(options.title) {
      title = document.createElement('div');
      title.classList.add('category-title');
      title.append(options.title);
    }

    let menuTab: HTMLElement, menuTabPadding: HTMLElement;
    if(!options.noMenuTab) {
      menuTab = ButtonIcon(undefined, {noRipple: true});
      menuTab.classList.add('menu-horizontal-div-item');

      menuTabPadding = document.createElement('div');
      menuTabPadding.classList.add('menu-horizontal-div-item-padding');

      menuTab.append(menuTabPadding);
    }

    if(title) container.append(title);
    container.append(items);

    this.elements = {
      container,
      title,
      items,
      menuTab,
      menuTabPadding
    } as any;
    this.id = options.id;
    this.items = [];

    this.getContainerSize = options.getContainerSize;
    this.getElementMediaSize = options.getElementMediaSize;
    this.gapX = options.gapX ?? 0;
    this.gapY = options.gapY ?? 0;
    this.middlewareHelper = options.middleware ? options.middleware.create() : getMiddleware();
  }

  public setCategoryItemsHeight(itemsLength = this.items.length) {
    const {width: containerWidth} = this.getContainerSize();
    const elementSize = this.getElementMediaSize().width;

    let itemsPerRow = containerWidth / elementSize;
    if(this.gapX) itemsPerRow -= Math.floor(itemsPerRow - 1) * this.gapX / elementSize;
    itemsPerRow = Math.floor(itemsPerRow);

    const rows = Math.ceil(itemsLength / itemsPerRow);
    let height = rows * elementSize;
    if(this.gapY) height += (rows - 1) * this.gapY;

    this.elements.items.style.minHeight = height + 'px';
  }
}

export class EmoticonsTabC<Category extends StickersTabCategory<any, any>> implements EmoticonsTab {
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

  constructor(
    protected managers: AppManagers,
    protected categoryItemsClassName: string,
    protected getElementMediaSize: () => MediaSize,
    protected padding: number,
    protected gapX: number,
    protected gapY: number
  ) {
    this.categories = {};
    this.categoriesMap = new Map();
    this.categoriesByMenuTabMap = new Map();
    this.localCategories = [];
    this.postponedEvents = [];

    this.listenerSetter = new ListenerSetter();
    this.middlewareHelper = getMiddleware();

    this.container = document.createElement('div');
    this.container.classList.add('tabs-tab', 'emoticons-container');

    this.menuWrapper = document.createElement('div');
    this.menuWrapper.classList.add('menu-wrapper', 'emoticons-menu-wrapper');

    this.menu = document.createElement('nav');
    this.menu.className = 'menu-horizontal-div no-stripe justify-start emoticons-menu';

    this.menuWrapper.append(this.menu);
    this.menuScroll = new ScrollableX(this.menuWrapper);

    this.content = document.createElement('div');
    this.content.classList.add('emoticons-content');

    this.container.append(this.menuWrapper, this.content);

    this.scrollable = new Scrollable(this.content, 'STICKERS');
    this.categoriesContainer = document.createElement('div');
    this.scrollable.append(this.categoriesContainer);
  }

  public getCategoryByContainer(container: HTMLElement) {
    return this.categoriesMap.get(container);
  }

  public getCategoryByMenuTab(menuTab: HTMLElement) {
    return this.categoriesByMenuTabMap.get(menuTab);
  }

  protected createCategory({
    stickerSet,
    title,
    isLocal,
    noMenuTab
  }: {
    stickerSet: StickerSet,
    title: HTMLElement | DocumentFragment,
    isLocal?: boolean,
    noMenuTab?: boolean
  }) {
    const category: Category = new StickersTabCategory({
      id: '' + stickerSet.id,
      title,
      overflowElement: this.content,
      getContainerSize: () => {
        let width: number, height: number;
        if(this.getContainerSize) {
          const size = this.getContainerSize();
          width = size.width;
          height = size.height;
        } else {
          const esgWidth = customProperties.getPropertyAsSize('esg-width');
          width = esgWidth === undefined ? windowSize.width : esgWidth;
        }

        return {width: width - this.padding, height};
      },
      getElementMediaSize: this.getElementMediaSize,
      gapX: this.gapX,
      gapY: this.gapY,
      noMenuTab,
      middleware: this.middlewareHelper.get()
    }) as any;

    if(this.categoryItemsClassName) {
      category.elements.items.classList.add(this.categoryItemsClassName);
    }

    const container = category.elements.container;
    container.classList.add('hide');

    category.set = stickerSet;
    this.categories[stickerSet.id] = category;
    this.categoriesMap.set(container, category);
    !noMenuTab && this.categoriesByMenuTabMap.set(category.elements.menuTab, category);

    this.categoriesIntersector.observe(container);
    !noMenuTab && this.menuOnClickResult.stickyIntersector.observeStickyHeaderChanges(container);

    if(!isLocal) {
      !noMenuTab && category.elements.menuTab.classList.add('not-local');
    }

    return category;
  }

  protected positionCategory(category: Category, prepend?: boolean) {
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
    noMenuTab
  }: {
    id: string,
    title: LangPackKey | '',
    icon?: Icon,
    noMenuTab?: boolean
  }) {
    const category = this.createCategory({
      stickerSet: {id} as any,
      title: title && i18n(title),
      isLocal: true,
      noMenuTab
    });
    category.local = true;
    this.localCategories.push(category);
    if(category.elements.title) {
      category.elements.title.classList.add('disable-hover');
    }

    if(!noMenuTab) {
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
      category.elements.menuTab.remove();
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
}

type StickersTabItem = {element: HTMLElement, document: Document.document};
export default class StickersTab extends EmoticonsTabC<StickersTabCategory<StickersTabItem>> {
  private superStickerRenderer: SuperStickerRenderer;

  constructor(managers: AppManagers) {
    super(
      managers,
      'super-stickers',
      () => mediaSizes.active.esgSticker,
      3 * 2,
      4,
      4
    );

    this.container.classList.add('stickers-padding');
    this.content.id = 'content-stickers';
  }

  private setFavedLimit(limit: number) {
    const category = this.categories['faved'];
    category.limit = limit;
  }

  private categoryAppendStickers(
    count: number,
    category: StickersTabCategory<StickersTabItem>,
    promise: Promise<MyDocument[]>
  ) {
    const {container} = category.elements;

    category.setCategoryItemsHeight(count);
    container.classList.remove('hide');

    Promise.all([
      promise,
      apiManagerProxy.isPremiumFeaturesHidden()
    ]).then(([documents, isPremiumFeaturesHidden]) => {
      const isVisible = this.isCategoryVisible(category);

      documents.forEach((document) => {
        if(isPremiumFeaturesHidden && getStickerEffectThumb(document)) {
          return;
        }

        const element = this.superStickerRenderer.renderSticker(document);
        category.items.push({document, element});

        if(isVisible) {
          category.elements.items.append(element);
        }
      });
    });
  }

  private async renderStickerSet(set: StickerSet.stickerSet, prepend = false) {
    const category = this.createCategory({
      stickerSet: set,
      title: wrapEmojiText(set.title)
    });
    const {menuTabPadding} = category.elements;

    const promise = this.managers.appStickersManager.getStickerSet(set);
    this.categoryAppendStickers(
      set.count,
      category,
      promise.then((stickerSet) => stickerSet.documents as MyDocument[])
    );

    this.positionCategory(category, prepend);

    wrapStickerSetThumb({
      set,
      container: menuTabPadding,
      group: EMOTICONSSTICKERGROUP,
      lazyLoadQueue: this.emoticonsDropdown.lazyLoadQueue,
      width: 32,
      height: 32,
      autoplay: false,
      middleware: category.middlewareHelper.get()
    });
  }

  private onCategoryVisibility = ({target, visible, entry}: OnVisibilityChangeItem) => {
    const category = this.categoriesMap.get(target);
    category.elements.items.replaceChildren(...(!visible ? [] : category.items.map(({element}) => element)));
  };

  public init() {
    super.init();

    this.scrollable.onAdditionalScroll = () => {
      this.setTyping();
    };

    /* stickersDiv.addEventListener('mouseover', (e) => {
      let target = e.target as HTMLElement;

      if(target.tagName === 'CANVAS') { // turn on sticker
        let animation = lottieLoader.getAnimation(target.parentElement, EMOTICONSSTICKERGROUP);

        if(animation) {
          // @ts-ignore
          if(animation.currentFrame === animation.totalFrames - 1) {
            animation.goToAndPlay(0, true);
          } else {
            animation.play();
          }
        }
      }
    }); */

    const intersectionOptions: IntersectionObserverInit = {root: this.emoticonsDropdown.getElement()};
    this.categoriesIntersector = new VisibilityIntersector(this.onCategoryVisibility, intersectionOptions);

    const clearCategoryItems = (category: StickersTabCategory<StickersTabItem>) => {
      category.elements.items.replaceChildren();
      category.items.forEach(({element}) => this.superStickerRenderer.unobserveAnimated(element));
      category.items.length = 0;
    };

    this.scrollable.container.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;
      if(findUpClassName(target, 'category-title')) {
        const container = findUpClassName(target, 'emoji-category');
        const category = this.categoriesMap.get(container);
        if(category.local) {
          return;
        }

        PopupElement.createPopup(PopupStickers, {id: category.set.id, access_hash: category.set.access_hash}).show();
        return;
      }

      this.emoticonsDropdown.onMediaClick(e);
    });

    this.menuOnClickResult = EmoticonsDropdown.menuOnClick(this, this.menu, this.scrollable, this.menuScroll);

    const preloader = putPreloader(this.content, true);

    const onCategoryStickers = (category: StickersTabCategory<StickersTabItem>, stickers: MyDocument[]) => {
      // if(category.id === 'faved' && category.limit && category.limit < stickers.length) {
      //   category.limit = stickers.length;
      // }

      if(category.limit) {
        stickers = stickers.slice(0, category.limit);
      }

      const ids = new Set(stickers.map((doc) => doc.id));
      forEachReverse(category.items, (item) => {
        if(!ids.has(item.document.id)) {
          this.deleteSticker(category, item.document, true);
        }
      });

      this.toggleLocalCategory(category, !!stickers.length);
      forEachReverse(stickers, (doc, idx) => {
        this.unshiftSticker(category, doc, true, idx);
      });
      this.spliceExceed(category);
      category.elements.container.classList.remove('hide');
    };

    const favedCategory = this.createLocalCategory({
      id: 'faved',
      title: 'FavoriteStickers',
      icon: 'savedmessages'
    });
    // favedCategory.elements.menuTab.classList.add('active');

    const recentCategory = this.createLocalCategory({
      id: 'recent',
      title: 'Stickers.Recent',
      icon: 'recent'
    });
    recentCategory.limit = 20;

    const clearButton = ButtonIcon('close', {noRipple: true});
    recentCategory.elements.title.append(clearButton);
    attachClickEvent(clearButton, () => {
      confirmationPopup({
        titleLangKey: 'ClearRecentStickersAlertTitle',
        descriptionLangKey: 'ClearRecentStickersAlertMessage',
        button: {
          langKey: 'Clear'
        }
      }).then(() => {
        this.managers.appStickersManager.clearRecentStickers();
      }, noop);
    });

    const premiumCategory = this.createLocalCategory({
      id: 'premium',
      title: 'PremiumStickersShort'
    });
    const s = Icon('star', 'color-premium');
    premiumCategory.elements.menuTab.append(s);

    const promises = [
      Promise.all([
        this.managers.apiManager.getLimit('favedStickers'),
        this.managers.appStickersManager.getFavedStickersStickers()
      ]).then(([limit, stickers]) => {
        this.setFavedLimit(limit);
        onCategoryStickers(favedCategory, stickers);
      }),

      this.managers.appStickersManager.getRecentStickersStickers().then((stickers) => {
        onCategoryStickers(recentCategory, stickers);
      }),

      this.managers.appStickersManager.getAllStickers().then((res) => {
        for(const set of (res as MessagesAllStickers.messagesAllStickers).sets) {
          this.renderStickerSet(set);
        }
      }),

      this.managers.appStickersManager.getPremiumStickers().then((stickers) => {
        const length = stickers.length;
        this.toggleLocalCategory(premiumCategory, rootScope.premium && !!length);
        this.categoryAppendStickers(stickers.length, premiumCategory, Promise.resolve(stickers));

        rootScope.addEventListener('premium_toggle', (isPremium) => {
          this.toggleLocalCategory(this.categories['premium'], isPremium && !!length);
        });
      })
    ];

    Promise.race(promises).finally(() => {
      preloader.remove();
    });

    Promise.all(promises).finally(() => {
      this.mounted = true;
      this.setTyping();

      const favedCategory = this.categories['faved'];
      const recentCategory = this.categories['recent'];
      this.menuOnClickResult.setActive(favedCategory.items.length ? favedCategory : recentCategory);

      rootScope.addEventListener('stickers_installed', (set) => {
        if(!this.categories[set.id]) {
          this.renderStickerSet(set, true);
        }
      });
    });

    this.superStickerRenderer = new SuperStickerRenderer({
      regularLazyLoadQueue: this.emoticonsDropdown.lazyLoadQueue,
      group: EMOTICONSSTICKERGROUP,
      managers: this.managers,
      intersectionObserverInit: intersectionOptions
    });

    const rendererLazyLoadQueue = this.superStickerRenderer.lazyLoadQueue;
    this.emoticonsDropdown.addLazyLoadQueueRepeat(rendererLazyLoadQueue, this.superStickerRenderer.processInvisible);

    // emoticonsDropdown.addEventListener('close', () => {
    //   this.categoriesIntersector.lock();
    // });

    // emoticonsDropdown.addEventListener('closed', () => {
    //   for(const [container] of this.categoriesMap) {
    //     onCategoryVisibility(container, false);
    //   }
    // });

    // emoticonsDropdown.addEventListener('opened', () => {
    //   this.categoriesIntersector.unlockAndRefresh();
    // });

    // setInterval(() => {
    //   // @ts-ignore
    //   const players = Object.values(lottieLoader.players).filter((p) => p.width >= 80);

    //   console.log(
    //     'STICKERS RENDERED IN PANEL:',
    //     players.length,
    //     players.filter((p) => !p.paused).length,
    //     rendererLazyLoadQueue.intersector.getVisible().length
    //   );
    // }, .25e3);

    rootScope.addEventListener('sticker_updated', ({type, document, faved}) => {
      // if(type === 'faved') {
      //   return;
      // }

      const category = this.categories[type === 'faved' ? 'faved' : 'recent'];
      if(category) {
        if(faved) {
          this.unshiftSticker(category, document);
        } else {
          this.deleteSticker(category, document);
        }
      }
    });

    rootScope.addEventListener('stickers_deleted', ({id}) => {
      const category = this.categories[id];
      if(this.deleteCategory(category)) {
        clearCategoryItems(category);
      }
    });

    rootScope.addEventListener('stickers_top', this.postponedEvent((id) => {
      const category = this.categories[id];
      if(category) {
        this.positionCategory(category, true);
        this.emoticonsDropdown.addEventListener('openAfterLayout', () => {
          this.menuOnClickResult.setActiveStatic(category);
        }, {once: true});
      }
    }));

    rootScope.addEventListener('stickers_order', ({type, order}) => {
      if(type !== 'stickers') {
        return;
      }

      order.forEach((id) => {
        const category = this.categories[id];
        if(category) {
          this.positionCategory(category, false);
        }
      });
    });

    rootScope.addEventListener('stickers_updated', ({type, stickers}) => {
      const category = this.categories[type === 'faved' ? 'faved' : 'recent'];
      if(category) {
        onCategoryStickers(category, stickers);
      }
    });

    rootScope.addEventListener('app_config', () => {
      this.managers.apiManager.getLimit('favedStickers').then((limit) => {
        this.setFavedLimit(limit);
      });
    });

    mediaSizes.addEventListener('resize', this.resizeCategories);

    attachStickerViewerListeners({listenTo: this.content, listenerSetter: new ListenerSetter()});

    const type: IgnoreMouseOutType = 'menu';
    createStickersContextMenu({
      listenTo: this.content,
      verifyRecent: (target) => !!findUpAsChild(target, this.categories['recent'].elements.items),
      onOpen: () => {
        this.emoticonsDropdown.setIgnoreMouseOut(type, true);
      },
      onClose: () => {
        this.emoticonsDropdown.setIgnoreMouseOut(type, false);
      }
    });

    this.init = null;
  }

  public deleteSticker(category: StickersTabCategory<StickersTabItem>, doc: MyDocument, batch?: boolean) {
    const item = findAndSplice(category.items, (item) => item.document.id === doc.id);
    if(item) {
      item.element.remove();

      if(!batch) {
        this.onLocalCategoryUpdate(category);
      }
    }
  }

  public unshiftSticker(category: StickersTabCategory<StickersTabItem>, doc: MyDocument, batch?: boolean, idx?: number) {
    if(idx !== undefined) {
      const i = category.items[idx];
      if(i && i.document.id === doc.id) {
        return;
      }
    }

    let item = findAndSplice(category.items, (item) => item.document.id === doc.id);
    if(!item) {
      item = {
        element: this.superStickerRenderer.renderSticker(doc),
        document: doc
      };
    }

    category.items.unshift(item);
    category.elements.items.prepend(item.element);

    if(!batch) {
      this.spliceExceed(category);
    }
  }

  public unshiftRecentSticker(doc: MyDocument) {
    this.managers.appStickersManager.saveRecentSticker(doc.id);
  }

  public deleteRecentSticker(doc: MyDocument) {
    this.managers.appStickersManager.saveRecentSticker(doc.id, true);
  }

  public setTyping = (cancel = false) => {
    if(!cancel && (!this.emoticonsDropdown.isActive() || this.emoticonsDropdown.tab !== this)) {
      return;
    }

    rootScope.dispatchEvent('choosing_sticker', !cancel);
  };

  public onClosed() {
    this.setTyping(true);
  }

  public onOpened() {
    this.setTyping();
    this.resizeCategories();
  }
}
