/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import type {MyDocument} from '../../../lib/appManagers/appDocsManager';
import {EMOJI_TEXT_COLOR, EmoticonsDropdown, EMOTICONSSTICKERGROUP} from '..';
import cancelEvent from '../../../helpers/dom/cancelEvent';
import findUpClassName from '../../../helpers/dom/findUpClassName';
import {fastRaf} from '../../../helpers/schedulers';
import pause from '../../../helpers/schedulers/pause';
import appImManager from '../../../lib/appManagers/appImManager';
import {i18n, LangPackKey} from '../../../lib/langPack';
import rootScope, {BroadcastEvents} from '../../../lib/rootScope';
import {emojiFromCodePoints} from '../../../vendor/emoji';
import {putPreloader} from '../../putPreloader';
import {ScrollableX} from '../../scrollable';
import IS_EMOJI_SUPPORTED from '../../../environment/emojiSupport';
import IS_TOUCH_SUPPORTED from '../../../environment/touchSupport';
import blurActiveElement from '../../../helpers/dom/blurActiveElement';
import Emoji from '../../../config/emoji';
import fixEmoji from '../../../lib/richTextProcessor/fixEmoji';
import wrapEmojiText from '../../../lib/richTextProcessor/wrapEmojiText';
import wrapSingleEmoji from '../../../lib/richTextProcessor/wrapSingleEmoji';
import {attachClickEvent} from '../../../helpers/dom/clickEvent';
import {makeMediaSize} from '../../../helpers/mediaSize';
import {AppManagers} from '../../../lib/appManagers/managers';
import VisibilityIntersector, {OnVisibilityChangeItem} from '../../visibilityIntersector';
import mediaSizes from '../../../helpers/mediaSizes';
import {StickerSet} from '../../../layer';
import findAndSplice from '../../../helpers/array/findAndSplice';
import positionElementByIndex from '../../../helpers/dom/positionElementByIndex';
import PopupStickers from '../../popups/stickers';
import {hideToast, toastNew} from '../../toast';
import safeAssign from '../../../helpers/object/safeAssign';
import liteMode from '../../../helpers/liteMode';
import PopupElement from '../../popups';
import CustomEmojiElement from '../../../lib/customEmoji/element';
import {CustomEmojiRendererElement} from '../../../lib/customEmoji/renderer';
import Icon from '../../icon';
import {NULL_PEER_ID} from '../../../lib/mtproto/mtproto_config';
import anchorCallback from '../../../helpers/dom/anchorCallback';
import apiManagerProxy from '../../../lib/mtproto/mtprotoworker';
import findUpAsChild from '../../../helpers/dom/findUpAsChild';
import {onCleanup} from 'solid-js';
import StickersTabCategory, {EmoticonsTabStyles} from '../category';
import EmoticonsTabC from '../tab';
import flatten from '../../../helpers/array/flatten';
import SuperStickerRenderer from './SuperStickerRenderer';
import StickersTab from './stickers';
import {PAID_REACTION_EMOJI_DOCID} from '../../../lib/customEmoji/constants';


const loadedURLs: Set<string> = new Set();
export function appendEmoji(_emoji: AppEmoji, unify = false) {
  if(_emoji.docId) {
    const customEmojiElement = CustomEmojiElement.create(_emoji.docId);
    const spanEmoji = document.createElement('span');
    spanEmoji.classList.add('super-emoji', 'super-emoji-custom');
    spanEmoji.append(customEmojiElement);
    return spanEmoji;
  }
  // const emoji = details.unified;
  // const emoji = (details.unified as string).split('-')
  // .reduce((prev, curr) => prev + String.fromCodePoint(parseInt(curr, 16)), '');

  let {emoji} = _emoji;
  const spanEmoji = document.createElement('span');
  spanEmoji.classList.add('super-emoji', 'super-emoji-regular');

  let el: DocumentFragment;
  if(unify && !IS_EMOJI_SUPPORTED) {
    el = wrapSingleEmoji(emoji);
  } else {
    emoji = fixEmoji(emoji);
    el = wrapEmojiText(emoji);
  }

  spanEmoji.append(el);

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

export const EMOJI_ELEMENT_SIZE = makeMediaSize(42, 42);
const RECENT_MAX_LENGTH = 32;

type EmojiTabItem = {element: HTMLElement} & ReturnType<typeof getEmojiFromElement>;
export type EmojiTabCategory = StickersTabCategory<EmojiTabItem, {renderer: CustomEmojiRendererElement}>;
export default class EmojiTab extends EmoticonsTabC<EmojiTabCategory, {emojis: AppEmoji[], localStickerSet?: {title: LangPackKey, stickers: MyDocument[]}}> {
  private closeScrollTop: number;
  private menuInnerScroll: ScrollableX;
  private isStandalone?: boolean;
  private noRegularEmoji?: boolean;
  private mainSets: () => (Promise<DocId[]> | Array<Promise<DocId[]>>);
  private additionalSets: () => Promise<StickerSet.stickerSet[]>;
  private additionalLocalStickerSet: () => Promise<{title: LangPackKey, stickers: MyDocument[]}>;
  private onClick: (emoji: EmojiTabItem) => void;
  private activeEmoji: ReturnType<typeof getEmojiFromElement>;
  private activeElements: EmojiTabItem[];
  private noPacks: boolean;
  private noSearch: boolean;
  private preloaderDelay: number;
  private freeCustomEmoji: Set<DocId>;
  private canHaveEmojiTimer?: boolean;
  private onReady: () => void;
  private stickerRenderer: SuperStickerRenderer;
  private showLocks: boolean;
  public initPromise: Promise<void>;

  constructor(options: {
    managers: AppManagers,
    isStandalone?: boolean,
    noRegularEmoji?: boolean,
    mainSets?: EmojiTab['mainSets'],
    additionalSets?: EmojiTab['additionalSets'],
    additionalLocalStickerSet?: EmojiTab['additionalLocalStickerSet'],
    onClick?: EmojiTab['onClick'],
    noPacks?: EmojiTab['noPacks'],
    noSearch?: EmojiTab['noSearch'],
    preloaderDelay?: EmojiTab['preloaderDelay'],
    freeCustomEmoji?: EmojiTab['freeCustomEmoji'],
    canHaveEmojiTimer?: EmojiTab['canHaveEmojiTimer'],
    onReady?: EmojiTab['onReady'],
    searchFetcher?: EmojiTab['searchFetcher'],
    groupFetcher?: EmojiTab['groupFetcher'],
    showLocks?: boolean
  }) {
    super({
      managers: options.managers,
      noMenu: options.noPacks,
      searchFetcher: options.noSearch ? undefined : async(value) => {
        if(!value) return {emojis: []};

        if(options.searchFetcher) {
          return options.searchFetcher(value);
        }

        return {emojis: await this.managers.appEmojiManager.prepareAndSearchEmojis({q: value, limit: Infinity, minChars: 1, addCustom: true})};
      },
      groupFetcher: options.groupFetcher ? options.groupFetcher : async(group) => {
        if(group?._ !== 'emojiGroup') return {emojis: []};

        if(options.groupFetcher) {
          return options.groupFetcher(group);
        }

        const emojiList = await this.managers.appEmojiManager.searchCustomEmoji(group.emoticons.join(''));

        const emojis: AppEmoji[] = [
          ...emojiList.document_id.map((docId) => ({docId, emoji: ''})),
          ...group.emoticons.map((emoji) => ({emoji}))
        ];

        return {emojis};
      },
      processSearchResult: async({data, searching, grouping}) => {
        const {emojis, localStickerSet} = data || {};
        if(!emojis || (!searching && !grouping)) {
          return;
        }

        if(!emojis.length && !localStickerSet) {
          const span = i18n('NoEmojiFound');
          span.classList.add('emoticons-not-found');
          return span;
        }

        const container = this.categoriesContainer.cloneNode(false) as HTMLElement;
        const category = this.createCategory({styles: EmoticonsTabStyles.Emoji});
        this.createEmojiRendererForCategory(category);
        for(const emoji of emojis) {
          this.addEmojiToCategory({
            category: category,
            emoji,
            batch: true
          });
        }
        category.setCategoryItemsHeight(emojis.length);
        category.elements.container.style.paddingTop = '.5rem';
        category.elements.container.classList.remove('hide');
        this._onCategoryVisibility(category, true);

        const renderedCategories: EmojiTabCategory[] = [category];
        if(localStickerSet) {
          const category = this.renderLocalStickerSet(localStickerSet);
          renderedCategories.push(category);
        }

        container.append(...renderedCategories.map((category) => category.elements.container));

        onCleanup(() => {
          renderedCategories.forEach((category) => {
            category.middlewareHelper.destroy();
          });
        });

        return container;
      },
      searchNoLoader: true,
      searchPlaceholder: 'SearchEmoji',
      searchType: 'emoji'
    });

    safeAssign(this, options);
    this.container.classList.add('emoji-padding');
    this.content.id = 'content-emoji';
    this.activeElements = [];
    this.freeCustomEmoji ??= new Set();
  }

  public _onCategoryVisibility(category: EmojiTabCategory, visible: boolean) {
    // console.log(target, visible, category);
    // if(category.local) return;

    const renderer = category.elements.renderer;
    const newChildren: HTMLElement[] = [];
    if(renderer) {
      newChildren.push(renderer);
      const customEmojis: Parameters<CustomEmojiRendererElement['add']>[0]['addCustomEmojis'] = new Map();
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

        renderer.add({
          addCustomEmojis: customEmojis
        });
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
      const customEmojis: Parameters<CustomEmojiRendererElement['add']>[0]['addCustomEmojis'] = new Map();
      category.items.forEach(({docId, element}) => {
        if(!docId) {
          return;
        }

        const customEmojiElement = element.firstElementChild as CustomEmojiElement;
        customEmojiElement.clear();
        customEmojis.set(customEmojiElement.docId, new Set([customEmojiElement]));
      });

      /* const promise =  */renderer.add({
        addCustomEmojis: customEmojis,
        onlyThumb: true
      });
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
  }

  private onCategoryVisibility = ({target, visible}: Pick<OnVisibilityChangeItem, 'target' | 'visible'>) => {
    this._onCategoryVisibility(this.categoriesMap.get(target), visible);
  };

  public destroy() {
    super.destroy();
    this.menuInnerScroll?.destroy();
  }

  public init() {
    super.init();
    this.init = undefined;

    const intersectionOptions: IntersectionObserverInit = {
      root: this.isStandalone ? this.content : this.emoticonsDropdown.getElement()
    };

    this.categoriesIntersector = new VisibilityIntersector(this.onCategoryVisibility, intersectionOptions);

    if(this.menu) this.menuOnClickResult = EmoticonsDropdown.menuOnClick(
      this,
      this.menu,
      this.scrollable,
      this.menuScroll,
      undefined,
      this.listenerSetter
    );

    const preloader = putPreloader(this.content, true);

    let innerScrollWrapper: HTMLElement;

    if(!this.isStandalone && this.menu) {
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

      if(this.menu) {
        preparedMap.set([EMOJI_RECENT_CATEGORY[0], ''], []);
      }
    }

    preparedMap.forEach((emojis, [titleLangPackKey, icon]) => {
      const category = this.createLocalCategory({
        id: titleLangPackKey,
        title: titleLangPackKey,
        icon: icon as Icon,
        noMenuTab: !icon,
        styles: EmoticonsTabStyles.Emoji
      });
      category.elements.container.classList.remove('hide');

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

    const mainSetsResult = this.mainSets?.();
    const promise = Promise.all([
      !this.preloaderDelay ? undefined : pause(this.preloaderDelay),
      !this.noRegularEmoji && this.managers.appEmojiManager.getRecentEmojis('native'),
      !this.isStandalone && this.managers.appEmojiManager.getRecentEmojis('custom'),
      !this.noPacks && Promise.resolve(apiManagerProxy.isPremiumFeaturesHidden()).then((isPremiumPurchaseHidden) => {
        return isPremiumPurchaseHidden ? undefined : this.managers.appEmojiManager.getCustomEmojis();
      }),
      mainSetsResult && Promise.all(Array.isArray(mainSetsResult) ? mainSetsResult : [mainSetsResult]),
      this.additionalSets?.(),
      this.additionalLocalStickerSet?.()
    ]).then(([_, recent, recentCustom, sets, mainSets, additionalSets, additionalLocalStickerSet]) => {
      preloader.remove();

      const docIdsToCustomEmoji = (docIds: DocId[]): ReturnType<typeof getEmojiFromElement>[] => {
        return docIds.map((docId) => {
          return {emoji: '', docId};
        });
      };

      let recentEmojis: ReturnType<typeof getEmojiFromElement>[], recentCustomEmojis: typeof recentEmojis;
      if(mainSets) {
        recentCustomEmojis = docIdsToCustomEmoji(mainSets[0]);
        if(mainSets[1]) recentEmojis = docIdsToCustomEmoji(mainSets[1]);
      }

      if(!recentEmojis && recent) {
        recentEmojis = recent.map((emoji) => ({emoji}));
      }

      if(!recentCustomEmojis && recentCustom) {
        recentCustomEmojis = docIdsToCustomEmoji(recentCustom);
      }

      const recentCategory = this.categories[EMOJI_RECENT_ID];
      const recentCustomCategory = this.categories[CUSTOM_EMOJI_RECENT_ID];

      if(!this.noRegularEmoji) {
        const a = [
          recentCategory && [recentCategory, recent] as const,
          recentCustomCategory && [recentCustomCategory, recentCustom] as const
        ];

        a.filter(Boolean).forEach(([category, recent]) => {
          category.limit = RECENT_MAX_LENGTH;
          recent.splice(RECENT_MAX_LENGTH, recent.length - RECENT_MAX_LENGTH);
        });
      }

      if(recentCategory) {
        this.createEmojiRendererForCategory(recentCategory);
        if(recentEmojis?.length) for(const emoji of recentEmojis) {
          this.addEmojiToCategory({
            category: recentCategory,
            emoji,
            batch: true
          });
        }
      }

      if(recentCustomCategory) {
        this.createEmojiRendererForCategory(recentCustomCategory);
        if(recentCustomEmojis?.length) for(const emoji of recentCustomEmojis) {
          this.addEmojiToCategory({
            category: recentCustomCategory,
            emoji,
            batch: true
          });
        }
        recentCustomCategory.elements.container.style.paddingTop = '.5rem';
        if(this.noMenu) {
          recentCustomCategory.elements.container.style.paddingBottom = '.5rem';
        }
      }

      EMOJI_CATEGORIES.forEach(([id]) => {
        const category = this.categories[id];
        if(!category) {
          return;
        }

        this.toggleLocalCategory(category, !!category.items.length);

        if(id !== EMOJI_RECENT_ID && id !== CUSTOM_EMOJI_RECENT_ID) {
          category.menuScroll = this.menuInnerScroll;
          this.menuInnerScroll.append(category.elements.menuTab);
        }
      });

      this.resizeCategories();

      if(recentCategory && innerScrollWrapper && recentCategory.elements.menuTab) {
        recentCategory.elements.menuTab.after(innerScrollWrapper);
      }

      flatten([sets?.sets, additionalSets].filter(Boolean)).forEach((set) => {
        this.renderEmojiSet(set);
      });

      if(additionalLocalStickerSet) {
        const category = this.renderLocalStickerSet(additionalLocalStickerSet);
        this.categoriesContainer.append(category.elements.container);
      }

      this.continueInit();
    });

    attachClickEvent(this.content, this.onContentClick, {listenerSetter: this.listenerSetter});

    const recentCategory = this.categories[EMOJI_RECENT_ID];
    const recentCustomCategory = this.categories[CUSTOM_EMOJI_RECENT_ID];
    this.attachHelpers({
      getTextColor: () => this.textColor,
      verifyRecent: (target) => !!(findUpAsChild(target, recentCustomCategory.elements.items) || findUpAsChild(target, recentCategory.elements.items)),
      canHaveEmojiTimer: this.canHaveEmojiTimer
    });

    return this.initPromise = promise;
  }

  private renderLocalStickerSet(localStickerSet: {title: LangPackKey, stickers: MyDocument[]}) {
    this.stickerRenderer ??= this.createStickerRenderer();
    const category = this.createLocalCategory({
      title: localStickerSet.title,
      styles: EmoticonsTabStyles.Stickers,
      noMenuTab: true
    });

    StickersTab.categoryAppendStickers(
      this,
      this.stickerRenderer,
      localStickerSet.stickers.length,
      category as any,
      localStickerSet.stickers
    ).then(() => {
      StickersTab._onCategoryVisibility(category, true);
    });

    category.elements.container.style.paddingBottom = (EmoticonsTabStyles.Stickers.padding / 2) + 'px';
    return category;
  }

  private continueInit() {
    this.listenerSetter.add(rootScope)('premium_toggle', () => {
      this.toggleCustomCategory();
    });

    this.listenerSetter.add(rootScope)('stickers_top', this.postponedEvent((id) => {
      const category = this.categories[id];
      if(!category) {
        return;
      }

      this.positionCategory(category, true);

      this.listenerSetter.add(this.emoticonsDropdown)('openAfterLayout', () => {
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

    !this.isStandalone && this.listenerSetter.add(this.emoticonsDropdown)('opened', () => {
      toggleRenderers(false);
    });

    !this.isStandalone && this.listenerSetter.add(this.emoticonsDropdown)('close', () => {
      toggleRenderers(true);
    });

    this.listenerSetter.add(rootScope)('stickers_installed', (set) => {
      if(!this.categories[set.id] && set.pFlags.emojis) {
        this.renderEmojiSet(set, true);
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

    const onEmojiRecent = ({emoji, deleted}: BroadcastEvents['emoji_recent']) => {
      const category = this.categories[emoji.docId ? CUSTOM_EMOJI_RECENT_ID : EMOJI_RECENT_ID];
      if(!category) {
        return;
      }

      const verify: (item: EmojiTabItem) => boolean = emoji.docId ?
        (item) => item.docId === emoji.docId :
        (item) => item.emoji === emoji.emoji;
      const found = findAndSplice(category.items, verify);
      if(deleted) {
        // * prevent second invocation
        findAndSplice(this.postponedEvents, (event) => event.cb === onEmojiRecent && (event.args[0] as BroadcastEvents['emoji_recent']).deleted);
        if(!found) {
          return;
        }

        found.element.remove();
        if(this.isCategoryVisible(category)) {
          this.onLocalCategoryUpdate(category);
        }
      } else if(found) {
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
    };

    !this.noRegularEmoji && this.listenerSetter.add(rootScope)('emoji_recent', this.postponedEvent(onEmojiRecent));
    !this.noRegularEmoji && this.listenerSetter.add(rootScope)('emoji_recent', onEmojiRecent);

    this.toggleCustomCategory();

    this.menuOnClickResult?.setActive([
      this.categories[EMOJI_RECENT_ID],
      this.categories[CUSTOM_EMOJI_RECENT_ID]
    ].find((category) => !!category.elements.menuTab));

    this.onReady?.();
  }

  private get peerId() {
    return this.emoticonsDropdown ? this.emoticonsDropdown.chatInput.chat.peerId : NULL_PEER_ID;
  }

  public getCustomCategory() {
    return this.categories[CUSTOM_EMOJI_RECENT_ID];
  }

  public toggleCustomCategory() {
    const category = this.categories[CUSTOM_EMOJI_RECENT_ID];
    const hasPremium = rootScope.premium || this.peerId === rootScope.myId || !!this.mainSets;
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

  public setTextColor(textColor: string = EMOJI_TEXT_COLOR) {
    this.categoriesMap.forEach((category) => {
      const renderer = category.elements.renderer;
      renderer?.setTextColor(textColor);
    });
  }

  public get textColor() {
    return this.emoticonsDropdown?.textColor || EMOJI_TEXT_COLOR;
  }

  protected renderEmojiSet(set: StickerSet.stickerSet, prepend?: boolean) {
    const category = this.createCategory({
      stickerSet: set,
      title: wrapEmojiText(set.title),
      styles: EmoticonsTabStyles.Emoji
    });
    this.positionCategory(category, prepend);
    const {container, menuTabPadding} = category.elements;
    category.elements.items.classList.add('not-local');
    category.elements.container.classList.add('is-premium-set');
    category.elements.title.prepend(Icon('premium_lock', 'category-title-lock'));

    this.createEmojiRendererForCategory(category);

    category.setCategoryItemsHeight(set.count);
    container.classList.remove('hide');

    const promise = this.managers.appStickersManager.getStickerSet(set);
    promise.then(({documents}) => {
      documents.forEach((document) => {
        this.addEmojiToCategory({
          category,
          emoji: {docId: document.id, emoji: (document as MyDocument).stickerEmojiRaw},
          batch: true
        });
      });

      // if(this.isCategoryVisible(category)) {
      //   category.elements.items.append(...category.items.map(({element}) => element));
      // }

      this.onCategoryVisibility({target: category.elements.container, visible: this.isCategoryVisible(category)});
    });

    this.renderStickerSetThumb({
      set,
      menuTabPadding,
      middleware: category.middlewareHelper.get(),
      textColor: this.textColor
    });
  }

  private createEmojiRendererForCategory(category: EmojiTabCategory) {
    const middleware = category.middlewareHelper.get();
    const renderer = CustomEmojiRendererElement.create({
      animationGroup: EMOTICONSSTICKERGROUP,
      customEmojiSize: mediaSizes.active.esgCustomEmoji,
      textColor: this.textColor,
      middleware
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
    } else {
      element = appendEmoji(emoji/* .replace(/[\ufe0f\u2640\u2642\u2695]/g, '') *//* , false */);

      if(this.showLocks && !this.canUseEmoji(emoji, category)) {
        element.append(Icon('premium_lock', 'premium-sticker-lock'));
      }
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

  public canUseEmoji(emoji: ReturnType<typeof getEmojiFromElement>, category?: EmojiTabCategory, showToast?: boolean) {
    if(emoji.docId === PAID_REACTION_EMOJI_DOCID) return true
    if(
      emoji.docId &&
      !rootScope.premium && (
        this.isStandalone && category ? category.id !== CUSTOM_EMOJI_RECENT_ID : this.peerId !== rootScope.myId
      ) && !this.freeCustomEmoji.has(emoji.docId)
    ) {
      if(showToast) {
        const a = anchorCallback(() => {
          hideToast();
          appImManager.openPremiumBot();
        });
        toastNew({
          langPackKey: 'CustomEmoji.PremiumAlert',
          langPackArguments: [a]
        });
      }

      return false;
    }

    return true;
  }

  private onContentClick = (e: MouseEvent) => {
    const {target} = e;
    const container = findUpClassName(target, 'emoji-category');
    if(!container) {
      return;
    }

    cancelEvent(e);
    const category = this.categoriesMap.get(container);
    if(!category) { // possibly sticker
      const sticker = findUpClassName(target, 'super-sticker');
      if(sticker) {
        this.onClick({
          emoji: '',
          docId: sticker.dataset.docId,
          element: sticker
        });
        return;
      }
    }

    if(findUpClassName(target, 'category-title')) {
      if(category.local) {
        return;
      }

      PopupElement.createPopup(
        PopupStickers,
        {
          id: category.set.id,
          access_hash: category.set.access_hash
        },
        true,
        this.emoticonsDropdown.chatInput
      ).show();
      return;
    }

    const emoji = getEmojiFromElement(target as HTMLElement);
    if(!emoji || !this.canUseEmoji(emoji, category, true)) {
      return;
    }

    if(this.onClick) {
      this.onClick({
        ...emoji,
        element: findUpClassName(target, 'super-emoji').firstElementChild as HTMLElement
      });
    } else {
      this.emoticonsDropdown.chatInput.onEmojiSelected(emoji, false);
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
    this.closeScrollTop = this.scrollable.scrollPosition;
  }
}
