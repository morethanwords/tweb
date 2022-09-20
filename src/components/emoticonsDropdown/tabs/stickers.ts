/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import emoticonsDropdown, {EmoticonsDropdown, EMOTICONSSTICKERGROUP, EmoticonsTab} from '..';
import findUpClassName from '../../../helpers/dom/findUpClassName';
import mediaSizes from '../../../helpers/mediaSizes';
import {MessagesAllStickers, StickerSet} from '../../../layer';
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
import StickyIntersector from '../../stickyIntersector';
import findAndSplice from '../../../helpers/array/findAndSplice';
import {attachClickEvent} from '../../../helpers/dom/clickEvent';
import positionElementByIndex from '../../../helpers/dom/positionElementByIndex';
import noop from '../../../helpers/noop';
import ButtonIcon from '../../buttonIcon';
import confirmationPopup from '../../confirmationPopup';
import VisibilityIntersector, {OnVisibilityChange} from '../../visibilityIntersector';
import createStickersContextMenu from '../../../helpers/dom/createStickersContextMenu';
import findUpAsChild from '../../../helpers/dom/findUpAsChild';
import forEachReverse from '../../../helpers/array/forEachReverse';
import {MTAppConfig} from '../../../lib/mtproto/appConfig';
import attachStickerViewerListeners from '../../stickerViewer';
import ListenerSetter from '../../../helpers/listenerSetter';
import wrapSticker from '../../wrappers/sticker';
import wrapStickerSetThumb from '../../wrappers/stickerSetThumb';
import {MediaSize} from '../../../helpers/mediaSize';

export class SuperStickerRenderer {
  public lazyLoadQueue: LazyLoadQueueRepeat;
  private animated: Set<HTMLElement> = new Set();

  constructor(
    private regularLazyLoadQueue: LazyLoadQueue,
    private group: AnimationItemGroup,
    private managers: AppManagers,
    private options?: IntersectionObserverInit
  ) {
    this.lazyLoadQueue = new LazyLoadQueueRepeat(undefined, ({target, visible}) => {
      if(!visible) {
        this.processInvisible(target);
      }
    }, options);
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
      loadPromises
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
    this.lazyLoadQueue.unobserve(element);
  }

  private checkAnimationContainer = (element: HTMLElement, visible: boolean) => {
    // console.error('checkAnimationContainer', div, visible);
    const players = animationIntersector.getAnimations(element);
    players.forEach((player) => {
      if(!visible) {
        animationIntersector.checkAnimation(player, true, true);
      } else {
        animationIntersector.checkAnimation(player, false);
      }
    });
  };

  private processVisible = async(element: HTMLElement) => {
    const docId = element.dataset.docId;
    const doc = await this.managers.appDocsManager.getDoc(docId);

    const size = mediaSizes.active.esgSticker.width;

    // console.log('processVisibleDiv:', div);

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
      withLock: true
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

    element.textContent = '';
    this.renderSticker(doc, element as HTMLDivElement);
  };
}

export class StickersTabCategory {
  public elements: {
    container: HTMLElement,
    title: HTMLElement,
    items: HTMLElement,
    menuTab: HTMLElement,
    menuTabPadding: HTMLElement
  };
  public items: {
    document: MyDocument,
    element: HTMLElement
  }[];
  public mounted: boolean;
  public id: string;
  public limit: number;

  private overflowElement: HTMLElement;
  private getElementMediaSize: () => MediaSize;

  constructor(options: {
    id: string,
    title: HTMLElement | DocumentFragment,
    overflowElement: HTMLElement,
    getElementMediaSize: () => MediaSize
  }) {
    const container = document.createElement('div');
    container.classList.add('emoji-category');

    const items = document.createElement('div');
    items.classList.add('category-items');

    const title = document.createElement('div');
    title.classList.add('category-title');
    title.append(options.title);

    const menuTab = ButtonIcon(undefined, {noRipple: true});
    menuTab.classList.add('menu-horizontal-div-item');

    const menuTabPadding = document.createElement('div');
    menuTabPadding.classList.add('menu-horizontal-div-item-padding');

    menuTab.append(menuTabPadding);

    container.append(title, items);

    this.elements = {
      container,
      title,
      items,
      menuTab,
      menuTabPadding
    };
    this.id = options.id;
    this.items = [];

    this.overflowElement = options.overflowElement;
    this.getElementMediaSize = options.getElementMediaSize;
  }

  public setCategoryItemsHeight() {
    const containerWidth = this.overflowElement.getBoundingClientRect().width - 10;
    const elementSize = this.getElementMediaSize().width;

    const itemsPerRow = Math.floor(containerWidth / elementSize);
    const rows = Math.ceil(this.items.length / itemsPerRow);
    const height = rows * elementSize;

    this.elements.items.style.minHeight = height + 'px';
  }
}

type S = StickersTabCategory & {set?: StickerSet};

class EmoticonsTabC {
  protected content: HTMLElement;

  protected categories: {[id: string]: S};
  protected categoriesMap: Map<HTMLElement, S>;
  protected categoriesIntersector: VisibilityIntersector;
  protected localCategories: StickersTabCategory[];

  protected scroll: Scrollable;
  protected menu: HTMLElement;
  protected mounted = false;
  protected stickyIntersector: StickyIntersector;

  constructor(
    protected managers: AppManagers
  ) {
    this.categories = {};
    this.categoriesMap = new Map();
    this.localCategories = [];
  }

  protected createCategory(stickerSet: StickerSet, title: HTMLElement | DocumentFragment) {
    const category: S = new StickersTabCategory({
      id: '' + stickerSet.id,
      title,
      overflowElement: this.content,
      getElementMediaSize: () => mediaSizes.active.esgSticker
    });

    category.elements.items.classList.add('super-stickers');
    const container = category.elements.container;
    container.classList.add('hide');

    category.set = stickerSet;
    this.categories[stickerSet.id] = category;
    this.categoriesMap.set(container, category);

    this.categoriesIntersector.observe(container);
    this.stickyIntersector.observeStickyHeaderChanges(container);

    return category;
  }

  protected isCategoryVisible(category: StickersTabCategory) {
    return this.categoriesIntersector.getVisible().includes(category.elements.container);
  }

  protected toggleLocalCategory(category: StickersTabCategory, visible: boolean) {
    if(!visible) {
      category.elements.menuTab.remove();
      category.elements.container.remove();
    } else {
      let idx = this.localCategories.indexOf(category);
      const notMounted = this.localCategories.slice(0, idx).filter((category) => !category.mounted);
      idx -= notMounted.length;
      positionElementByIndex(category.elements.menuTab, this.menu, idx);
      positionElementByIndex(category.elements.container, this.scroll.container, idx);
    }

    category.mounted = visible;
    // category.elements.container.classList.toggle('hide', !visible);
  }

  protected onLocalCategoryUpdate(category: StickersTabCategory) {
    category.setCategoryItemsHeight();
    this.toggleLocalCategory(category, !!category.items.length);
  }
}

export default class StickersTab extends EmoticonsTabC implements EmoticonsTab {
  private superStickerRenderer: SuperStickerRenderer;

  private setFavedLimit(appConfig: MTAppConfig) {
    const limit = rootScope.premium ? appConfig.stickers_faved_limit_premium : appConfig.stickers_faved_limit_default;
    const category = this.categories['faved'];
    category.limit = limit;
  }

  private categoryAppendStickers(
    category: StickersTabCategory,
    promise: Promise<MyDocument[]>
  ) {
    const {container} = category.elements;

    promise.then((documents) => {
      const isVisible = this.isCategoryVisible(category);

      documents.forEach((document) => {
        const element = this.superStickerRenderer.renderSticker(document);
        category.items.push({document, element});

        if(isVisible) {
          category.elements.items.append(element);
        }
      });

      category.setCategoryItemsHeight();
      container.classList.remove('hide');
    });
  }

  private async renderStickerSet(set: StickerSet.stickerSet, prepend = false) {
    const category = this.createCategory(set, wrapEmojiText(set.title));
    const {menuTab, menuTabPadding, container} = category.elements;

    const pos = prepend ? this.localCategories.filter((category) => category.mounted).length : 0xFFFF;
    positionElementByIndex(menuTab, this.menu, pos);

    const promise = this.managers.appStickersManager.getStickerSet(set);
    this.categoryAppendStickers(
      category,
      promise.then((stickerSet) => stickerSet.documents as MyDocument[])
    );
    // const stickerSet = await promise;

    positionElementByIndex(container, this.scroll.container, pos, -1);

    wrapStickerSetThumb({
      set,
      container: menuTabPadding,
      group: EMOTICONSSTICKERGROUP,
      lazyLoadQueue: EmoticonsDropdown.lazyLoadQueue,
      width: 32,
      height: 32,
      autoplay: false
    });
  }

  public init() {
    this.content = document.getElementById('content-stickers');
    const menuWrapper = this.content.previousElementSibling as HTMLElement;
    const menu = this.menu = menuWrapper.firstElementChild as HTMLElement;
    const menuScroll = new ScrollableX(menuWrapper);

    this.scroll = new Scrollable(this.content, 'STICKERS');
    this.scroll.onAdditionalScroll = () => {
      setTyping();
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

    const onCategoryVisibility: OnVisibilityChange = ({target, visible, entry}) => {
      const category = this.categoriesMap.get(target);
      if(!visible) {
        category.elements.items.textContent = '';
      } else {
        category.elements.items.append(...category.items.map(({element}) => element));
      }
    };

    const intersectionOptions: IntersectionObserverInit = {root: emoticonsDropdown.getElement()};
    this.categoriesIntersector = new VisibilityIntersector(onCategoryVisibility, intersectionOptions);

    const clearCategoryItems = (category: StickersTabCategory) => {
      category.elements.items.textContent = '';
      category.items.forEach(({element}) => this.superStickerRenderer.unobserveAnimated(element));
      category.items.length = 0;
    };

    this.scroll.container.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;
      if(findUpClassName(target, 'category-title')) {
        const container = findUpClassName(target, 'emoji-category');
        const category = this.categoriesMap.get(container);
        if(category.id === 'recent') {
          return;
        }

        new PopupStickers({id: category.set.id, access_hash: category.set.access_hash}).show();
        return;
      }

      EmoticonsDropdown.onMediaClick(e);
    });

    const setTyping = (cancel = false) => {
      rootScope.dispatchEvent('choosing_sticker', !cancel);
    };

    emoticonsDropdown.addEventListener('closed', () => {
      setTyping(true);
    });

    emoticonsDropdown.addEventListener('opened', () => {
      setTyping();
    });

    const {stickyIntersector, setActive} = EmoticonsDropdown.menuOnClick(menu, this.scroll, menuScroll);
    this.stickyIntersector = stickyIntersector;

    const preloader = putPreloader(this.content, true);

    const createLocalCategory = (id: string, title: LangPackKey, icon?: string) => {
      const category = this.createCategory({id} as any, i18n(title));
      this.localCategories.push(category);
      category.elements.title.classList.add('disable-hover');
      icon && category.elements.menuTab.classList.add('tgico', 'tgico-' + icon);
      category.elements.menuTabPadding.remove();
      this.toggleLocalCategory(category, false);
      return category;
    };

    const onCategoryStickers = (category: StickersTabCategory, stickers: MyDocument[]) => {
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

    const favedCategory = createLocalCategory('faved', 'FavoriteStickers', 'saved');
    favedCategory.elements.menuTab.classList.add('active');

    const recentCategory = createLocalCategory('recent', 'Stickers.Recent', 'recent');
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

    const premiumCategory = createLocalCategory('premium', 'PremiumStickersShort');
    const s = document.createElement('span');
    s.classList.add('tgico-star', 'color-premium');
    premiumCategory.elements.menuTab.append(s);

    const promises = [
      Promise.all([
        this.managers.apiManager.getAppConfig(),
        this.managers.appStickersManager.getFavedStickersStickers()
      ]).then(([appConfig, stickers]) => {
        this.setFavedLimit(appConfig);
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
        this.categoryAppendStickers(premiumCategory, Promise.resolve(stickers));

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
      setTyping();
      setActive(0);
    });

    this.superStickerRenderer = new SuperStickerRenderer(EmoticonsDropdown.lazyLoadQueue, EMOTICONSSTICKERGROUP, this.managers, intersectionOptions);

    const rendererLazyLoadQueue = this.superStickerRenderer.lazyLoadQueue;
    emoticonsDropdown.addLazyLoadQueueRepeat(rendererLazyLoadQueue, this.superStickerRenderer.processInvisible);

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

    rootScope.addEventListener('stickers_installed', (set) => {
      if(!this.categories[set.id] && this.mounted) {
        this.renderStickerSet(set, true);
      }
    });

    rootScope.addEventListener('stickers_deleted', ({id}) => {
      const category = this.categories[id];
      if(category && this.mounted) {
        category.elements.container.remove();
        category.elements.menuTab.remove();
        this.categoriesIntersector.unobserve(category.elements.container);
        clearCategoryItems(category);
        delete this.categories[id];
        this.categoriesMap.delete(category.elements.container);
      }
    });

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

    rootScope.addEventListener('stickers_updated', ({type, stickers}) => {
      if(this.mounted) {
        const category = this.categories[type === 'faved' ? 'faved' : 'recent'];
        onCategoryStickers(category, stickers);
      }
    });

    rootScope.addEventListener('app_config', (appConfig) => {
      this.setFavedLimit(appConfig);
    });

    const resizeCategories = () => {
      for(const [container, category] of this.categoriesMap) {
        category.setCategoryItemsHeight();
      }
    };

    mediaSizes.addEventListener('resize', resizeCategories);

    emoticonsDropdown.addEventListener('opened', resizeCategories);

    attachStickerViewerListeners({listenTo: this.content, listenerSetter: new ListenerSetter()});

    createStickersContextMenu({
      listenTo: this.content,
      verifyRecent: (target) => !!findUpAsChild(target, this.categories['recent'].elements.items),
      onOpen: () => {
        emoticonsDropdown.setIgnoreMouseOut(true);
      },
      onClose: () => {
        emoticonsDropdown.setIgnoreMouseOut(false);
      }
    });

    this.init = null;
  }

  public deleteSticker(category: StickersTabCategory, doc: MyDocument, batch?: boolean) {
    const item = findAndSplice(category.items, (item) => item.document.id === doc.id);
    if(item) {
      item.element.remove();

      if(!batch) {
        this.onLocalCategoryUpdate(category);
      }
    }
  }

  private spliceExceed(category: StickersTabCategory) {
    const {items, limit} = category;
    items.splice(limit, items.length - limit).forEach(({element}) => {
      element.remove();
    });

    this.onLocalCategoryUpdate(category);
  }

  public unshiftSticker(category: StickersTabCategory, doc: MyDocument, batch?: boolean, idx?: number) {
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

  onClose() {

  }
}
