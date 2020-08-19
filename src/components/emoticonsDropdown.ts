import appImManager from "../lib/appManagers/appImManager";
import { horizontalMenu, renderImageFromUrl, putPreloader } from "./misc";
import lottieLoader from "../lib/lottieLoader";
//import Scrollable from "./scrollable";
import Scrollable from "./scrollable_new";
import { findUpTag, whichChild, calcImageInBox, emojiUnicode, $rootScope } from "../lib/utils";
import { RichTextProcessor } from "../lib/richtextprocessor";
import appStickersManager, { MTStickerSet } from "../lib/appManagers/appStickersManager";
//import apiManager from '../lib/mtproto/apiManager';
import apiManager from '../lib/mtproto/mtprotoworker';
import LazyLoadQueue from "./lazyLoadQueue";
import { wrapSticker } from "./wrappers";
import appDocsManager from "../lib/appManagers/appDocsManager";
import ProgressivePreloader from "./preloader";
import Config, { touchSupport } from "../lib/config";
import { MTDocument } from "../types";
import animationIntersector from "./animationIntersector";
import appSidebarRight from "../lib/appManagers/appSidebarRight";
import appStateManager from "../lib/appManagers/appStateManager";

export const EMOTICONSSTICKERGROUP = 'emoticons-dropdown';

interface EmoticonsTab {
  init: () => void,
  onCloseAfterTimeout?: () => void
}

class EmojiTab implements EmoticonsTab {
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

class StickersTab implements EmoticonsTab {
  public content: HTMLElement;

  private stickerSets: {[id: string]: {
    stickers: HTMLElement,
    tab: HTMLElement
  }} = {};

  private recentDiv: HTMLElement;
  private recentStickers: MTDocument[] = [];

  private heights: number[] = [];
  private heightRAF = 0;
  private scroll: Scrollable;

  private menu: HTMLUListElement;
  
  private mounted = false;

  categoryPush(categoryDiv: HTMLElement, categoryTitle: string, docs: MTDocument[], prepend?: boolean) {
    //if((docs.length % 5) != 0) categoryDiv.classList.add('not-full');

    let itemsDiv = document.createElement('div');
    itemsDiv.classList.add('category-items');

    let titleDiv = document.createElement('div');
    titleDiv.classList.add('category-title');
    titleDiv.innerText = categoryTitle;

    categoryDiv.append(titleDiv, itemsDiv);

    docs.forEach(doc => {
      itemsDiv.append(this.renderSticker(doc));
    });

    if(prepend) {
      if(this.recentDiv.parentElement) {
        this.scroll.prepend(categoryDiv);
        this.scroll.prepend(this.recentDiv);
      } else {
        this.scroll.prepend(categoryDiv);
      }
    } else this.scroll.append(categoryDiv);

    /* let scrollHeight = categoryDiv.scrollHeight;
    let prevHeight = heights[heights.length - 1] || 0;
    //console.log('scrollHeight', scrollHeight, categoryDiv, stickersDiv.childElementCount);
    if(prepend && heights.length) {// all stickers loaded faster than recent
      heights.forEach((h, i) => heights[i] += scrollHeight);

      return heights.unshift(scrollHeight) - 1;
    } */

    this.setNewHeights();
    
    /* Array.from(stickersDiv.children).forEach((div, i) => {
      heights[i] = (heights[i - 1] || 0) + div.scrollHeight;
    }); */

    //this.scroll.onScroll();

    //return heights.push(prevHeight + scrollHeight) - 1;
  }

  setNewHeights() {
    if(this.heightRAF) return;
    //if(this.heightRAF) window.cancelAnimationFrame(this.heightRAF);
    this.heightRAF = window.requestAnimationFrame(() => {
      this.heightRAF = 0;

      const heights = this.heights;

      let paddingTop = parseInt(window.getComputedStyle(this.scroll.container).getPropertyValue('padding-top')) || 0;

      heights.length = 0;
      /* let concated = this.scroll.hiddenElements.up.concat(this.scroll.visibleElements, this.scroll.hiddenElements.down);
      concated.forEach((el, i) => {
        heights[i] = (heights[i - 1] || 0) + el.height + (i == 0 ? paddingTop : 0);
      }); */
      let concated = Array.from(this.scroll.splitUp.children) as HTMLElement[];
      concated.forEach((el, i) => {
        heights[i] = (heights[i - 1] || 0) + el.scrollHeight + (i == 0 ? paddingTop : 0);
      });

      this.scroll.reorder();

      //console.log('stickers concated', concated, heights);
    });
  }

  renderSticker(doc: MTDocument) {
    let div = document.createElement('div');
    wrapSticker({
      doc, 
      div,
      /* width: 80,
      height: 80,
      play: false,
      loop: false, */
      lazyLoadQueue: EmoticonsDropdown.lazyLoadQueue, 
      group: EMOTICONSSTICKERGROUP, 
      onlyThumb: true
    });

    return div;
  }

  async renderStickerSet(set: MTStickerSet, prepend = false) {
    let categoryDiv = document.createElement('div');
    categoryDiv.classList.add('sticker-category');

    let li = document.createElement('li');
    li.classList.add('btn-icon');

    this.stickerSets[set.id] = {
      stickers: categoryDiv,
      tab: li
    };

    if(prepend) {
      this.menu.insertBefore(li, this.menu.firstElementChild.nextSibling);
    } else {
      this.menu.append(li);
    }

    //stickersScroll.append(categoryDiv);

    let stickerSet = await appStickersManager.getStickerSet(set);

    //console.log('got stickerSet', stickerSet, li);
    
    if(stickerSet.set.thumb) {
      appStickersManager.getStickerSetThumb(stickerSet.set).then((blob) => {
        //console.log('setting thumb', stickerSet, blob);
        if(stickerSet.set.pFlags.animated) { // means animated
          const reader = new FileReader();

          reader.addEventListener('loadend', async(e) => {
            // @ts-ignore
            const text = e.srcElement.result;
            let json = await apiManager.gzipUncompress<string>(text, true);

            let animation = await lottieLoader.loadAnimationWorker({
              container: li,
              loop: true,
              autoplay: false,
              animationData: JSON.parse(json),
              width: 32,
              height: 32
            }, EMOTICONSSTICKERGROUP);
          });

          reader.readAsArrayBuffer(blob);
        } else {
          let image = new Image();
          renderImageFromUrl(image, URL.createObjectURL(blob));

          li.append(image);
        }
      });
    } else { // as thumb will be used first sticker
      wrapSticker({
        doc: stickerSet.documents[0],
        div: li as any, 
        group: EMOTICONSSTICKERGROUP
      }); // kostil
    }

    this.categoryPush(categoryDiv, stickerSet.set.title, stickerSet.documents, prepend);
  }

  init() {
    this.content = document.getElementById('content-stickers');
    //let stickersDiv = contentStickersDiv.querySelector('.os-content') as HTMLDivElement;

    this.recentDiv = document.createElement('div');
    this.recentDiv.classList.add('sticker-category');

    let menuWrapper = this.content.previousElementSibling as HTMLDivElement;
    this.menu = menuWrapper.firstElementChild.firstElementChild as HTMLUListElement;

    let menuScroll = new Scrollable(menuWrapper, 'x');

    let stickersDiv = document.createElement('div');
    stickersDiv.classList.add('stickers-categories');
    this.content.append(stickersDiv);

    /* stickersDiv.addEventListener('mouseover', (e) => {
      let target = e.target as HTMLElement;

      if(target.tagName == 'CANVAS') { // turn on sticker
        let animation = lottieLoader.getAnimation(target.parentElement, EMOTICONSSTICKERGROUP);

        if(animation) {
          // @ts-ignore
          if(animation.currentFrame == animation.totalFrames - 1) {
            animation.goToAndPlay(0, true);
          } else {
            animation.play();
          }
        }
      }
    }); */

    $rootScope.$on('stickers_installed', (e: CustomEvent) => {
      const set: MTStickerSet = e.detail;
      
      if(!this.stickerSets[set.id] && this.mounted) {
        this.renderStickerSet(set, true);
      }
    });

    $rootScope.$on('stickers_deleted', (e: CustomEvent) => {
      const set: MTStickerSet = e.detail;
      
      if(this.stickerSets[set.id] && this.mounted) {
        const elements = this.stickerSets[set.id];
        elements.stickers.remove();
        elements.tab.remove();
        this.setNewHeights();
        delete this.stickerSets[set.id];
      }
    });

    stickersDiv.addEventListener('click', EmoticonsDropdown.onMediaClick);

    let prevCategoryIndex = 0;
    this.scroll = new Scrollable(this.content, 'y', 'STICKERS', undefined, undefined, 2);
    this.scroll.container.addEventListener('scroll', (e) => {
      //animationIntersector.checkAnimations(false, EMOTICONSSTICKERGROUP);

      if(this.heights[1] == 0) {
        this.setNewHeights();
      }

      prevCategoryIndex = EmoticonsDropdown.contentOnScroll(this.menu, this.heights, prevCategoryIndex, this.scroll.container, menuScroll);
    });
    this.scroll.setVirtualContainer(stickersDiv);

    this.menu.addEventListener('click', () => {
      if(this.heights[1] == 0) {
        this.setNewHeights();
      }
    });

    EmoticonsDropdown.menuOnClick(this.menu, this.heights, this.scroll, menuScroll);

    const preloader = putPreloader(this.content, true);

    Promise.all([
      appStickersManager.getRecentStickers().then(stickers => {
        this.recentStickers = stickers.stickers.slice(0, 20);
  
        //stickersScroll.prepend(categoryDiv);

        this.stickerSets['recent'] = {
          stickers: this.recentDiv,
          tab: this.menu.firstElementChild as HTMLElement
        };

        preloader.remove();
        this.categoryPush(this.recentDiv, 'Recent', this.recentStickers, true);
      }),

      apiManager.invokeApi('messages.getAllStickers', {hash: 0}).then(async(res) => {
        let stickers: {
          _: 'messages.allStickers',
          hash: number,
          sets: Array<MTStickerSet>
        } = res as any;

        preloader.remove();

        for(let set of stickers.sets) {
          this.renderStickerSet(set);
        }
      })
    ]).finally(() => {
      this.mounted = true;
    });

    this.init = null;
  }

  pushRecentSticker(doc: MTDocument) {
    if(!this.recentDiv.parentElement) {
      return;
    }

    let div = this.recentDiv.querySelector(`[data-doc-i-d="${doc.id}"]`);
    if(!div) {
      div = this.renderSticker(doc);
    }

    const items = this.recentDiv.lastElementChild;
    items.prepend(div);

    if(items.childElementCount > 20) {
      (Array.from(items.children) as HTMLElement[]).slice(20).forEach(el => el.remove());
    }

    this.setNewHeights();
  }

  onClose() {

  }
}

class GifsTab implements EmoticonsTab {
  public content: HTMLElement;

  init() {
    this.content = document.getElementById('content-gifs');
    const masonry = this.content.firstElementChild as HTMLDivElement;

    masonry.addEventListener('click', EmoticonsDropdown.onMediaClick);

    const scroll = new Scrollable(this.content, 'y', 'GIFS', null);

    const preloader = putPreloader(this.content, true);

    const width = 400;
    const maxSingleWidth = width - 100;
    const height = 100;

    apiManager.invokeApi('messages.getSavedGifs', {hash: 0}).then((_res) => {
      let res = _res as {
        _: 'messages.savedGifs',
        gifs: MTDocument[],
        hash: number
      };
      //console.log('getSavedGifs res:', res);

      //let line: MTDocument[] = [];

      let wastedWidth = 0;

      res.gifs.forEach((gif, idx) => {
        res.gifs[idx] = appDocsManager.saveDoc(gif);
      });

      preloader.remove();

      for(let i = 0, length = res.gifs.length; i < length;) {
        let gif = res.gifs[i];

        let gifWidth = gif.w;
        let gifHeight = gif.h;
        if(gifHeight < height) {
          gifWidth = height / gifHeight * gifWidth;
          gifHeight = height;
        }

        let willUseWidth = Math.min(maxSingleWidth, width - wastedWidth, gifWidth);
        let {w, h} = calcImageInBox(gifWidth, gifHeight, willUseWidth, height);

        /* wastedWidth += w;

        if(wastedWidth == width || h < height) {
          wastedWidth = 0;
          console.log('completed line', i, line);
          line = [];
          continue;
        }

        line.push(gif); */
        ++i;

        //console.log('gif:', gif, w, h);

        let div = document.createElement('div');
        div.style.width = w + 'px';
        //div.style.height = h + 'px';
        div.dataset.docID = gif.id;

        masonry.append(div);

        let preloader = new ProgressivePreloader(div);
        EmoticonsDropdown.lazyLoadQueue.push({
          div, 
          load: () => {
            let promise = appDocsManager.downloadDoc(gif);
            preloader.attach(div, true, promise);
    
            promise.then(blob => {
              preloader.detach();

              div.innerHTML = `<video autoplay="true" muted="true" loop="true" src="${gif.url}" type="video/mp4"></video>`;
            });

            return promise;
          }
        });
      }
    });

    this.init = null;
  }

  onClose() {

  }
}

class EmoticonsDropdown {
  public static lazyLoadQueue = new LazyLoadQueue();
  private element: HTMLElement;

  public emojiTab: EmojiTab;
  public stickersTab: StickersTab;
  public gifsTab: GifsTab;

  private container: HTMLElement;
  private tabsEl: HTMLElement;
  private tabID = -1;

  private tabs: {[id: number]: EmoticonsTab};

  public searchButton: HTMLElement;
  public deleteBtn: HTMLElement;
  
  public toggleEl: HTMLElement;
  private displayTimeout: number;

  constructor() {
    this.element = document.getElementById('emoji-dropdown') as HTMLDivElement;

    let firstTime = true;
    this.toggleEl = document.getElementById('toggle-emoticons');
    if(touchSupport) {
      this.toggleEl.addEventListener('click', () => {
        if(firstTime) {
          firstTime = false;
          this.toggle(true);
        } else {
          this.toggle();
        }
      });
    } else {
      this.toggleEl.onmouseover = (e) => {
        clearTimeout(this.displayTimeout);
        //this.displayTimeout = setTimeout(() => {
          if(firstTime) {
            this.toggleEl.onmouseout = this.element.onmouseout = (e) => {
              clearTimeout(this.displayTimeout);
              this.displayTimeout = setTimeout(() => {
                this.toggle();
              }, 200);
            };
  
            this.element.onmouseover = (e) => {
              clearTimeout(this.displayTimeout);
            };

            firstTime = false;
          }

          this.toggle(true);
        //}, 0/* 200 */);
      };
    }
  }

  private init() {
    this.emojiTab = new EmojiTab();
    this.stickersTab = new StickersTab();
    this.gifsTab = new GifsTab();

    this.tabs = {
      0: this.emojiTab,
      1: this.stickersTab,
      2: this.gifsTab
    };

    this.container = this.element.querySelector('.emoji-container .tabs-container') as HTMLDivElement;
    this.tabsEl = this.element.querySelector('.emoji-tabs') as HTMLUListElement;
    horizontalMenu(this.tabsEl, this.container, (id) => {
      animationIntersector.checkAnimations(true, EMOTICONSSTICKERGROUP);

      this.tabID = id;
      this.searchButton.classList.toggle('hide', this.tabID != 1);
      this.deleteBtn.classList.toggle('hide', this.tabID != 0);
    }, () => {
      const tab = this.tabs[this.tabID];
      if(tab.init) {
        tab.init();
      }

      tab.onCloseAfterTimeout && tab.onCloseAfterTimeout();
      animationIntersector.checkAnimations(false, EMOTICONSSTICKERGROUP);
    });

    this.searchButton = this.element.querySelector('.emoji-tabs-search');
    this.searchButton.addEventListener('click', () => {
      appSidebarRight.stickersTab.init();
    });

    this.deleteBtn = this.element.querySelector('.emoji-tabs-delete');
    this.deleteBtn.addEventListener('click', () => {
      const input = appImManager.chatInputC.messageInput;
      if((input.lastChild as any)?.tagName) {
        input.lastElementChild.remove();
      } else if(input.lastChild) {
        if(!input.lastChild.textContent.length) {
          input.lastChild.remove();
        } else {
          input.lastChild.textContent = input.lastChild.textContent.slice(0, -1);
        }
      }

      const event = new Event('input', {bubbles: true, cancelable: true});
      appImManager.chatInputC.messageInput.dispatchEvent(event);
      //appSidebarRight.stickersTab.init();
    });

    (this.tabsEl.firstElementChild.children[1] as HTMLLIElement).click(); // set emoji tab
    this.tabs[0].init(); // onTransitionEnd не вызовется, т.к. это первая открытая вкладка
  }

  public toggle = async(enable?: boolean) => {
    //if(!this.element) return;
    const willBeActive = (!!this.element.style.display && enable === undefined) || enable;
    if(this.init) {
      if(willBeActive) {
        this.init();
        this.init = null;
      } else {
        return;
      }
    }

    if(touchSupport) {
      this.toggleEl.classList.toggle('flip-icon', willBeActive);
      if(willBeActive) {
        appImManager.chatInputC.saveScroll();
        // @ts-ignore
        document.activeElement.blur();
        await new Promise((resolve) => {
          setTimeout(resolve, 100);
        });
      }
    } else {
      this.toggleEl.classList.toggle('active', enable);
    }
    
    if((this.element.style.display && enable === undefined) || enable) {
      this.element.style.display = '';
      void this.element.offsetLeft; // reflow
      this.element.classList.add('active');

      EmoticonsDropdown.lazyLoadQueue.lockIntersection();
      //EmoticonsDropdown.lazyLoadQueue.unlock();
      animationIntersector.lockIntersectionGroup(EMOTICONSSTICKERGROUP);

      clearTimeout(this.displayTimeout);
      this.displayTimeout = setTimeout(() => {
        animationIntersector.unlockIntersectionGroup(EMOTICONSSTICKERGROUP);
        EmoticonsDropdown.lazyLoadQueue.unlockIntersection();
      }, touchSupport ? 0 : 200);

      /* if(touchSupport) {
        this.restoreScroll();
      } */
    } else {
      this.element.classList.remove('active');
      
      EmoticonsDropdown.lazyLoadQueue.lockIntersection();
      //EmoticonsDropdown.lazyLoadQueue.lock();

      // нужно залочить группу и выключить стикеры
      animationIntersector.lockIntersectionGroup(EMOTICONSSTICKERGROUP);
      animationIntersector.checkAnimations(true, EMOTICONSSTICKERGROUP);

      clearTimeout(this.displayTimeout);
      this.displayTimeout = setTimeout(() => {
        this.element.style.display = 'none';

        // теперь можно убрать visible, чтобы они не включились после фокуса
        animationIntersector.unlockIntersectionGroup(EMOTICONSSTICKERGROUP);

        EmoticonsDropdown.lazyLoadQueue.unlockIntersection();
      }, touchSupport ? 0 : 200);

      /* if(touchSupport) {
        this.restoreScroll();
      } */
    }

    //animationIntersector.checkAnimations(false, EMOTICONSSTICKERGROUP);
  };

  public static menuOnClick = (menu: HTMLUListElement, heights: number[], scroll: Scrollable, menuScroll?: Scrollable) => {
    menu.addEventListener('click', function(e) {
      let target = e.target as HTMLElement;
      target = findUpTag(target, 'LI');

      if(!target) {
        return;
      }

      let index = whichChild(target);
      let y = heights[index - 1/* 2 */] || 0; // 10 == padding .scrollable

      //console.log('emoticonsMenuOnClick', index, heights, target);

      /* if(menuScroll) {
        menuScroll.container.scrollLeft = target.scrollWidth * index;
      }
      console.log('emoticonsMenuOnClick', menu.getBoundingClientRect(), target.getBoundingClientRect());
 */
      /* scroll.onAddedBottom = () => { // привет, костыль, давно не виделись!
        scroll.container.scrollTop = y;
        scroll.onAddedBottom = () => {};
      }; */
      scroll.container.scrollTop = y;

      /* setTimeout(() => {
        animationIntersector.checkAnimations(true, EMOTICONSSTICKERGROUP);
      }, 100); */

      /* window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => {
          lottieLoader.checkAnimations(true, EMOTICONSSTICKERGROUP);
        });
      }); */
    });
  };

  public static contentOnScroll = (menu: HTMLUListElement, heights: number[], prevCategoryIndex: number, scroll: HTMLElement, menuScroll?: Scrollable) => {
    let y = Math.round(scroll.scrollTop);

    //console.log(heights, y);

    for(let i = 0; i < heights.length; ++i) {
      let height = heights[i];
      if(y < height) {
        menu.children[prevCategoryIndex].classList.remove('active');
        prevCategoryIndex = i/*  + 1 */;
        menu.children[prevCategoryIndex].classList.add('active');

        if(menuScroll) {
          if(i < heights.length - 4) {
            menuScroll.container.scrollLeft = (i - 3) * 47;
          } else {
            menuScroll.container.scrollLeft = i * 47;
          }
        }

        break;
      }
    }

    return prevCategoryIndex;
  };

  public static onMediaClick = (e: MouseEvent) => {
    let target = e.target as HTMLElement;
    target = findUpTag(target, 'DIV');

    if(!target) return;
    
    let fileID = target.dataset.docID;
    if(appImManager.chatInputC.sendMessageWithDocument(fileID)) {
      /* dropdown.classList.remove('active');
      toggleEl.classList.remove('active'); */
      emoticonsDropdown.toggle(false);
    } else {
      console.warn('got no doc by id:', fileID);
    }
  };
}

const emoticonsDropdown = new EmoticonsDropdown();
// @ts-ignore
if(process.env.NODE_ENV != 'production') {
  (window as any).emoticonsDropdown = emoticonsDropdown;
}
export default emoticonsDropdown;
