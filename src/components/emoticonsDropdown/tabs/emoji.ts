/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import emoticonsDropdown, {EmoticonsDropdown, EmoticonsTab} from '..';
import cancelEvent from '../../../helpers/dom/cancelEvent';
import findUpClassName from '../../../helpers/dom/findUpClassName';
import {fastRaf} from '../../../helpers/schedulers';
import pause from '../../../helpers/schedulers/pause';
import appImManager from '../../../lib/appManagers/appImManager';
import {i18n, LangPackKey} from '../../../lib/langPack';
import rootScope from '../../../lib/rootScope';
import {emojiFromCodePoints} from '../../../vendor/emoji';
import {putPreloader} from '../../putPreloader';
import Scrollable, {ScrollableX} from '../../scrollable';
import StickyIntersector from '../../stickyIntersector';
import IS_EMOJI_SUPPORTED from '../../../environment/emojiSupport';
import IS_TOUCH_SUPPORTED from '../../../environment/touchSupport';
import blurActiveElement from '../../../helpers/dom/blurActiveElement';
import Emoji from '../../../config/emoji';
import {AppManagers} from '../../../lib/appManagers/managers';
import fixEmoji from '../../../lib/richTextProcessor/fixEmoji';
import wrapEmojiText from '../../../lib/richTextProcessor/wrapEmojiText';
import wrapSingleEmoji from '../../../lib/richTextProcessor/wrapSingleEmoji';
import {attachClickEvent} from '../../../helpers/dom/clickEvent';
import {StickersTabCategory} from './stickers';
import positionElementByIndex from '../../../helpers/dom/positionElementByIndex';

const loadedURLs: Set<string> = new Set();
export function appendEmoji(emoji: string, container: HTMLElement, prepend = false, unify = false) {
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
  if(prepend) container.prepend(spanEmoji);
  else container.appendChild(spanEmoji);
}

export function getEmojiFromElement(element: HTMLElement) {
  if(!findUpClassName(element, 'super-emoji')) return '';

  if(element.nodeType === 3) return element.nodeValue;
  if(element.tagName === 'SPAN' && !element.classList.contains('emoji') && element.firstElementChild) {
    element = element.firstElementChild as HTMLElement;
  }

  return element.getAttribute('alt') || element.innerText;
}

export default class EmojiTab implements EmoticonsTab {
  private content: HTMLElement;

  private recentItemsDiv: HTMLElement;

  private scroll: Scrollable;
  private stickyIntersector: StickyIntersector;
  private menu: HTMLElement;

  private closeScrollTop = 0;
  private setMenuActive: (id: number) => boolean;

  constructor(private managers: AppManagers) {

  }

  init() {
    this.content = document.getElementById('content-emoji') as HTMLDivElement;

    const EMOJI_RECENT_CATEGORY: (typeof EMOJI_CATEGORIES)[0] = ['Emoji.Recent', 'recent'];
    const EMOJI_CATEGORIES: [LangPackKey, string][] = [
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
    const divs: {
      [category in LangPackKey]?: StickersTabCategory
    } = {};

    const sorted: Map<(typeof EMOJI_CATEGORIES)[0], string[]> = new Map([
      [
        EMOJI_RECENT_CATEGORY,
        []
      ]
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

    sorted.forEach((emojis, emojiCategory) => {
      const titleLangPackKey = emojiCategory[0];
      const category = new StickersTabCategory({
        id: titleLangPackKey,
        overflowElement: this.content,
        title: i18n(titleLangPackKey),
        getElementMediaSize: () => undefined
      });

      category.elements.menuTab.classList.add('tgico', 'tgico-' + emojiCategory[1]);
      category.elements.menuTabPadding.remove();
      category.elements.items.classList.add('super-emojis');

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

        appendEmoji(emoji/* .replace(/[\ufe0f\u2640\u2642\u2695]/g, '') */, category.elements.items, false/* , false */);

        /* if(category === 'Smileys & Emotion') {
          console.log('appended emoji', emoji, itemsDiv.children[itemsDiv.childElementCount - 1].innerHTML, emojiUnicode(emoji));
        } */
      });

      divs[titleLangPackKey] = category;
    });

    const menuWrapper = this.content.previousElementSibling as HTMLElement;
    const menu = this.menu = menuWrapper.firstElementChild as HTMLElement;
    const menuScroll = new ScrollableX(menuWrapper);

    const emojiScroll = this.scroll = new Scrollable(this.content, 'EMOJI');

    const preloader = putPreloader(this.content, true);

    Promise.all([
      pause(200),
      this.managers.appEmojiManager.getRecentEmojis()
    ]).then(([_, recent]) => {
      preloader.remove();

      const m = EmoticonsDropdown.menuOnClick(menu, emojiScroll, menuScroll);
      this.stickyIntersector = m.stickyIntersector;
      this.setMenuActive = m.setActive;

      const hasRecent = !!recent.length;
      const activeId = hasRecent ? 0 : 1;
      const recentCategory = divs[EMOJI_RECENT_CATEGORY[0]];
      recentCategory.elements.menuTab.classList.toggle('hide', !hasRecent);

      this.recentItemsDiv = recentCategory.elements.items;
      for(const emoji of recent) {
        appendEmoji(emoji, this.recentItemsDiv);
      }

      recentCategory.elements.container.classList.toggle('hide', !this.recentItemsDiv.childElementCount);

      EMOJI_CATEGORIES.unshift(EMOJI_RECENT_CATEGORY);
      EMOJI_CATEGORIES.map(([id], idx) => {
        const category = divs[id];

        positionElementByIndex(category.elements.menuTab, menu, idx);
        emojiScroll.container.append(category.elements.container);
        this.stickyIntersector.observeStickyHeaderChanges(category.elements.container);
        return category;
      });

      this.menu.children[activeId].classList.add('active');
      this.setMenuActive(activeId);
    });

    attachClickEvent(this.content, this.onContentClick);
    this.init = null;

    rootScope.addEventListener('emoji_recent', (emoji) => {
      const children = Array.from(this.recentItemsDiv.children) as HTMLElement[];
      for(let i = 0, length = children.length; i < length; ++i) {
        const el = children[i];
        const _emoji = fixEmoji(getEmojiFromElement(el));
        if(emoji === _emoji) {
          if(i === 0) {
            return;
          }

          el.remove();
        }
      }

      appendEmoji(emoji, this.recentItemsDiv, true);
      this.recentItemsDiv.parentElement.classList.remove('hide');
      this.menu.children[0].classList.remove('hide');

      if(!this.closeScrollTop) {
        this.setMenuActive(0);
      }
    });

    emoticonsDropdown.addEventListener('close', () => {
      this.closeScrollTop = this.scroll.scrollTop;
    });
  }

  onContentClick = (e: MouseEvent) => {
    cancelEvent(e);

    const emoji = getEmojiFromElement(e.target as HTMLElement);
    if(!emoji) {
      return;
    }

    appImManager.chat.input.onEmojiSelected(emoji, false);
    if(IS_TOUCH_SUPPORTED) {
      blurActiveElement();
    }
  };

  onClose() {

  }
}
