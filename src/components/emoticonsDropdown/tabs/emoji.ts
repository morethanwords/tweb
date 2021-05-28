/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import emoticonsDropdown, { EmoticonsDropdown, EmoticonsTab } from "..";
import { cancelEvent } from "../../../helpers/dom/cancelEvent";
import findUpClassName from "../../../helpers/dom/findUpClassName";
import { fastRaf, pause } from "../../../helpers/schedulers";
import { isTouchSupported } from "../../../helpers/touchSupport";
import appEmojiManager from "../../../lib/appManagers/appEmojiManager";
import appImManager from "../../../lib/appManagers/appImManager";
import Config from "../../../lib/config";
import { i18n, LangPackKey } from "../../../lib/langPack";
import { RichTextProcessor } from "../../../lib/richtextprocessor";
import rootScope from "../../../lib/rootScope";
import { putPreloader } from "../../misc";
import Scrollable from "../../scrollable";
import StickyIntersector from "../../stickyIntersector";

const loadedURLs: Set<string> = new Set();
export function appendEmoji(emoji: string, container: HTMLElement, prepend = false, unify = false) {
  //const emoji = details.unified;
  //const emoji = (details.unified as string).split('-')
  //.reduce((prev, curr) => prev + String.fromCodePoint(parseInt(curr, 16)), '');

  const spanEmoji = document.createElement('span');
  spanEmoji.classList.add('super-emoji');

  let kek: string;
  if(unify) {
    kek = RichTextProcessor.wrapSingleEmoji(emoji);
  } else {
    emoji = RichTextProcessor.fixEmoji(emoji);
    kek = RichTextProcessor.wrapEmojiText(emoji);
  }

  /* if(!kek.includes('emoji')) {
    console.log(emoji, kek, spanEmoji, emoji.length, new TextEncoder().encode(emoji), emojiUnicode(emoji));
    return;
  } */

  //console.log(kek);

  spanEmoji.innerHTML = kek;

  if(spanEmoji.children.length > 1) {
    const first = spanEmoji.firstElementChild;
    spanEmoji.innerHTML = '';
    spanEmoji.append(first);
  }

  if(spanEmoji.firstElementChild && !RichTextProcessor.emojiSupported) {
    const image = spanEmoji.firstElementChild as HTMLImageElement;
    image.setAttribute('loading', 'lazy');

    const url = image.src;
    if(!loadedURLs.has(url)) {
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

  //spanEmoji = spanEmoji.firstElementChild as HTMLSpanElement;
  //spanEmoji.setAttribute('emoji', emoji);
  if(prepend) container.prepend(spanEmoji);
  else container.appendChild(spanEmoji);
}

export function getEmojiFromElement(element: HTMLElement) {
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

  init() {
    this.content = document.getElementById('content-emoji') as HTMLDivElement;

    const categories: LangPackKey[] = [
      'Emoji.SmilesAndPeople', 
      'Emoji.AnimalsAndNature', 
      'Emoji.FoodAndDrink', 
      'Emoji.TravelAndPlaces', 
      'Emoji.ActivityAndSport', 
      'Emoji.Objects', 
      /* 'Emoji.Symbols',  */
      'Emoji.Flags', 
      'Skin Tones' as any
    ];
    const divs: {
      [category in LangPackKey]?: HTMLDivElement
    } = {};

    const sorted: Map<LangPackKey, string[]> = new Map([
      [
        'Emoji.Recent',
        []
      ]
    ]);

    for(const emoji in Config.Emoji) {
      const details = Config.Emoji[emoji];
      const i = '' + details;
      const category = categories[+i[0] - 1];
      if(!category) continue; // maybe it's skin tones

      let s = sorted.get(category);
      if(!s) {
        s = [];
        sorted.set(category, s);
      }
      
      s[+i.slice(1) || 0] = emoji;
    }

    //console.log('emoticons sorted:', sorted);

    //Object.keys(sorted).forEach(c => sorted[c].sort((a, b) => a - b));

    sorted.delete(categories.pop());

    //console.time('emojiParse');
    sorted.forEach((emojis, category) => {
      const div = document.createElement('div');
      div.classList.add('emoji-category');

      const titleDiv = document.createElement('div');
      titleDiv.classList.add('category-title');
      titleDiv.append(i18n(category));

      const itemsDiv = document.createElement('div');
      itemsDiv.classList.add('super-emojis');

      div.append(titleDiv, itemsDiv);

      emojis.forEach(unified => {
        /* if(emojiUnicode(emoji) === '1f481-200d-2642') {
          console.log('append emoji', emoji, emojiUnicode(emoji));
        } */

        let emoji = unified.split('-').reduce((prev, curr) => prev + String.fromCodePoint(parseInt(curr, 16)), '');
        //if(emoji.includes('🕵')) {
          //console.log('toCodePoints', toCodePoints(emoji));
          //emoji = emoji.replace(/(\u200d[\u2640\u2642\u2695])(?!\ufe0f)/, '\ufe0f$1');
          // const zwjIndex = emoji.indexOf('\u200d');
          // if(zwjIndex !== -1 && !emoji.includes('\ufe0f')) {
          //   /* if(zwjIndex !== (emoji.length - 1)) {
          //     emoji = emoji.replace(/(\u200d)/g, '\ufe0f$1');
          //   } */

          //   emoji += '\ufe0f';
          //   //emoji += '\ufe0f';
          // }

          //debugger;
        //}

        appendEmoji(emoji/* .replace(/[\ufe0f\u2640\u2642\u2695]/g, '') */, itemsDiv, false/* , false */);

        /* if(category === 'Smileys & Emotion') {
          console.log('appended emoji', emoji, itemsDiv.children[itemsDiv.childElementCount - 1].innerHTML, emojiUnicode(emoji));
        } */
      });

      divs[category] = div;
    });

    //console.timeEnd('emojiParse');

    const menu = this.content.previousElementSibling as HTMLElement;
    const emojiScroll = this.scroll = new Scrollable(this.content, 'EMOJI');

    //emojiScroll.setVirtualContainer(emojiScroll.container);

    const preloader = putPreloader(this.content, true);

    Promise.all([
      pause(200),
      appEmojiManager.getRecentEmojis()
    ]).then(([_, recent]) => {
      preloader.remove();

      this.recentItemsDiv = divs['Emoji.Recent'].querySelector('.super-emojis');
      for(const emoji of recent) {
        appendEmoji(emoji, this.recentItemsDiv);
      }

      this.recentItemsDiv.parentElement.classList.toggle('hide', !this.recentItemsDiv.childElementCount);

      categories.unshift('Emoji.Recent');
      categories.map(category => {
        const div = divs[category];
  
        if(!div) {
          console.error('no div by category:', category);
        }
  
        emojiScroll.container.append(div);
        this.stickyIntersector.observeStickyHeaderChanges(div);
        return div;
      });
    });

    this.content.addEventListener('click', this.onContentClick);
    this.stickyIntersector = EmoticonsDropdown.menuOnClick(menu, emojiScroll);
    this.init = null;
  }

  onContentClick = (e: MouseEvent) => {
    cancelEvent(e);
    let target = e.target as HTMLElement;
    //if(target.tagName !== 'SPAN') return;

    if(target.tagName === 'SPAN' && !target.classList.contains('emoji')) {
      target = findUpClassName(target, 'super-emoji');
      if(!target) {
        return;
      }

      target = target.firstChild as HTMLElement;
    } else if(target.tagName === 'DIV') return;

    // set selection range
    const savedRange = isTouchSupported ? undefined : emoticonsDropdown.getSavedRange();
    let sel: Selection;
    if(savedRange) {
      sel = document.getSelection();
      sel.removeAllRanges();
      sel.addRange(savedRange);
    }

    const html = RichTextProcessor.emojiSupported ? 
      (target.nodeType === 3 ? target.nodeValue : target.innerHTML) : 
      target.outerHTML;

    if((document.activeElement && (document.activeElement.tagName === 'INPUT' || document.activeElement.hasAttribute('contenteditable'))) || 
      savedRange) {
      document.execCommand('insertHTML', true, html);
    } else {
      appImManager.chat.input.messageInput.innerHTML += html;
    }

    /* if(sel && isTouchSupported) {
      sel.removeRange(savedRange);
      blurActiveElement();
    } */

    // Recent
    const emoji = getEmojiFromElement(target);
    (Array.from(this.recentItemsDiv.children) as HTMLElement[]).forEach((el, idx) => {
      const _emoji = getEmojiFromElement(el);
      if(emoji === _emoji) {
        el.remove();
      }
    });
    
    appendEmoji(emoji, this.recentItemsDiv, true);

    appEmojiManager.pushRecentEmoji(emoji);
    this.recentItemsDiv.parentElement.classList.remove('hide');

    // Append to input
    const event = new Event('input', {bubbles: true, cancelable: true});
    appImManager.chat.input.messageInput.dispatchEvent(event);
  };

  onClose() {

  }
}
