import { EmoticonsTab, EMOTICONSSTICKERGROUP, EmoticonsDropdown } from "..";
import { MTDocument } from "../../../types";
import Scrollable from "../../scrollable_new";
import { wrapSticker } from "../../wrappers";
import appStickersManager, { MTStickerSet } from "../../../lib/appManagers/appStickersManager";
import appDownloadManager from "../../../lib/appManagers/appDownloadManager";
import { readBlobAsText } from "../../../helpers/blob";
import lottieLoader from "../../../lib/lottieLoader";
import { renderImageFromUrl, putPreloader } from "../../misc";
import { RichTextProcessor } from "../../../lib/richtextprocessor";
import { $rootScope } from "../../../lib/utils";
import apiManager from "../../../lib/mtproto/mtprotoworker";

export default class StickersTab implements EmoticonsTab {
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

    const itemsDiv = document.createElement('div');
    itemsDiv.classList.add('category-items');

    const titleDiv = document.createElement('div');
    titleDiv.classList.add('category-title');
    titleDiv.innerHTML = categoryTitle;

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
    const div = document.createElement('div');
    wrapSticker({
      doc, 
      div,
      /* width: 80,
      height: 80,
      play: false,
      loop: false, */
      lazyLoadQueue: EmoticonsDropdown.lazyLoadQueue, 
      group: EMOTICONSSTICKERGROUP, 
      onlyThumb: doc.sticker == 2
    });

    return div;
  }

  async renderStickerSet(set: MTStickerSet, prepend = false) {
    const categoryDiv = document.createElement('div');
    categoryDiv.classList.add('sticker-category');

    const li = document.createElement('li');
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

    const stickerSet = await appStickersManager.getStickerSet(set);

    //console.log('got stickerSet', stickerSet, li);
    
    if(stickerSet.set.thumb) {
      const downloadOptions = appStickersManager.getStickerSetThumbDownloadOptions(stickerSet.set);
      const promise = appDownloadManager.download(downloadOptions);

      if(stickerSet.set.pFlags.animated) {
        promise
        .then(readBlobAsText)
        .then(JSON.parse)
        .then(json => {
          lottieLoader.loadAnimationWorker({
            container: li,
            loop: true,
            autoplay: false,
            animationData: json,
            width: 32,
            height: 32
          }, EMOTICONSSTICKERGROUP);
        });
      } else {
        const image = new Image();
        promise.then(blob => {
          renderImageFromUrl(image, URL.createObjectURL(blob), () => {
            li.append(image);
          });
        });
      }
    } else { // as thumb will be used first sticker
      wrapSticker({
        doc: stickerSet.documents[0],
        div: li as any, 
        group: EMOTICONSSTICKERGROUP
      }); // kostil
    }

    this.categoryPush(categoryDiv, RichTextProcessor.wrapEmojiText(stickerSet.set.title), stickerSet.documents, prepend);
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