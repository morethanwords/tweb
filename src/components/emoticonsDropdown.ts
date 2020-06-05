import { AppImManager } from "../lib/appManagers/appImManager";
import { AppMessagesManager } from "../lib/appManagers/appMessagesManager";
import { horizontalMenu, renderImageFromUrl } from "./misc";
import lottieLoader from "../lib/lottieLoader";
//import Scrollable from "./scrollable";
import Scrollable from "./scrollable_new";
import { findUpTag, whichChild, calcImageInBox } from "../lib/utils";
import { RichTextProcessor } from "../lib/richtextprocessor";
import appStickersManager, { MTStickerSet } from "../lib/appManagers/appStickersManager";
//import apiManager from '../lib/mtproto/apiManager';
import apiManager from '../lib/mtproto/mtprotoworker';
//import CryptoWorker from '../lib/crypto/cryptoworker';
import LazyLoadQueue from "./lazyLoadQueue";
import { MTDocument, wrapSticker } from "./wrappers";
import appDocsManager from "../lib/appManagers/appDocsManager";
import ProgressivePreloader from "./preloader";
import Config from "../lib/config";

export const EMOTICONSSTICKERGROUP = 'emoticons-dropdown';

const initEmoticonsDropdown = (pageEl: HTMLDivElement, 
  appImManager: AppImManager, appMessagesManager: AppMessagesManager, 
  messageInput: HTMLDivElement, toggleEl: HTMLButtonElement, btnSend: HTMLButtonElement) => {
  let dropdown = pageEl.querySelector('.emoji-dropdown') as HTMLDivElement;
  dropdown.classList.add('active'); // need

  let lazyLoadQueue = new LazyLoadQueue(5);

  let container = pageEl.querySelector('.emoji-container .tabs-container') as HTMLDivElement;
  let tabs = pageEl.querySelector('.emoji-dropdown .emoji-tabs') as HTMLUListElement;
  let tabID = -1;
  horizontalMenu(tabs, container, (id) => {
    lottieLoader.checkAnimations(true, EMOTICONSSTICKERGROUP);

    tabID = id;
  }, () => {
    if(tabID == 1 && stickersInit) {
      stickersInit();
    } else if(tabID == 2 && gifsInit) {
      gifsInit();
    }

    lottieLoader.checkAnimations(false, EMOTICONSSTICKERGROUP);
  });

  (tabs.firstElementChild.children[0] as HTMLLIElement).click(); // set emoji tab
  (tabs.lastElementChild as HTMLSpanElement).style.cssText = 'width: 44.1719px; transform: translateX(88.5781px);'; // мы снова встретились))))))

  let emoticonsMenuOnClick = (menu: HTMLUListElement, heights: number[], scroll: Scrollable, menuScroll?: Scrollable) => {
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
        lottieLoader.checkAnimations(true, EMOTICONSSTICKERGROUP);
      }, 100);

      /* window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => {
          lottieLoader.checkAnimations(true, EMOTICONSSTICKERGROUP);
        });
      }); */
    });
  };

  let emoticonsContentOnScroll = (menu: HTMLUListElement, heights: number[], prevCategoryIndex: number, scroll: HTMLDivElement, menuScroll?: Scrollable) => {
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

  {
    const categories = ["Smileys & Emotion", "Animals & Nature", "Food & Drink", "Travel & Places", "Activities", "Objects", /* "Symbols",  */"Flags", "Skin Tones"];
    let divs: {
      [category: string]: HTMLDivElement
    } = {};

    let sorted: {
      [category: string]: string[]
    } = {};

    for(let emoji in Config.Emoji) {
      let details = Config.Emoji[emoji];
      let i = '' + details;
      let category = categories[+i[0] - 1];
      if(!category) continue; // maybe it's skin tones

      if(!sorted[category]) sorted[category] = [];
      sorted[category][+i.slice(1) || 0] = emoji;
    }

    console.log('emoticons sorted:', sorted);

    //Object.keys(sorted).forEach(c => sorted[c].sort((a, b) => a - b));

    categories.pop();
    delete sorted["Skin Tones"];

    //console.time('emojiParse');
    for(let category in sorted) {
      let div = document.createElement('div');
      div.classList.add('emoji-category');

      let titleDiv = document.createElement('div');
      titleDiv.classList.add('category-title');
      titleDiv.innerText = category;

      let itemsDiv = document.createElement('div');
      itemsDiv.classList.add('category-items');

      div.append(titleDiv, itemsDiv);

      let emojis = sorted[category];
      emojis.forEach(emoji => {
        //let emoji = details.unified;
        //let emoji = (details.unified as string).split('-')
          //.reduce((prev, curr) => prev + String.fromCodePoint(parseInt(curr, 16)), '');

        let spanEmoji = document.createElement('span');
        let kek = RichTextProcessor.wrapRichText(emoji);

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

    let contentEmojiDiv = document.getElementById('content-emoji') as HTMLDivElement;
    let heights: number[] = [0];

    let prevCategoryIndex = 1;
    let menu = contentEmojiDiv.nextElementSibling.firstElementChild as HTMLUListElement;
    let emojiScroll = new Scrollable(contentEmojiDiv, 'y', 'EMOJI', null);
    emojiScroll.container.addEventListener('scroll', (e) => {
      prevCategoryIndex = emoticonsContentOnScroll(menu, heights, prevCategoryIndex, emojiScroll.container);
    });
    //emojiScroll.setVirtualContainer(emojiScroll.container);

    categories.map(category => {
      let div = divs[category];

      if(!div) {
        console.error('no div by category:', category);
      }

      emojiScroll.append(div);
      return div;
    }).forEach(div => {
      //console.log('emoji heights push: ', (heights[heights.length - 1] || 0) + div.scrollHeight, div, div.scrollHeight);
      heights.push((heights[heights.length - 1] || 0) + div.scrollHeight);
    });

    contentEmojiDiv.addEventListener('click', function(e) {
      let target = e.target as any;
      //if(target.tagName != 'SPAN') return;

      if(target.tagName == 'SPAN' && !target.classList.contains('emoji')) {
        target = target.firstElementChild;
      } else if(target.tagName == 'DIV') return;

      //console.log('contentEmoji div', target);

      /* if(!target.classList.contains('emoji')) {
        target = target.parentElement as HTMLSpanElement;

        if(!target.classList.contains('emoji')) {
          return;
        }
      }  */

      //messageInput.innerHTML += target.innerHTML;
      messageInput.innerHTML += target.outerHTML;

      btnSend.classList.add('tgico-send');
      btnSend.classList.remove('tgico-microphone2');
    });

    emoticonsMenuOnClick(menu, heights, emojiScroll);
  }

  let onMediaClick = (e: MouseEvent) => {
    let target = e.target as HTMLDivElement;
    target = findUpTag(target, 'DIV');
    
    let fileID = target.dataset.docID;
    let document = appDocsManager.getDoc(fileID);
    if(document._ != 'documentEmpty') {
      appMessagesManager.sendFile(appImManager.peerID, document, {isMedia: true});
      appImManager.chatInputC.onMessageSent(false);
      dropdown.classList.remove('active');
      toggleEl.classList.remove('active');
    } else {
      console.warn('got no doc by id:', fileID);
    }
  };

  let stickersInit = () => {
    let contentStickersDiv = document.getElementById('content-stickers') as HTMLDivElement;
    //let stickersDiv = contentStickersDiv.querySelector('.os-content') as HTMLDivElement;

    let menuWrapper = contentStickersDiv.nextElementSibling as HTMLDivElement;
    let menu = menuWrapper.firstElementChild.firstElementChild as HTMLUListElement;

    let menuScroll = new Scrollable(menuWrapper, 'x');

    let stickersDiv = document.createElement('div');
    stickersDiv.classList.add('stickers-categories');
    contentStickersDiv.append(stickersDiv);

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

    stickersDiv.addEventListener('click', onMediaClick);

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
          lazyLoadQueue, 
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
    let stickersScroll = new Scrollable(contentStickersDiv, 'y', 'STICKERS', undefined, undefined, 2);
    stickersScroll.container.addEventListener('scroll', (e) => {
      lottieLoader.checkAnimations();

      prevCategoryIndex = emoticonsContentOnScroll(menu, heights, prevCategoryIndex, stickersScroll.container, menuScroll);
    });
    stickersScroll.setVirtualContainer(stickersDiv);

    emoticonsMenuOnClick(menu, heights, stickersScroll, menuScroll);

    stickersInit = null;

    Promise.all([
      appStickersManager.getRecentStickers().then(stickers => {
        let categoryDiv = document.createElement('div');
        categoryDiv.classList.add('sticker-category');
  
        //stickersScroll.prepend(categoryDiv);
        
        categoryPush(categoryDiv, 'Recent', stickers.stickers, true);
      }),

      apiManager.invokeApi('messages.getAllStickers', {hash: 0}).then(async(res) => {
        let stickers: {
          _: 'messages.allStickers',
          hash: number,
          sets: Array<MTStickerSet>
        } = res as any;

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
  };

  let gifsInit = () => {
    let contentDiv = document.getElementById('content-gifs') as HTMLDivElement;
    let masonry = contentDiv.firstElementChild as HTMLDivElement;

    masonry.addEventListener('click', onMediaClick);

    let scroll = new Scrollable(contentDiv, 'y', 'GIFS', null);

    let width = 400;
    let maxSingleWidth = width - 100;
    let height = 100;

    apiManager.invokeApi('messages.getSavedGifs', {hash: 0}).then((_res) => {
      let res = _res as {
        _: 'messages.savedGifs',
        gifs: MTDocument[],
        hash: number
      };
      console.log('getSavedGifs res:', res);

      let line: MTDocument[] = [];

      let wastedWidth = 0;

      res.gifs.forEach((gif, idx) => {
        res.gifs[idx] = appDocsManager.saveDoc(gif);
      });

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

        console.log('gif:', gif, w, h);

        let div = document.createElement('div');
        div.style.width = w + 'px';
        //div.style.height = h + 'px';
        div.dataset.docID = gif.id;

        masonry.append(div);

        let preloader = new ProgressivePreloader(div);
        lazyLoadQueue.push({
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

    gifsInit = undefined;
  };

  return {dropdown, lazyLoadQueue};
};

export default initEmoticonsDropdown;
