/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import emoticonsDropdown, {EmoticonsDropdown, EMOTICONSSTICKERGROUP} from '..';
import cancelEvent from '../../../helpers/dom/cancelEvent';
import findUpClassName from '../../../helpers/dom/findUpClassName';
import {fastRaf} from '../../../helpers/schedulers';
import pause from '../../../helpers/schedulers/pause';
import appImManager from '../../../lib/appManagers/appImManager';
import {LangPackKey} from '../../../lib/langPack';
import rootScope from '../../../lib/rootScope';
import {emojiFromCodePoints} from '../../../vendor/emoji';
import {putPreloader} from '../../putPreloader';
import Scrollable, {ScrollableX} from '../../scrollable';
import IS_EMOJI_SUPPORTED from '../../../environment/emojiSupport';
import IS_TOUCH_SUPPORTED from '../../../environment/touchSupport';
import blurActiveElement from '../../../helpers/dom/blurActiveElement';
import Emoji from '../../../config/emoji';
import fixEmoji from '../../../lib/richTextProcessor/fixEmoji';
import wrapEmojiText from '../../../lib/richTextProcessor/wrapEmojiText';
import wrapSingleEmoji from '../../../lib/richTextProcessor/wrapSingleEmoji';
import {attachClickEvent} from '../../../helpers/dom/clickEvent';
import {EmoticonsTabC, StickersTabCategory} from './stickers';
import {makeMediaSize} from '../../../helpers/mediaSize';
import {AppManagers} from '../../../lib/appManagers/managers';
import VisibilityIntersector, {OnVisibilityChangeItem} from '../../visibilityIntersector';
import mediaSizes from '../../../helpers/mediaSizes';
import wrapStickerSetThumb from '../../wrappers/stickerSetThumb';
import attachStickerViewerListeners from '../../stickerViewer';
import ListenerSetter from '../../../helpers/listenerSetter';
import {Document, StickerSet} from '../../../layer';
import {CustomEmojiElement, CustomEmojiRendererElement} from '../../../lib/richTextProcessor/wrapRichText';
import findAndSplice from '../../../helpers/array/findAndSplice';
import positionElementByIndex from '../../../helpers/dom/positionElementByIndex';
import PopupStickers from '../../popups/stickers';
import {hideToast, toastNew} from '../../toast';
import safeAssign from '../../../helpers/object/safeAssign';
import type {AppStickersManager} from '../../../lib/appManagers/appStickersManager';
import liteMode from '../../../helpers/liteMode';
import PopupElement from '../../popups';

const loadedURLs: Set<string> = new Set();
export function appendEmoji(emoji: string, container?: HTMLElement, prepend = false, unify = false) {
  // const emoji = details.unified;
  // const emoji = (details.unified as string).split('-')
  // .reduce((prev, curr) => prev + String.fromCodePoint(parseInt(curr, 16)), '');

  const spanEmoji = document.createElement('span');
  spanEmoji.classList.add('super-emoji');

  let kek: DocumentFragment;
  if(unify && !IS_EMOJI_SUPPORTED) {
    kek = wrapSingleEmoji(emoji);
  } else {
    emoji = fixEmoji(emoji);
    kek = wrapEmojiText(emoji);
  }

  /* if(!kek.includes('emoji')) {
    console.log(emoji, kek, spanEmoji, emoji.length, new TextEncoder().encode(emoji), emojiUnicode(emoji));
    return;
  } */

  // console.log(kek);

  spanEmoji.append(kek);

  if(spanEmoji.children.length > 1) {
    const first = spanEmoji.firstElementChild;
    spanEmoji.replaceChildren(first);
  }

  if(spanEmoji.firstElementChild?.tagName === 'IMG') {
    const image = spanEmoji.firstElementChild as HTMLImageElement;

    const url = image.src;
    if(!loadedURLs.has(url)) {
      image.setAttribute('loading', 'lazy');
      const placeholder = document.createElement('span');
      placeholder.classList.add('emoji-placeholder');

      if(liteMode.isAvailable('animations')) {
        image.style.opacity = '0';
        placeholder.style.opacity = '1';
      }

      image.addEventListener('load', () => {
        fastRaf(() => {
          if(liteMode.isAvailable('animations')) {
            image.style.opacity = '';
            placeholder.style.opacity = '';
          }

          spanEmoji.classList.remove('empty');

          loadedURLs.add(url);
        });
      }, {once: true});

      spanEmoji.append(placeholder);
    }
  }

  // spanEmoji = spanEmoji.firstElementChild as HTMLSpanElement;
  // spanEmoji.setAttribute('emoji', emoji);
  if(container) {
    if(prepend) container.prepend(spanEmoji);
    else container.appendChild(spanEmoji);
  }

  return spanEmoji;
}

export function getEmojiFromElement(element: HTMLElement): {docId?: DocId, emoji: string} {
  const superEmoji = findUpClassName(element, 'super-emoji');
  if(!superEmoji) return;

  const firstElementChild = superEmoji.firstElementChild as HTMLElement;
  if(firstElementChild && firstElementChild.classList.contains('custom-emoji')) {
    return {emoji: firstElementChild.dataset.stickerEmoji, docId: firstElementChild.dataset.docId} as const;
  } else {
    if(element.nodeType === element.TEXT_NODE) return {emoji: element.nodeValue};
    if(element.tagName === 'SPAN' && !element.classList.contains('emoji') && element.firstElementChild) {
      element = element.firstElementChild as HTMLElement;
    }

    return {emoji: element.getAttribute('alt') || element.innerText} as const;
  }
}

const EMOJI_RECENT_ID: (typeof EMOJI_CATEGORIES)[0][0] = 'Emoji.Recent';
const EMOJI_RECENT_CATEGORY: (typeof EMOJI_CATEGORIES)[0] = [EMOJI_RECENT_ID, 'recent'];
const CUSTOM_EMOJI_RECENT_ID: (typeof EMOJI_CATEGORIES)[0][0] = '';
const CUSTOM_EMOJI_RECENT_CATEGORY: (typeof EMOJI_CATEGORIES)[0] = [CUSTOM_EMOJI_RECENT_ID, ''];
const EMOJI_CATEGORIES: [LangPackKey | '', string][] = [
  ['Emoji.SmilesAndPeople', 'smile'],
  ['Emoji.AnimalsAndNature', 'animals'],
  ['Emoji.FoodAndDrink', 'eats'],
  ['Emoji.TravelAndPlaces', 'car'],
  ['Emoji.ActivityAndSport', 'sport'],
  ['Emoji.Objects', 'lamp'],
  // ['Emoji.Symbols', 'info'],
  ['Emoji.Flags', 'flag'],
  ['Skin Tones' as any, '']
];

let sorted: Map<(typeof EMOJI_CATEGORIES)[0], string[]>;
function prepare() {
  if(sorted) {
    return sorted;
  }

  const a: Array<[(typeof EMOJI_CATEGORIES)[0], string[]]> = [
    [CUSTOM_EMOJI_RECENT_CATEGORY, []],
    [EMOJI_RECENT_CATEGORY, []]
  ];

  sorted = new Map(a);
  for(const emoji in Emoji) {
    const details = Emoji[emoji];
    const i = '' + details;
    const category = EMOJI_CATEGORIES[+i[0] - 1];
    if(!category) continue; // maybe it's skin tones

    let s = sorted.get(category);
    if(!s) {
      s = [];
      sorted.set(category, s);
    }

    s[+i.slice(1) || 0] = emoji;
  }

  sorted.delete(EMOJI_CATEGORIES.pop());
  EMOJI_CATEGORIES.unshift(CUSTOM_EMOJI_RECENT_CATEGORY, EMOJI_RECENT_CATEGORY);
  const order = EMOJI_CATEGORIES.map(([id]) => id);
  const entries = [...sorted.entries()].sort((a, b) => order.indexOf(a[0][0]) - order.indexOf(b[0][0]));
  sorted = new Map(entries);

  return sorted;
}

const EMOJI_ELEMENT_SIZE = makeMediaSize(42, 42);
const RECENT_MAX_LENGTH = 32;

type EmojiTabItem = {element: HTMLElement} & ReturnType<typeof getEmojiFromElement>;
type EmojiTabCategory = StickersTabCategory<EmojiTabItem, {renderer: CustomEmojiRendererElement}>;
export default class EmojiTab extends EmoticonsTabC<EmojiTabCategory> {
  private closeScrollTop: number;
  private menuInnerScroll: ScrollableX;
  private isStandalone?: boolean;
  private noRegularEmoji?: boolean;
  private stickerSetId?: Parameters<AppStickersManager['getLocalStickerSet']>[0];
  private onClick: (emoji: EmojiTabItem) => void;
  private activeEmoji: ReturnType<typeof getEmojiFromElement>;
  private activeElements: EmojiTabItem[];

  constructor(options: {
    managers: AppManagers,
    isStandalone?: boolean,
    noRegularEmoji?: boolean,
    stickerSetId?: EmojiTab['stickerSetId'],
    onClick?: EmojiTab['onClick']
  }) {
    super(
      options.managers,
      'super-emojis',
      () => EMOJI_ELEMENT_SIZE,
      16,
      4,
      0
    );

    safeAssign(this, options);
    this.container.classList.add('emoji-padding');
    this.content.id = 'content-emoji';
    this.activeElements = [];
  }

  private onCategoryVisibility = ({target, visible}: Pick<OnVisibilityChangeItem, 'target' | 'visible'>) => {
    const category = this.categoriesMap.get(target);
    // console.log(target, visible, category);
    // if(category.local) return;

    const renderer = category.elements.renderer;
    const newChildren: HTMLElement[] = [];
    if(renderer) {
      newChildren.push(renderer);
      const customEmojis: Parameters<CustomEmojiRendererElement['add']>[0] = new Map();
      if(visible) {
        newChildren.push(...category.items.map(({docId, element}) => {
          if(!docId) {
            return element;
          }

          // return element;

          // if(element.firstElementChild) {
          //   return element;
          // }

          const customEmojiElement = element.firstElementChild as CustomEmojiElement;
          customEmojiElement.clear(false);
          // const customEmojiElement = CustomEmojiElement.create(document.id);
          customEmojis.set(customEmojiElement.docId, new Set([customEmojiElement]));
          // element.append(customEmojiElement);
          return element;
        }));

        renderer.add(customEmojis/* , EmoticonsDropdown.lazyLoadQueue */, undefined, undefined, false);
      } else {
        renderer.clearCanvas();
        renderer.middlewareHelper.clean();
      }
    } else if(visible) {
      newChildren.push(...category.items.map(({element}) => element));
    }

    // if(visible)
    category.elements.items.replaceChildren(...newChildren);

    if(renderer && !visible) {
      const customEmojis: Parameters<CustomEmojiRendererElement['add']>[0] = new Map();
      category.items.forEach(({docId, element}) => {
        if(!docId) {
          return;
        }

        const customEmojiElement = element.firstElementChild as CustomEmojiElement;
        customEmojiElement.clear();
        customEmojis.set(customEmojiElement.docId, new Set([customEmojiElement]));
      });

      /* const promise =  */renderer.add(customEmojis/* , EmoticonsDropdown.lazyLoadQueue */, undefined, true);
      // promise.then(() => {
      //   customEmojis.forEach((elements) => {
      //     elements.forEach((element) => {
      //       if(!element.innerHTML) {
      //         console.log('no thumb', element);
      //         // debugger;
      //       }
      //     });
      //   });

      //   const set = customEmojis.get('5766933926429854499');
      //   console.log(`wrapped ${customEmojis.size} thumbs`, set && set.values().next().value.innerHTML);
      // });
    }

    // if(!visible) {
    //   const customEmojis: Parameters<CustomEmojiRendererElement['add']>[0] = {};
    //   category.items.forEach((item) => {
    //     const {element, document} = item;
    //     if(!element.firstElementChild) {
    //       return;
    //     }

    //     const customEmojiElement = CustomEmojiElement.create(document.id);
    //     customEmojis[customEmojiElement.docId] = new Set([customEmojiElement]);
    //     element.firstElementChild.replaceWith(customEmojiElement);
    //   });

    //   renderer.add(customEmojis, EmoticonsDropdown.lazyLoadQueue);
    // }
  };

  public destroy() {
    super.destroy();
    this.menuInnerScroll?.destroy();
  }

  public init() {
    super.init();
    this.init = undefined;

    const intersectionOptions: IntersectionObserverInit = {
      root: this.isStandalone ? this.content : emoticonsDropdown.getElement()
    };

    this.categoriesIntersector = new VisibilityIntersector(this.onCategoryVisibility, intersectionOptions);

    this.menuOnClickResult = EmoticonsDropdown.menuOnClick(this, this.menu, this.scrollable, this.menuScroll, undefined, this.listenerSetter);

    const preloader = putPreloader(this.content, true);

    let innerScrollWrapper: HTMLElement;

    if(!this.isStandalone) {
      const x = this.menuInnerScroll = new ScrollableX(undefined);
      x.container.classList.add('menu-horizontal-inner-scroll');

      innerScrollWrapper = document.createElement('div');
      innerScrollWrapper.classList.add('menu-horizontal-inner');
      innerScrollWrapper.append(x.container);
    }

    let preparedMap: ReturnType<typeof prepare>;
    prepare();
    if(!this.noRegularEmoji) {
      preparedMap = prepare();
    } else {
      preparedMap = new Map([
        [[CUSTOM_EMOJI_RECENT_CATEGORY[0], 'recent'], []]
        // [EMOJI_RECENT_CATEGORY, []]
      ]);
    }

    preparedMap.forEach((emojis, [titleLangPackKey, icon]) => {
      const category = this.createLocalCategory(titleLangPackKey, titleLangPackKey, icon, !icon);
      category.elements.container.classList.remove('hide');
      category.elements.items.classList.add(icon && !this.isStandalone ? 'is-local' : 'not-local');

      emojis.forEach((unified) => {
        /* if(emojiUnicode(emoji) === '1f481-200d-2642') {
          console.log('append emoji', emoji, emojiUnicode(emoji));
        } */

        const emoji = emojiFromCodePoints(unified);
        // if(emoji.includes('🕵')) {
        // console.log('toCodePoints', toCodePoints(emoji));
        // emoji = emoji.replace(/(\u200d[\u2640\u2642\u2695])(?!\ufe0f)/, '\ufe0f$1');
        // const zwjIndex = emoji.indexOf('\u200d');
        // if(zwjIndex !== -1 && !emoji.includes('\ufe0f')) {
        //   /* if(zwjIndex !== (emoji.length - 1)) {
        //     emoji = emoji.replace(/(\u200d)/g, '\ufe0f$1');
        //   } */

        //   emoji += '\ufe0f';
        //   //emoji += '\ufe0f';
        // }

        // debugger;
        // }

        this.addEmojiToCategory({
          category,
          emoji: {emoji},
          batch: true
        });

        /* if(category === 'Smileys & Emotion') {
          console.log('appended emoji', emoji, itemsDiv.children[itemsDiv.childElementCount - 1].innerHTML, emojiUnicode(emoji));
        } */
      });
    });

    const promise = Promise.all([
      this.isStandalone ? undefined : pause(200),
      !this.noRegularEmoji && this.managers.appEmojiManager.getRecentEmojis('native'),
      !this.isStandalone && this.managers.appEmojiManager.getRecentEmojis('custom'),
      this.stickerSetId && this.managers.appStickersManager.getLocalStickerSet(this.stickerSetId),
      this.managers.appEmojiManager.getCustomEmojis()
    ]).then(([_, recent, recentCustom, mainSet, sets]) => {
      preloader.remove();

      if(mainSet) {
        recentCustom = mainSet.documents.map((doc) => doc.id);
      }

      const recentCategory = this.categories[EMOJI_RECENT_ID];
      const recentCustomCategory = this.categories[CUSTOM_EMOJI_RECENT_ID];

      if(!this.isStandalone) {
        const a = [
          recentCategory && [recentCategory, recent] as const,
          recentCustomCategory && [recentCustomCategory, recentCustom] as const
        ];

        a.filter(Boolean).forEach(([category, recent]) => {
          category.limit = RECENT_MAX_LENGTH;
          recent.splice(RECENT_MAX_LENGTH, recent.length - RECENT_MAX_LENGTH);
        });
      }

      if(recentCategory && recent) for(const emoji of recent) {
        this.addEmojiToCategory({
          category: recentCategory,
          emoji: {emoji},
          batch: true
        });
      }

      if(recentCustomCategory) {
        this.createRendererForCategory(recentCustomCategory);
        if(recentCustom) for(const docId of recentCustom) {
          this.addEmojiToCategory({
            category: recentCustomCategory,
            emoji: {emoji: '', docId},
            batch: true
          });
        }
        recentCustomCategory.elements.container.style.paddingTop = '.5rem';
      }

      EMOJI_CATEGORIES.forEach(([id]) => {
        const category = this.categories[id];
        if(!category) {
          return;
        }

        this.toggleLocalCategory(category, true);

        if(id !== EMOJI_RECENT_ID && id !== CUSTOM_EMOJI_RECENT_ID) {
          category.menuScroll = this.menuInnerScroll;
          this.menuInnerScroll.container.append(category.elements.menuTab);
        }
      });

      this.resizeCategories();

      recentCategory && innerScrollWrapper && recentCategory.elements.menuTab.after(innerScrollWrapper);

      sets.sets.forEach((set) => {
        this.renderStickerSet(set);
      });

      this.listenerSetter.add(rootScope)('premium_toggle', () => {
        this.toggleCustomCategory();
      });

      this.listenerSetter.add(rootScope)('stickers_top', this.postponedEvent((id) => {
        const category = this.categories[id];
        if(!category) {
          return;
        }

        this.positionCategory(category, true);

        this.listenerSetter.add(emoticonsDropdown)('openAfterLayout', () => {
          this.menuOnClickResult.setActiveStatic(category);
        }, {once: true});
      }));

      const toggleRenderers = (ignore: boolean) => {
        for(const id in this.categories) {
          const category = this.categories[id];
          const renderer = category.elements.renderer;
          if(renderer) {
            renderer.ignoreSettingDimensions = ignore;
            if(!ignore) {
              renderer.setDimensionsFromRect(undefined, true);
            }
          }
        }
      };

      !this.isStandalone && this.listenerSetter.add(emoticonsDropdown)('opened', () => {
        toggleRenderers(false);
      });

      !this.isStandalone && this.listenerSetter.add(emoticonsDropdown)('close', () => {
        toggleRenderers(true);
      });

      this.listenerSetter.add(rootScope)('stickers_installed', (set) => {
        if(!this.categories[set.id] && set.pFlags.emojis) {
          this.renderStickerSet(set, true);
        }
      });

      this.listenerSetter.add(rootScope)('stickers_deleted', (set) => {
        const category = this.categories[set.id];
        if(this.deleteCategory(category)) {
          const {renderer} = category.elements;
          if(renderer) {
            renderer.middlewareHelper.clean();
          }
        }
      });

      !this.isStandalone && this.listenerSetter.add(rootScope)('emoji_recent', this.postponedEvent((emoji) => {
        const category = this.categories[emoji.docId ? CUSTOM_EMOJI_RECENT_ID : EMOJI_RECENT_ID];
        if(!category) {
          return;
        }

        const verify: (item: EmojiTabItem) => boolean = emoji.docId ?
          (item) => item.docId === emoji.docId :
          (item) => item.emoji === emoji.emoji;
        const found = findAndSplice(category.items, verify);
        if(found) {
          category.items.unshift(found);
          if(this.isCategoryVisible(category)) {
            const {renderer} = category.elements;
            positionElementByIndex(found.element, category.elements.items, renderer ? 1 : 0, -1);
            renderer?.forceRender();
          }
        } else {
          this.addEmojiToCategory({
            category,
            emoji,
            batch: false,
            prepend: true
          });
        }

        if(this.closeScrollTop === 0) {
          this.menuOnClickResult.setActive(emoji.docId ? this.categories[EMOJI_RECENT_ID] : category);
        }
      }));

      !this.isStandalone && this.listenerSetter.add(appImManager)('peer_changed', () => {
        this.toggleCustomCategory();
      });

      this.toggleCustomCategory();

      this.menuOnClickResult.setActive(recentCategory ?? recentCustomCategory);
    });

    attachClickEvent(this.content, this.onContentClick, {listenerSetter: this.listenerSetter});
    attachStickerViewerListeners({listenTo: this.content, listenerSetter: this.listenerSetter});

    return promise;
  }

  private renderStickerSet(set: StickerSet.stickerSet, prepend?: boolean) {
    const category = this.createCategory(set, wrapEmojiText(set.title));
    this.positionCategory(category, prepend);
    const {container, menuTabPadding} = category.elements;
    category.elements.items.classList.add('not-local');
    category.elements.container.classList.add('is-premium-set');
    category.elements.title.classList.add('tgico');

    this.createRendererForCategory(category);

    const promise = this.managers.appStickersManager.getStickerSet(set);
    promise.then(({documents}) => {
      documents.forEach((document) => {
        this.addEmojiToCategory({
          category,
          emoji: {docId: document.id, emoji: (document as Document.document).stickerEmojiRaw},
          batch: true
        });
      });

      // if(this.isCategoryVisible(category)) {
      //   category.elements.items.append(...category.items.map(({element}) => element));
      // }

      this.onCategoryVisibility({target: category.elements.container, visible: this.isCategoryVisible(category)});

      category.setCategoryItemsHeight();
      container.classList.remove('hide');
    });

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

  private get peerId() {
    return appImManager.chat.peerId;
  }

  public getCustomCategory() {
    return this.categories[CUSTOM_EMOJI_RECENT_ID];
  }

  private toggleCustomCategory() {
    const category = this.categories[CUSTOM_EMOJI_RECENT_ID];
    const hasPremium = rootScope.premium || this.peerId === rootScope.myId;
    const canSeeCustomCategory = hasPremium || this.isStandalone;
    super.toggleLocalCategory(category, !!category.items.length && canSeeCustomCategory);
    this.content.classList.toggle('has-premium', hasPremium);
  }

  protected toggleLocalCategory(category: EmojiTabCategory, visible: boolean) {
    if(category.id === CUSTOM_EMOJI_RECENT_ID) {
      this.toggleCustomCategory();
      return;
    }

    super.toggleLocalCategory(category, visible);
  }

  private createRendererForCategory(category: EmojiTabCategory) {
    const renderer = CustomEmojiRendererElement.create({
      animationGroup: EMOTICONSSTICKERGROUP,
      customEmojiSize: mediaSizes.active.esgCustomEmoji,
      textColor: 'primary-text-color'
    });

    category.elements.renderer = renderer;
    category.elements.items.append(renderer);
  }

  public addEmojiToCategory(options: {
    category: EmojiTabCategory,
    emoji?: ReturnType<typeof getEmojiFromElement>,
    element?: HTMLElement,
    batch?: boolean,
    prepend?: boolean,
    active?: boolean
  }) {
    const {category, emoji, batch, prepend} = options;
    let element = options.element;
    if(element) {
      const spanEmoji = document.createElement('span');
      spanEmoji.classList.add('super-emoji');
      spanEmoji.append(element);
      element = spanEmoji;
    } else if(emoji.docId) {
      const customEmojiElement = CustomEmojiElement.create(emoji.docId);
      const span = document.createElement('span');
      span.classList.add(/* 'emoji',  */'super-emoji');
      span.append(customEmojiElement);
      element = span;
    } else {
      element = appendEmoji(emoji.emoji/* .replace(/[\ufe0f\u2640\u2642\u2695]/g, '') */, undefined, false/* , false */);
    }

    const item: typeof category['items'][0] = {
      ...(emoji || {emoji: undefined}),
      element
    };

    if(
      options.active || (
        this.activeEmoji && (
          item.docId ?
            this.activeEmoji.docId === item.docId :
            this.activeEmoji.emoji === item.emoji
        )
      )
    ) {
      this.activeEmoji === emoji;
      this.activeElements.push(item);
      element.classList.add('active');
    }

    category.items[prepend ? 'unshift' : 'push'](item);
    if(!batch && !this.spliceExceed(category)) {
      this.onLocalCategoryUpdate(category);
    }
  }

  // private addEmojisToCategory(category: EmojiTabCategory, emojis: string[], prepend?: boolean) {
  //   emojis.forEach((emoji) => {
  //     this.addEmojiToCategory(category, emoji, true, prepend);
  //   });

  //   this.onLocalCategoryUpdate(category);
  // }

  private onContentClick = (e: MouseEvent) => {
    cancelEvent(e);

    const {target} = e;

    const container = findUpClassName(target, 'emoji-category');
    const category = this.categoriesMap.get(container);
    if(findUpClassName(target, 'category-title')) {
      if(category.local) {
        return;
      }

      PopupElement.createPopup(PopupStickers, {id: category.set.id, access_hash: category.set.access_hash}, true).show();
      return;
    }

    const emoji = getEmojiFromElement(target as HTMLElement);
    if(!emoji) {
      return;
    }

    if(
      emoji.docId &&
      !rootScope.premium && (
        this.isStandalone ? category.id !== CUSTOM_EMOJI_RECENT_ID : this.peerId !== rootScope.myId
      )
    ) {
      const a = document.createElement('a');
      a.onclick = () => {
        appImManager.openPremiumBot();
        hideToast();
      };
      toastNew({
        langPackKey: 'CustomEmoji.PremiumAlert',
        langPackArguments: [a]
      });
      return;
    }

    if(this.onClick) {
      this.onClick({
        ...emoji,
        element: findUpClassName(target, 'super-emoji').firstElementChild as HTMLElement
      });
    } else {
      appImManager.chat.input.onEmojiSelected(emoji, false);
    }

    if(IS_TOUCH_SUPPORTED) {
      blurActiveElement();
    }
  };

  public setActive(emoji: ReturnType<typeof getEmojiFromElement>) {
    if(
      emoji === this.activeEmoji ||
      emoji?.docId ? emoji.docId === this.activeEmoji?.docId : emoji?.emoji === this.activeEmoji?.emoji
    ) {
      return;
    }

    this.activeEmoji = emoji;

    this.activeElements.forEach((item) => {
      item.element.classList.remove('active');
    });

    this.activeElements.length = 0;

    this.categoriesMap.forEach((category) => {
      category.items.forEach((item) => {
        if(emoji.docId ? item.docId === emoji.docId : item.emoji === emoji.emoji) {
          item.element.classList.add('active');
          this.activeElements.push(item);
        }
      });
    });
  }

  public onClose() {
    this.closeScrollTop = this.scrollable.scrollTop;
  }
}
