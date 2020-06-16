import appImManager from "../lib/appManagers/appImManager";
import { horizontalMenu, renderImageFromUrl, putPreloader } from "./misc";
import lottieLoader from "../lib/lottieLoader";
//import Scrollable from "./scrollable";
import Scrollable from "./scrollable_new";
import { findUpTag, whichChild, calcImageInBox } from "../lib/utils";
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

export const EMOTICONSSTICKERGROUP = 'emoticons-dropdown';

interface EmoticonsTab {
  init: () => void,
  onCloseAfterTimeout?: () => void
}

class EmojiTab implements EmoticonsTab {
  public content: HTMLElement;

  init() {
    this.content = document.getElementById('content-emoji') as HTMLDivElement;

    const categories = ["Smileys & Emotion", "Animals & Nature", "Food & Drink", "Travel & Places", "Activities", "Objects", /* "Symbols",  */"Flags", "Skin Tones"];
    const divs: {
      [category: string]: HTMLDivElement
    } = {};

    const sorted: {
      [category: string]: string[]
    } = {};

    for(const emoji in Config.Emoji) {
      const details = Config.Emoji[emoji];
      const i = '' + details;
      const category = categories[+i[0] - 1];
      if(!category) continue; // maybe it's skin tones

      if(!sorted[category]) sorted[category] = [];
      sorted[category][+i.slice(1) || 0] = emoji;
    }

    console.log('emoticons sorted:', sorted);

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
        //const emoji = details.unified;
        //const emoji = (details.unified as string).split('-')
          //.reduce((prev, curr) => prev + String.fromCodePoint(parseInt(curr, 16)), '');

        const spanEmoji = document.createElement('span');
        const kek = RichTextProcessor.wrapRichText(emoji);

        if(!kek.includes('emoji')) {
          console.log(emoji, kek, spanEmoji, emoji.length, new TextEncoder().encode(emoji));
          return;
        }

        //console.log(kek);

        spanEmoji.innerHTML = kek;

        //spanEmoji = spanEmoji.firstElementChild as HTMLSpanElement;
        //spanEmoji.setAttribute('emoji', emoji);
        itemsDiv.appendChild(spanEmoji);
      });

      divs[category] = div;
    }
    //console.timeEnd('emojiParse');

    const heights: number[] = [0];

    let prevCategoryIndex = 1;
    const menu = this.content.previousElementSibling.firstElementChild as HTMLUListElement;
    const emojiScroll = new Scrollable(this.content, 'y', 'EMOJI', null);
    emojiScroll.container.addEventListener('scroll', (e) => {
      prevCategoryIndex = EmoticonsDropdown.contentOnScroll(menu, heights, prevCategoryIndex, emojiScroll.container);
    });
    //emojiScroll.setVirtualContainer(emojiScroll.container);

    const preloader = putPreloader(this.content, true);

    setTimeout(() => {
      preloader.remove();

      categories.map(category => {
        const div = divs[category];
  
        if(!div) {
          console.error('no div by category:', category);
        }
  
        emojiScroll.append(div);
        return div;
      }).forEach(div => {
        //console.log('emoji heights push: ', (heights[heights.length - 1] || 0) + div.scrollHeight, div, div.scrollHeight);
        heights.push((heights[heights.length - 1] || 0) + div.scrollHeight);
      });
    }, 200);

    this.content.addEventListener('click', this.onContentClick);
    EmoticonsDropdown.menuOnClick(menu, heights, emojiScroll);
    this.init = null;
  }

  onContentClick = (e: MouseEvent) => {
    let target = e.target as any;
    //if(target.tagName != 'SPAN') return;

    if(target.tagName == 'SPAN' && !target.classList.contains('emoji')) {
      target = target.firstElementChild;
    } else if(target.tagName == 'DIV') return;

    //console.log('contentEmoji div', target);

    appImManager.chatInputC.messageInput.innerHTML += target.outerHTML;

    const event = new Event('input', {bubbles: true, cancelable: true});
    appImManager.chatInputC.messageInput.dispatchEvent(event);
  };

  onClose() {

  }
}

class StickersTab implements EmoticonsTab {
  public content: HTMLElement;

  init() {
    this.content = document.getElementById('content-stickers');
    //let stickersDiv = contentStickersDiv.querySelector('.os-content') as HTMLDivElement;

    let menuWrapper = this.content.previousElementSibling as HTMLDivElement;
    let menu = menuWrapper.firstElementChild.firstElementChild as HTMLUListElement;

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

    stickersDiv.addEventListener('click', EmoticonsDropdown.onMediaClick);

    let heights: number[] = [];

    let heightRAF = 0;
    let categoryPush = (categoryDiv: HTMLDivElement, categoryTitle: string, docs: MTDocument[], prepend?: boolean) => {
      //if((docs.length % 5) != 0) categoryDiv.classList.add('not-full');

      let itemsDiv = document.createElement('div');
      itemsDiv.classList.add('category-items');

      let titleDiv = document.createElement('div');
      titleDiv.classList.add('category-title');
      titleDiv.innerText = categoryTitle;

      categoryDiv.append(titleDiv, itemsDiv);

      docs.forEach(doc => {
        let div = document.createElement('div');
        wrapSticker({
          doc, 
          div, 
          lazyLoadQueue: EmoticonsDropdown.lazyLoadQueue, 
          group: EMOTICONSSTICKERGROUP, 
          onlyThumb: true
        });

        itemsDiv.append(div);
      });

      if(prepend) stickersScroll.prepend(categoryDiv);
      else stickersScroll.append(categoryDiv);

      /* let scrollHeight = categoryDiv.scrollHeight;
      let prevHeight = heights[heights.length - 1] || 0;
      //console.log('scrollHeight', scrollHeight, categoryDiv, stickersDiv.childElementCount);
      if(prepend && heights.length) {// all stickers loaded faster than recent
        heights.forEach((h, i) => heights[i] += scrollHeight);

        return heights.unshift(scrollHeight) - 1;
      } */

      if(heightRAF) window.cancelAnimationFrame(heightRAF);
      heightRAF = window.requestAnimationFrame(() => {
        heightRAF = 0;

        let paddingTop = parseInt(window.getComputedStyle(stickersScroll.container).getPropertyValue('padding-top')) || 0;

        heights.length = 0;
        /* let concated = stickersScroll.hiddenElements.up.concat(stickersScroll.visibleElements, stickersScroll.hiddenElements.down);
        concated.forEach((el, i) => {
          heights[i] = (heights[i - 1] || 0) + el.height + (i == 0 ? paddingTop : 0);
        }); */
        let concated = Array.from(stickersScroll.splitUp.children) as HTMLElement[];
        concated.forEach((el, i) => {
          heights[i] = (heights[i - 1] || 0) + el.scrollHeight + (i == 0 ? paddingTop : 0);
        });
  
        //console.log('stickers concated', concated, heights);
      });
      
      /* Array.from(stickersDiv.children).forEach((div, i) => {
        heights[i] = (heights[i - 1] || 0) + div.scrollHeight;
      }); */

      //stickersScroll.onScroll();

      //return heights.push(prevHeight + scrollHeight) - 1;
    };

    let prevCategoryIndex = 0;
    let stickersScroll = new Scrollable(this.content, 'y', 'STICKERS', undefined, undefined, 2);
    stickersScroll.container.addEventListener('scroll', (e) => {
      animationIntersector.checkAnimations(false, EMOTICONSSTICKERGROUP);

      prevCategoryIndex = EmoticonsDropdown.contentOnScroll(menu, heights, prevCategoryIndex, stickersScroll.container, menuScroll);
    });
    stickersScroll.setVirtualContainer(stickersDiv);

    EmoticonsDropdown.menuOnClick(menu, heights, stickersScroll, menuScroll);

    const preloader = putPreloader(this.content, true);

    Promise.all([
      appStickersManager.getRecentStickers().then(stickers => {
        let categoryDiv = document.createElement('div');
        categoryDiv.classList.add('sticker-category');
  
        //stickersScroll.prepend(categoryDiv);
        
        preloader.remove();
        categoryPush(categoryDiv, 'Recent', stickers.stickers, true);
      }),

      apiManager.invokeApi('messages.getAllStickers', {hash: 0}).then(async(res) => {
        let stickers: {
          _: 'messages.allStickers',
          hash: number,
          sets: Array<MTStickerSet>
        } = res as any;

        preloader.remove();

        for(let set of stickers.sets) {
          let categoryDiv = document.createElement('div');
          categoryDiv.classList.add('sticker-category');
  
          let li = document.createElement('li');
          li.classList.add('btn-icon');
  
          menu.append(li);
  
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
                    width: 40,
                    height: 40
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
  
          categoryPush(categoryDiv, stickerSet.set.title, stickerSet.documents, false);
        }
      })
    ]);

    this.init = null;
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

  private emojiTab: EmojiTab;
  private stickersTab: StickersTab;
  private gifsTab: GifsTab;

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
      EmoticonsDropdown.lazyLoadQueue.unlock();
      clearTimeout(this.displayTimeout);

      /* if(touchSupport) {
        this.restoreScroll();
      } */
    } else {
      this.element.classList.remove('active');
      animationIntersector.checkAnimations(true, EMOTICONSSTICKERGROUP);
      EmoticonsDropdown.lazyLoadQueue.lock();

      clearTimeout(this.displayTimeout);
      this.displayTimeout = setTimeout(() => {
        this.element.style.display = 'none';
      }, touchSupport ? 0 : 200);

      /* if(touchSupport) {
        this.restoreScroll();
      } */
    }

    animationIntersector.checkAnimations(false, EMOTICONSSTICKERGROUP);
  };

  public static menuOnClick = (menu: HTMLUListElement, heights: number[], scroll: Scrollable, menuScroll?: Scrollable) => {
    menu.addEventListener('click', function(e) {
      let target = e.target as HTMLLIElement;
      target = findUpTag(target, 'LI');

      let index = whichChild(target);
      let y = heights[index - 1/* 2 */] || 0; // 10 == padding .scrollable

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

      setTimeout(() => {
        animationIntersector.checkAnimations(true, EMOTICONSSTICKERGROUP);
      }, 100);

      /* window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => {
          lottieLoader.checkAnimations(true, EMOTICONSSTICKERGROUP);
        });
      }); */
    });
  };

  public static contentOnScroll = (menu: HTMLUListElement, heights: number[], prevCategoryIndex: number, scroll: HTMLDivElement, menuScroll?: Scrollable) => {
    let y = scroll.scrollTop;

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
    let target = e.target as HTMLDivElement;
    target = findUpTag(target, 'DIV');
    
    let fileID = target.dataset.docID;
    if(appImManager.chatInputC.sendMessageWithDocument(fileID)) {
      /* dropdown.classList.remove('active');
      toggleEl.classList.remove('active'); */
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
