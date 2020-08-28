import { EmoticonsTab, EmoticonsDropdown } from "..";
import Scrollable from "../../scrollable_new";
import Config from "../../../lib/config";
import { putPreloader } from "../../misc";
import appStateManager from "../../../lib/appManagers/appStateManager";
import { RichTextProcessor } from "../../../lib/richtextprocessor";
import appImManager from "../../../lib/appManagers/appImManager";

export default class EmojiTab implements EmoticonsTab {
  public content: HTMLElement;

  private recent: string[] = [];
  private recentItemsDiv: HTMLElement;

  private heights: number[] = [];
  private scroll: Scrollable;

  init() {
    this.content = document.getElementById('content-emoji') as HTMLDivElement;

    const categories = ["Smileys & Emotion", "Animals & Nature", "Food & Drink", "Travel & Places", "Activities", "Objects", /* "Symbols",  */"Flags", "Skin Tones"];
    const divs: {
      [category: string]: HTMLDivElement
    } = {};

    const sorted: {
      [category: string]: string[]
    } = {
      'Recent': []
    };

    for(const emoji in Config.Emoji) {
      const details = Config.Emoji[emoji];
      const i = '' + details;
      const category = categories[+i[0] - 1];
      if(!category) continue; // maybe it's skin tones

      if(!sorted[category]) sorted[category] = [];
      sorted[category][+i.slice(1) || 0] = emoji;
    }

    //console.log('emoticons sorted:', sorted);

    //Object.keys(sorted).forEach(c => sorted[c].sort((a, b) => a - b));

    categories.pop();
    delete sorted["Skin Tones"];

    //console.time('emojiParse');
    for(const category in sorted) {
      const div = document.createElement('div');
      div.classList.add('emoji-category');

      const titleDiv = document.createElement('div');
      titleDiv.classList.add('category-title');
      titleDiv.innerText = category;

      const itemsDiv = document.createElement('div');
      itemsDiv.classList.add('category-items');

      div.append(titleDiv, itemsDiv);

      const emojis = sorted[category];
      emojis.forEach(emoji => {
        /* if(emojiUnicode(emoji) == '1f481-200d-2642') {
          console.log('append emoji', emoji, emojiUnicode(emoji));
        } */

        this.appendEmoji(emoji/* .replace(/[\ufe0f\u2640\u2642\u2695]/g, '') */, itemsDiv);

        /* if(category == 'Smileys & Emotion') {
          console.log('appended emoji', emoji, itemsDiv.children[itemsDiv.childElementCount - 1].innerHTML, emojiUnicode(emoji));
        } */
      });

      divs[category] = div;
    }
    //console.timeEnd('emojiParse');

    let prevCategoryIndex = 0;
    const menu = this.content.previousElementSibling.firstElementChild as HTMLUListElement;
    const emojiScroll = this.scroll = new Scrollable(this.content, 'y', 'EMOJI', null);
    emojiScroll.container.addEventListener('scroll', (e) => {
      prevCategoryIndex = EmoticonsDropdown.contentOnScroll(menu, this.heights, prevCategoryIndex, emojiScroll.container);
    });
    //emojiScroll.setVirtualContainer(emojiScroll.container);

    const preloader = putPreloader(this.content, true);

    Promise.all([
      new Promise((resolve) => setTimeout(resolve, 200)),

      appStateManager.getState().then(state => {
        if(Array.isArray(state.recentEmoji)) {
          this.recent = state.recentEmoji;
        }
      })
    ]).then(() => {
      preloader.remove();

      this.recentItemsDiv = divs['Recent'].querySelector('.category-items');
      for(const emoji of this.recent) {
        this.appendEmoji(emoji, this.recentItemsDiv);
      }

      categories.unshift('Recent');
      categories.map(category => {
        const div = divs[category];
  
        if(!div) {
          console.error('no div by category:', category);
        }
  
        emojiScroll.append(div);
        return div;
      }).forEach(div => {
        //console.log('emoji heights push: ', (heights[heights.length - 1] || 0) + div.scrollHeight, div, div.scrollHeight);
        this.heights.push((this.heights[this.heights.length - 1] || 0) + div.scrollHeight);
      });
    });

    this.content.addEventListener('click', this.onContentClick);
    EmoticonsDropdown.menuOnClick(menu, this.heights, emojiScroll);
    this.init = null;
  }

  private appendEmoji(emoji: string, container: HTMLElement, prepend = false) {
    //const emoji = details.unified;
    //const emoji = (details.unified as string).split('-')
    //.reduce((prev, curr) => prev + String.fromCodePoint(parseInt(curr, 16)), '');

    const spanEmoji = document.createElement('span');
    const kek = RichTextProcessor.wrapEmojiText(emoji);

    /* if(!kek.includes('emoji')) {
      console.log(emoji, kek, spanEmoji, emoji.length, new TextEncoder().encode(emoji), emojiUnicode(emoji));
      return;
    } */
  
    //console.log(kek);
  
    spanEmoji.innerHTML = kek;

    if(spanEmoji.firstElementChild) {
      (spanEmoji.firstElementChild as HTMLImageElement).setAttribute('loading', 'lazy');
    }
  
    //spanEmoji = spanEmoji.firstElementChild as HTMLSpanElement;
    //spanEmoji.setAttribute('emoji', emoji);
    if(prepend) container.prepend(spanEmoji);
    else container.appendChild(spanEmoji);
  }

  private getEmojiFromElement(element: HTMLElement) {
    if(element.tagName == 'SPAN' && !element.classList.contains('emoji')) {
      element = element.firstElementChild as HTMLElement;
    }
    
    return element.getAttribute('alt') || element.innerText;
  }

  onContentClick = (e: MouseEvent) => {
    let target = e.target as HTMLElement;
    //if(target.tagName != 'SPAN') return;

    if(target.tagName == 'SPAN' && !target.classList.contains('emoji')) {
      target = target.firstElementChild as HTMLElement;
    } else if(target.tagName == 'DIV') return;

    //console.log('contentEmoji div', target);

    appImManager.chatInputC.messageInput.innerHTML += target.outerHTML;

    // Recent
    const emoji = this.getEmojiFromElement(target);
    (Array.from(this.recentItemsDiv.children) as HTMLElement[]).forEach((el, idx) => {
      const _emoji = this.getEmojiFromElement(el);
      if(emoji == _emoji) {
        el.remove();
      }
    });
    const scrollHeight = this.recentItemsDiv.scrollHeight;
    this.appendEmoji(emoji, this.recentItemsDiv, true);

    // нужно поставить новые размеры для скролла
    if(this.recentItemsDiv.scrollHeight != scrollHeight) {
      this.heights.length = 0;
      (Array.from(this.scroll.container.children) as HTMLElement[]).forEach(div => {
        this.heights.push((this.heights[this.heights.length - 1] || 0) + div.scrollHeight);
      });
    }

    this.recent.findAndSplice(e => e == emoji);
    this.recent.unshift(emoji);
    if(this.recent.length > 36) {
      this.recent.length = 36;
    }

    appStateManager.pushToState('recentEmoji', this.recent);

    // Append to input
    const event = new Event('input', {bubbles: true, cancelable: true});
    appImManager.chatInputC.messageInput.dispatchEvent(event);
  };

  onClose() {

  }
}