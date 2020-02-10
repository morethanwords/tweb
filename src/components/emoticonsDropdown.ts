import { AppImManager } from "../lib/appManagers/appImManager";
import { AppMessagesManager } from "../lib/appManagers/appMessagesManager";
import { LazyLoadQueue, horizontalMenu, MTDocument, wrapSticker } from "./misc";
import lottieLoader from "../lib/lottieLoader";
import Scrollable from "./scrollable";
import { findUpTag, whichChild } from "../lib/utils";
import { RichTextProcessor } from "../lib/richtextprocessor";
import appStickersManager, { MTStickerSet } from "../lib/appManagers/appStickersManager";
import apiManager from '../lib/mtproto/apiManager';
import CryptoWorker from '../lib/crypto/cryptoworker';

export const EMOTICONSSTICKERGROUP = 'emoticons-dropdown';

const initEmoticonsDropdown = (pageEl: HTMLDivElement, 
  appImManager: AppImManager, appMessagesManager: AppMessagesManager, 
  messageInput: HTMLDivElement, toggleEl: HTMLButtonElement, btnSend: HTMLButtonElement) => {
  let dropdown = pageEl.querySelector('.emoji-dropdown') as HTMLDivElement;
  dropdown.classList.add('active'); // need

  let lazyLoadQueue = new LazyLoadQueue();

  let container = pageEl.querySelector('.emoji-container .tabs-container') as HTMLDivElement;
  let tabs = pageEl.querySelector('.emoji-dropdown .emoji-tabs') as HTMLUListElement;
  horizontalMenu(tabs, container, (id) => {
    lottieLoader.checkAnimations(true, EMOTICONSSTICKERGROUP);

    if(id == 1 && stickersInit) {
      stickersInit();
    }
  }, () => {
    lottieLoader.checkAnimations(false, EMOTICONSSTICKERGROUP);
    lazyLoadQueue.check(); // for stickers
  });
  (tabs.children[0] as HTMLLIElement).click(); // set media

  let emoticonsMenuOnClick = (menu: HTMLUListElement, heights: number[], scroll: Scrollable) => {
    menu.addEventListener('click', function(e) {
      let target = e.target as HTMLLIElement;
      target = findUpTag(target, 'LI');

      let index = whichChild(target);
      let y = heights[index - 1/* 2 */] || 0; // 10 == padding .scrollable

      console.log('emoticonsMenuOnClick', index, y, scroll.container.scrollHeight, scroll);

      scroll.onAddedBottom = () => { // привет, костыль, давно не виделись!
        scroll.container.scrollTop = y;
        scroll.onAddedBottom = () => {};
      };
      scroll.container.scrollTop = y;
    });
  };

  let emoticonsContentOnScroll = (menu: HTMLUListElement, heights: number[], prevCategoryIndex: number, scroll: HTMLDivElement) => {
    let y = scroll.scrollTop;

    //console.log(heights, y);

    for(let i = 0; i < heights.length; ++i) {
      let height = heights[i];
      if(y < height) {
        menu.children[prevCategoryIndex].classList.remove('active');
        prevCategoryIndex = i/*  + 1 */;
        menu.children[prevCategoryIndex].classList.add('active');

        break;
      }
    }

    return prevCategoryIndex;
  };

  {
    let categories = ["Smileys & Emotion", "Animals & Nature", "Food & Drink", "Travel & Places", "Activities", "Objects", "Symbols", "Flags", "Skin Tones"];
    let divs: {
      [category: string]: HTMLDivElement
    } = {};

    let keyCategory = Config.Emoji.keyCategory;
    let sorted: {
      [category: string]: any[]
    } = {};

    for(let unified in Config.Emoji.emoji) {
      // @ts-ignore
      let details = Config.Emoji.emoji[unified];
      let category = details[keyCategory];

      details.unified = unified;

      if(!sorted[category]) sorted[category] = [];
      sorted[category][details.sort_order] = details;
    }

    Object.keys(sorted).forEach(c => sorted[c].sort());

    categories.pop();
    delete sorted["Skin Tones"];

    console.time('emojiParse');
    for(let category in sorted) {
      let div = document.createElement('div');
      div.classList.add('emoji-category');

      let emojis = sorted[category];
      emojis.forEach(details => {
        let emoji = details.unified;
        //let emoji = (details.unified as string).split('-')
          //.reduce((prev, curr) => prev + String.fromCodePoint(parseInt(curr, 16)), '');

        let spanEmoji = document.createElement('span');
        let kek = RichTextProcessor.wrapRichText(emoji);

        if(!kek.includes('emoji')) {
          console.log(details, emoji, kek, spanEmoji, emoji.length, new TextEncoder().encode(emoji));
          return;
        }

        //console.log(kek);

        spanEmoji.innerHTML = kek;

        //spanEmoji = spanEmoji.firstElementChild as HTMLSpanElement;
        //spanEmoji.setAttribute('emoji', emoji);
        div.appendChild(spanEmoji);
      });

      divs[category] = div;
    }
    console.timeEnd('emojiParse');

    let heights: number[] = [0];

    let contentEmojiDiv = document.getElementById('content-emoji') as HTMLDivElement;
    categories.forEach(category => {
      let div = divs[category];

      if(!div) {
        console.error('no div by category:', category);
      }

      contentEmojiDiv.append(div);
      heights.push((heights[heights.length - 1] || 0) + div.scrollHeight);

      //console.log(div, div.scrollHeight);
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

    let prevCategoryIndex = 1;
    let menu = contentEmojiDiv.nextElementSibling as HTMLUListElement;
    let emojiScroll = new Scrollable(contentEmojiDiv);
    emojiScroll.container.addEventListener('scroll', (e) => {
      prevCategoryIndex = emoticonsContentOnScroll(menu, heights, prevCategoryIndex, emojiScroll.container);
    });
    //emojiScroll.setVirtualContainer(emojiScroll.container);

    emoticonsMenuOnClick(menu, heights, emojiScroll);
  }

  let stickersInit = () => {
    let contentStickersDiv = document.getElementById('content-stickers') as HTMLDivElement;
    //let stickersDiv = contentStickersDiv.querySelector('.os-content') as HTMLDivElement;

    let menuWrapper = contentStickersDiv.nextElementSibling as HTMLDivElement;
    let menu = menuWrapper.firstElementChild as HTMLUListElement;

    let menuScroll = new Scrollable(menuWrapper, true, false);

    let stickersDiv = document.createElement('div');
    stickersDiv.classList.add('stickers-categories');
    contentStickersDiv.append(stickersDiv);

    stickersDiv.addEventListener('mouseover', (e) => {
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
    });

    stickersDiv.addEventListener('click', (e) => {
      let target = e.target as HTMLDivElement;
      target = findUpTag(target, 'DIV');
      
      let fileID = target.getAttribute('file-id');
      let document = appStickersManager.getSticker(fileID);

      if(document) {
        appMessagesManager.sendFile(appImManager.peerID, document, {isMedia: true});
        appImManager.scroll.scrollTop = appImManager.scroll.scrollHeight;
        dropdown.classList.remove('active');
        toggleEl.classList.remove('active');
      } else {
        console.warn('got no sticker by id:', fileID);
      }
    });

    let heights: number[] = [];

    let categoryPush = (categoryDiv: HTMLDivElement, docs: MTDocument[], prepend?: boolean) => {
      //if((docs.length % 5) != 0) categoryDiv.classList.add('not-full');

      docs.forEach(doc => {
        let div = document.createElement('div');
        wrapSticker(doc, div, undefined, lazyLoadQueue, EMOTICONSSTICKERGROUP, true);

        categoryDiv.append(div);
      });

      /* if(prepend) {
        stickersDiv.prepend(categoryDiv);
      } else {
        stickersDiv.append(categoryDiv);
      } */

      setTimeout(() => lazyLoadQueue.check(), 0);

      /* let scrollHeight = categoryDiv.scrollHeight;
      let prevHeight = heights[heights.length - 1] || 0;
      //console.log('scrollHeight', scrollHeight, categoryDiv, stickersDiv.childElementCount);
      if(prepend && heights.length) {// all stickers loaded faster than recent
        heights.forEach((h, i) => heights[i] += scrollHeight);

        return heights.unshift(scrollHeight) - 1;
      } */

      heights.length = 0;
      Array.from(stickersDiv.children).forEach((div, i) => {
        heights[i] = (heights[i - 1] || 0) + div.scrollHeight;
      });

      //stickersScroll.onScroll();

      //return heights.push(prevHeight + scrollHeight) - 1;
    };

    apiManager.invokeApi('messages.getRecentStickers', {flags: 0, hash: 0}).then((res) => {
      let stickers: {
        _: string,
        hash: number,
        packs: any[],
        stickers: MTDocument[],
        dates: number[]
      } = res as any;

      let categoryDiv = document.createElement('div');
      categoryDiv.classList.add('sticker-category');

      stickersDiv.prepend(categoryDiv);
      
      categoryPush(categoryDiv, stickers.stickers, true);
    });

    apiManager.invokeApi('messages.getAllStickers', {hash: 0}).then((res) => {
      let stickers: {
        _: 'messages.allStickers',
        hash: number,
        sets: Array<MTStickerSet>
      } = res as any;

      stickers.sets/* .slice(0, 10) */.forEach(async(set) => {
        let categoryDiv = document.createElement('div');
        categoryDiv.classList.add('sticker-category');

        let li = document.createElement('li');
        li.classList.add('btn-icon');

        menu.append(li);

        stickersDiv.append(categoryDiv);

        let stickerSet = await appStickersManager.getStickerSet(set);
        
        if(stickerSet.set.thumb) {
          let thumb = stickerSet.set.thumb;

          appStickersManager.getStickerSetThumb(stickerSet.set).then(async(blob) => {
            if(thumb.w == 1 && thumb.h == 1) {
              const reader = new FileReader();

              reader.addEventListener('loadend', async(e) => {
                // @ts-ignore
                const text = e.srcElement.result;
                let json = await CryptoWorker.gzipUncompress<string>(text, true);

                let animation = await lottieLoader.loadAnimation({
                  container: li,
                  loop: true,
                  autoplay: false,
                  animationData: JSON.parse(json)
                }, EMOTICONSSTICKERGROUP);
              });

              reader.readAsArrayBuffer(blob);
            } else {
              let image = new Image();
              image.src = URL.createObjectURL(blob);
  
              li.append(image);
            }
          });
        } else { // as thumb will be used first sticker
          wrapSticker(stickerSet.documents[0], li as any, undefined, undefined, EMOTICONSSTICKERGROUP); // kostil
        }

        categoryPush(categoryDiv, stickerSet.documents);
      });
    });

    let prevCategoryIndex = 0;
    let stickersScroll = new Scrollable(contentStickersDiv);
    stickersScroll.container.addEventListener('scroll', (e) => {
      lazyLoadQueue.check();
      lottieLoader.checkAnimations();

      prevCategoryIndex = emoticonsContentOnScroll(menu, heights, prevCategoryIndex, stickersScroll.container);
    });
    stickersScroll.setVirtualContainer(stickersDiv);

    emoticonsMenuOnClick(menu, heights, stickersScroll);

    stickersInit = null;
  };

  return {dropdown, lazyLoadQueue};
};

export default initEmoticonsDropdown;
