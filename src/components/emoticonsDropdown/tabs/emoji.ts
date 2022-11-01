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
    spanEmoji.innerHTML = '';
    spanEmoji.append(first);
  }

  if(spanEmoji.firstElementChild?.tagName === 'IMG') {
    const image = spanEmoji.firstElementChild as HTMLImageElement;

    const url = image.src;
    if(!loadedURLs.has(url)) {
      image.setAttribute('loading', 'lazy');
      const placeholder = document.createElement('span');
      placeholder.classList.add('emoji-placeholder');

      if(rootScope.settings.animationsEnabled) {
        image.style.opacity = '0';
        placeholder.style.opacity = '1';
      }

      image.addEventListener('load', () => {
        fastRaf(() => {
          if(rootScope.settings.animationsEnabled) {
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

function prepare() {
  let sorted: Map<(typeof EMOJI_CATEGORIES)[0], string[]> = new Map([
    [CUSTOM_EMOJI_RECENT_CATEGORY, []],
    [EMOJI_RECENT_CATEGORY, []]
  ]);

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

  constructor(managers: AppManagers) {
    super(
      managers,
      'super-emojis',
      () => EMOJI_ELEMENT_SIZE,
      16,
      4,
      0
    );
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
      category.items.forEach(({element}) => {
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

  public init() {
    super.init();

    this.content = document.getElementById('content-emoji') as HTMLDivElement;

    const menuWrapper = this.content.previousElementSibling as HTMLElement;
    const menu = this.menu = menuWrapper.firstElementChild as HTMLElement;
    const menuScroll = this.menuScroll = new ScrollableX(menuWrapper);

    const emojiScroll = this.scrollable = new Scrollable(this.content, 'EMOJI');

    const intersectionOptions: IntersectionObserverInit = {root: emoticonsDropdown.getElement()};
    this.categoriesIntersector = new VisibilityIntersector(this.onCategoryVisibility, intersectionOptions);

    const m = this.menuOnClickResult = EmoticonsDropdown.menuOnClick(this, menu, emojiScroll, menuScroll, undefined);

    const preloader = putPreloader(this.content, true);

    const x = new ScrollableX(undefined);
    x.container.classList.add('menu-horizontal-inner-scroll');

    const innerScrollWrapper = document.createElement('div');
    innerScrollWrapper.classList.add('menu-horizontal-inner');
    innerScrollWrapper.append(x.container);

    prepare().forEach((emojis, [titleLangPackKey, icon]) => {
      const category = this.createLocalCategory(titleLangPackKey, titleLangPackKey, icon, !icon);
      category.elements.container.classList.remove('hide');
      category.elements.items.classList.add(icon ? 'is-local' : 'not-local');

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

        this.addEmojiToCategory(category, {emoji}, true);

        /* if(category === 'Smileys & Emotion') {
          console.log('appended emoji', emoji, itemsDiv.children[itemsDiv.childElementCount - 1].innerHTML, emojiUnicode(emoji));
        } */
      });
    });

    Promise.all([
      pause(200),
      this.managers.appEmojiManager.getRecentEmojis('native'),
      this.managers.appEmojiManager.getRecentEmojis('custom'),
      this.managers.appEmojiManager.getCustomEmojis()
    ]).then(([_, recent, recentCustom, sets]) => {
      preloader.remove();

      const recentCategory = this.categories[EMOJI_RECENT_ID];
      const recentCustomCategory = this.categories[CUSTOM_EMOJI_RECENT_ID];

      [[recentCategory, recent] as const, [recentCustomCategory, recentCustom] as const].forEach(([category, recent]) => {
        category.limit = RECENT_MAX_LENGTH;
        recent.splice(RECENT_MAX_LENGTH, recent.length - RECENT_MAX_LENGTH);
      });

      for(const emoji of recent) {
        this.addEmojiToCategory(recentCategory, {emoji}, true);
      }

      this.createRendererForCategory(recentCustomCategory);
      for(const docId of recentCustom) {
        this.addEmojiToCategory(recentCustomCategory, {emoji: '', docId}, true);
      }
      recentCustomCategory.elements.container.style.paddingTop = '.5rem';

      EMOJI_CATEGORIES.forEach(([id]) => {
        const category = this.categories[id];
        this.toggleLocalCategory(category, true);

        if(id !== EMOJI_RECENT_ID && id !== CUSTOM_EMOJI_RECENT_ID) {
          category.menuScroll = x;
          x.container.append(category.elements.menuTab);
        }
      });

      this.resizeCategories();

      recentCategory.elements.menuTab.after(innerScrollWrapper);

      sets.sets.forEach((set) => {
        this.renderStickerSet(set);
      });

      rootScope.addEventListener('premium_toggle', () => {
        this.toggleCustomCategory();
      });

      rootScope.addEventListener('stickers_top', this.postponedEvent((id) => {
        const category = this.categories[id];
        if(category) {
          this.positionCategory(category, true);

          emoticonsDropdown.addEventListener('openAfterLayout', () => {
            this.menuOnClickResult.setActiveStatic(category);
          }, {once: true});
        }
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

      emoticonsDropdown.addEventListener('opened', () => {
        toggleRenderers(false);
      });

      emoticonsDropdown.addEventListener('close', () => {
        toggleRenderers(true);
      });

      rootScope.addEventListener('stickers_installed', (set) => {
        if(!this.categories[set.id] && set.pFlags.emojis) {
          this.renderStickerSet(set, true);
        }
      });

      rootScope.addEventListener('stickers_deleted', (set) => {
        const category = this.categories[set.id];
        if(this.deleteCategory(category)) {
          const {renderer} = category.elements;
          if(renderer) {
            renderer.middlewareHelper.clean();
          }
        }
      });

      rootScope.addEventListener('emoji_recent', this.postponedEvent((emoji) => {
        const category = this.categories[emoji.docId ? CUSTOM_EMOJI_RECENT_ID : EMOJI_RECENT_ID];

        const verify: (item: EmojiTabItem) => boolean = emoji.docId ? (item) => item.docId === emoji.docId : (item) => item.emoji === emoji.emoji;
        const found = findAndSplice(category.items, verify);
        if(found) {
          category.items.unshift(found);
          if(this.isCategoryVisible(category)) {
            const {renderer} = category.elements;
            positionElementByIndex(found.element, category.elements.items, renderer ? 1 : 0, -1);
            renderer?.forceRender();
          }
        } else {
          this.addEmojiToCategory(category, emoji, false, true);
        }

        if(this.closeScrollTop === 0) {
          this.menuOnClickResult.setActive(emoji.docId ? this.categories[EMOJI_RECENT_ID] : category);
        }
      }));

      appImManager.addEventListener('peer_changed', () => {
        this.toggleCustomCategory();
      });

      this.toggleCustomCategory();

      this.menuOnClickResult.setActive(recentCategory);
    });

    attachClickEvent(this.content, this.onContentClick);
    attachStickerViewerListeners({listenTo: this.content, listenerSetter: new ListenerSetter()});
    this.init = null;
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
        this.addEmojiToCategory(category, {docId: document.id, emoji: (document as Document.document).stickerEmojiRaw}, true);
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

  private toggleCustomCategory() {
    const category = this.categories[CUSTOM_EMOJI_RECENT_ID];
    const hasPremium = rootScope.premium || this.peerId === rootScope.myId;
    super.toggleLocalCategory(category, !!category.items.length && hasPremium);
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
      customEmojiSize: mediaSizes.active.esgCustomEmoji
    });

    category.elements.renderer = renderer;
    category.elements.items.append(renderer);
  }

  private addEmojiToCategory(category: EmojiTabCategory, emoji: ReturnType<typeof getEmojiFromElement>, batch?: boolean, prepend?: boolean) {
    let element: HTMLElement;
    if(emoji.docId) {
      const customEmojiElement = CustomEmojiElement.create(emoji.docId);
      const span = document.createElement('span');
      span.classList.add(/* 'emoji',  */'super-emoji');
      span.append(customEmojiElement);
      element = span;
    } else {
      element = appendEmoji(emoji.emoji/* .replace(/[\ufe0f\u2640\u2642\u2695]/g, '') */, undefined, false/* , false */);
    }

    const item: typeof category['items'][0] = {
      ...emoji,
      element
    };

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

    if(findUpClassName(target, 'category-title')) {
      const container = findUpClassName(target, 'emoji-category');
      const category = this.categoriesMap.get(container);
      if(category.local) {
        return;
      }

      new PopupStickers({id: category.set.id, access_hash: category.set.access_hash}, true).show();
      return;
    }

    const emoji = getEmojiFromElement(target as HTMLElement);
    if(!emoji) {
      return;
    }

    if(emoji.docId && !rootScope.premium && this.peerId !== rootScope.myId) {
      const a = document.createElement('a');
      a.onclick = () => {
        appImManager.openUsername({userName: 'premiumbot'});
        hideToast();
      };
      toastNew({
        langPackKey: 'CustomEmoji.PremiumAlert',
        langPackArguments: [a]
      });
      return;
    }

    appImManager.chat.input.onEmojiSelected(emoji, false);
    if(IS_TOUCH_SUPPORTED) {
      blurActiveElement();
    }
  };

  public onClose() {
    this.closeScrollTop = this.scrollable.scrollTop;
  }
}
