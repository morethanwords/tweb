/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import emoticonsDropdown, { EmoticonsDropdown, EMOTICONSSTICKERGROUP, EmoticonsTab } from "..";
import findUpClassName from "../../../helpers/dom/findUpClassName";
import mediaSizes from "../../../helpers/mediaSizes";
import { MessagesAllStickers, StickerSet } from "../../../layer";
import { MyDocument } from "../../../lib/appManagers/appDocsManager";
import { AppManagers } from "../../../lib/appManagers/managers";
import { i18n } from "../../../lib/langPack";
import wrapEmojiText from "../../../lib/richTextProcessor/wrapEmojiText";
import rootScope from "../../../lib/rootScope";
import animationIntersector from "../../animationIntersector";
import LazyLoadQueue from "../../lazyLoadQueue";
import LazyLoadQueueRepeat from "../../lazyLoadQueueRepeat";
import { putPreloader } from "../../putPreloader";
import PopupStickers from "../../popups/stickers";
import Scrollable, { ScrollableX } from "../../scrollable";
import StickyIntersector from "../../stickyIntersector";
import { wrapSticker, wrapStickerSetThumb } from "../../wrappers";
import ButtonIcon from "../../buttonIcon";
import positionElementByIndex from "../../../helpers/dom/positionElementByIndex";
import VisibilityIntersector, { OnVisibilityChange } from "../../visibilityIntersector";
import findAndSplice from "../../../helpers/array/findAndSplice";
import { attachClickEvent } from "../../../helpers/dom/clickEvent";
import confirmationPopup from "../../confirmationPopup";
import noop from "../../../helpers/noop";

export class SuperStickerRenderer {
  public lazyLoadQueue: LazyLoadQueueRepeat;
  private animated: Set<HTMLElement> = new Set();

  constructor(
    private regularLazyLoadQueue: LazyLoadQueue, 
    private group: string,
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
    //console.error('checkAnimationContainer', div, visible);
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

    //console.log('processVisibleDiv:', div);

    const promise = wrapSticker({
      doc, 
      div: element,
      width: size,
      height: size,
      lazyLoadQueue: null, 
      group: this.group, 
      onlyThumb: false,
      play: true,
      loop: true
    }).then(({render}) => render);

    promise.then(() => {
      //clearTimeout(timeout);
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

    //console.log('STICKER INvisible:', /* div,  */docId);

    this.checkAnimationContainer(element, false);

    element.textContent = '';
    this.renderSticker(doc, element as HTMLDivElement);
  };
}

type StickersTabCategory = {
  elements: {
    container: HTMLElement,
    title: HTMLElement,
    items: HTMLElement,
    menuTab: HTMLElement,
    menuTabPadding: HTMLElement
  },
  set: StickerSet.stickerSet,
  items: {
    document: MyDocument,
    element: HTMLElement
  }[]
};

const RECENT_STICKERS_COUNT = 20;

export default class StickersTab implements EmoticonsTab {
  private content: HTMLElement;

  private categories: {[id: string]: StickersTabCategory};
  private categoriesMap: Map<HTMLElement, StickersTabCategory>;
  private categoriesIntersector: VisibilityIntersector;

  private scroll: Scrollable;
  private menu: HTMLElement;
  private mounted = false;
  private stickyIntersector: StickyIntersector;
  private superStickerRenderer: SuperStickerRenderer;

  constructor(private managers: AppManagers) {
    this.categories = {};
    this.categoriesMap = new Map();
  }

  private createCategory(stickerSet: StickerSet.stickerSet, _title: HTMLElement | DocumentFragment) {
    const container = document.createElement('div');
    container.classList.add('emoji-category', 'hide');

    const items = document.createElement('div');
    items.classList.add('category-items', 'super-stickers');

    const title = document.createElement('div');
    title.classList.add('category-title');
    title.append(_title);

    const menuTab = ButtonIcon(undefined, {noRipple: true});
    menuTab.classList.add('menu-horizontal-div-item');

    const menuTabPadding = document.createElement('div');
    menuTabPadding.classList.add('menu-horizontal-div-item-padding');

    menuTab.append(menuTabPadding);

    const category: StickersTabCategory = {
      elements: {
        container,
        title,
        items,
        menuTab,
        menuTabPadding
      },
      set: stickerSet,
      items: []
    };

    container.append(title, items);

    this.categories[stickerSet.id] = category;
    this.categoriesMap.set(container, category);

    this.categoriesIntersector.observe(container);
    this.stickyIntersector.observeStickyHeaderChanges(container);

    return category;
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

      this.setCategoryItemsHeight(category);
      container.classList.remove('hide');
    });
  }

  private isCategoryVisible(category: StickersTabCategory) {
    return this.categoriesIntersector.getVisible().includes(category.elements.container);
  }

  private setCategoryItemsHeight(category: StickersTabCategory) {
    const containerWidth = this.content.getBoundingClientRect().width - 10;
    const stickerSize = mediaSizes.active.esgSticker.width;

    const itemsPerRow = Math.floor(containerWidth / stickerSize);
    const rows = Math.ceil(category.items.length / itemsPerRow);
    const height = rows * stickerSize;
    
    category.elements.items.style.minHeight = height + 'px';
  }

  private async renderStickerSet(set: StickerSet.stickerSet, prepend = false) {
    const category = this.createCategory(set, wrapEmojiText(set.title));
    const {menuTab, menuTabPadding, container} = category.elements;

    positionElementByIndex(menuTab, this.menu, prepend ? 1 : 0xFFFF);

    const promise = this.managers.appStickersManager.getStickerSet(set);
    this.categoryAppendStickers(
      category,
      promise.then((stickerSet) => stickerSet.documents as MyDocument[])
    );
    // const stickerSet = await promise;

    positionElementByIndex(container, this.scroll.container, prepend ? 1 : 0xFFFF, -1);

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

    const menuWrapper = this.content.previousElementSibling as HTMLDivElement;
    this.menu = menuWrapper.firstElementChild as HTMLUListElement;

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
      // console.log('roll the windows up', category, target, visible, entry);
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
        if(category.set.id === 'recent') {
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

    const {stickyIntersector, setActive} = EmoticonsDropdown.menuOnClick(this.menu, this.scroll, menuScroll);
    this.stickyIntersector = stickyIntersector;

    const preloader = putPreloader(this.content, true);

    const recentCategory = this.createCategory({id: 'recent'} as any, i18n('Stickers.Recent'));
    recentCategory.elements.title.classList.add('disable-hover');
    recentCategory.elements.menuTab.classList.add('tgico-recent', 'active');
    recentCategory.elements.menuTabPadding.remove();
    this.toggleRecentCategory(recentCategory, false);

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

    const onRecentStickers = (stickers: MyDocument[]) => {
      const sliced = stickers.slice(0, RECENT_STICKERS_COUNT) as MyDocument[];

      clearCategoryItems(recentCategory);
      this.toggleRecentCategory(recentCategory, !!sliced.length);
      this.categoryAppendStickers(recentCategory, Promise.resolve(sliced));
    };

    Promise.all([
      this.managers.appStickersManager.getRecentStickers().then((stickers) => {
        preloader.remove();
        onRecentStickers(stickers.stickers as MyDocument[]);
      }),

      this.managers.appStickersManager.getAllStickers().then((res) => {
        preloader.remove();

        for(let set of (res as MessagesAllStickers.messagesAllStickers).sets) {
          this.renderStickerSet(set);
        }
      })
    ]).finally(() => {
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

    rootScope.addEventListener('stickers_recent', (stickers) => {
      if(this.mounted) {
        onRecentStickers(stickers);
      }
    });

    const resizeCategories = () => {
      for(const [container, category] of this.categoriesMap) {
        this.setCategoryItemsHeight(category);
      }
    };

    mediaSizes.addEventListener('resize', resizeCategories);

    emoticonsDropdown.addEventListener('opened', resizeCategories);
    
    this.init = null;
  }

  private toggleRecentCategory(category: StickersTabCategory, visible: boolean) {
    if(!visible) {
      category.elements.menuTab.remove();
      category.elements.container.remove();
    } else {
      positionElementByIndex(category.elements.menuTab, this.menu, 0);
      positionElementByIndex(category.elements.container, this.scroll.container, 0);
    }
    
    // category.elements.container.classList.toggle('hide', !visible);
  }

  public pushRecentSticker(doc: MyDocument) {
    this.managers.appStickersManager.pushRecentSticker(doc.id);
    
    const category = this.categories['recent'];
    if(!category) {
      return;
    }

    const items = category.elements.items;
    let item = findAndSplice(category.items, (item) => item.document.id === doc.id);
    if(!item) {
      item = {
        element: this.superStickerRenderer.renderSticker(doc),
        document: doc
      };
    }

    category.items.unshift(item);
    if(items.childElementCount) items.prepend(item.element);
    if(items.childElementCount > RECENT_STICKERS_COUNT) {
      (Array.from(items.children) as HTMLElement[]).slice(RECENT_STICKERS_COUNT).forEach((el) => el.remove());
    }

    this.setCategoryItemsHeight(category);
    this.toggleRecentCategory(category, true);
  }

  onClose() {

  }
}
