import emoticonsDropdown, { EmoticonsTab, EMOTICONSSTICKERGROUP, EmoticonsDropdown } from "..";
import { MTDocument } from "../../../types";
import Scrollable from "../../scrollable_new";
import { wrapSticker } from "../../wrappers";
import appStickersManager, { MTStickerSet, MTStickerSetFull } from "../../../lib/appManagers/appStickersManager";
import appDownloadManager from "../../../lib/appManagers/appDownloadManager";
import { readBlobAsText } from "../../../helpers/blob";
import lottieLoader from "../../../lib/lottieLoader";
import { renderImageFromUrl, putPreloader } from "../../misc";
import { RichTextProcessor } from "../../../lib/richtextprocessor";
import { $rootScope } from "../../../lib/utils";
import apiManager from "../../../lib/mtproto/mtprotoworker";
import StickyIntersector from "../../stickyIntersector";
import appDocsManager from "../../../lib/appManagers/appDocsManager";
import animationIntersector from "../../animationIntersector";

export default class StickersTab implements EmoticonsTab {
  public content: HTMLElement;

  private stickerSets: {[id: string]: {
    stickers: HTMLElement,
    tab: HTMLElement
  }} = {};

  private recentDiv: HTMLElement;
  private recentStickers: MTDocument[] = [];

  private scroll: Scrollable;

  private menu: HTMLUListElement;
  
  private mounted = false;

  private queueCategoryPush: {element: HTMLElement, prepend: boolean}[] = [];

  private stickyIntersector: StickyIntersector;

  private animatedDivs: Set<HTMLDivElement> = new Set();
  private animatedIntersector: IntersectionObserver;

  categoryPush(categoryDiv: HTMLElement, categoryTitle: string, promise: Promise<MTDocument[]>, prepend?: boolean) {
    //if((docs.length % 5) != 0) categoryDiv.classList.add('not-full');

    const itemsDiv = document.createElement('div');
    itemsDiv.classList.add('category-items');

    const titleDiv = document.createElement('div');
    titleDiv.classList.add('category-title');
    titleDiv.innerHTML = categoryTitle;

    categoryDiv.append(titleDiv, itemsDiv);

    this.stickyIntersector.observeStickyHeaderChanges(categoryDiv);

    this.queueCategoryPush.push({element: categoryDiv, prepend});

    promise.then(documents => {
      documents.forEach(doc => {
        itemsDiv.append(this.renderSticker(doc));
      });

      if(this.queueCategoryPush.length) {
        this.queueCategoryPush.forEach(({element, prepend}) => {
          if(prepend) {
            if(this.recentDiv.parentElement) {
              this.scroll.prepend(element);
              this.scroll.prepend(this.recentDiv);
            } else {
              this.scroll.prepend(element);
            }
          } else this.scroll.append(element);
        });

        this.queueCategoryPush.length = 0;
      }
    });
  }

  renderSticker(doc: MTDocument, div?: HTMLDivElement) {
    if(!div) {
      div = document.createElement('div');

      if(doc.sticker == 2) {
        this.animatedDivs.add(div);
        this.animatedIntersector.observe(div);
      }
    } 

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

    const promise = appStickersManager.getStickerSet(set);
    this.categoryPush(categoryDiv, RichTextProcessor.wrapEmojiText(set.title), promise.then(stickerSet => stickerSet.documents), prepend);
    const stickerSet = await promise;

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
        delete this.stickerSets[set.id];
      }
    });

    stickersDiv.addEventListener('click', EmoticonsDropdown.onMediaClick);

    this.scroll = new Scrollable(this.content, 'y', 'STICKERS', undefined, undefined, 2);
    this.scroll.setVirtualContainer(stickersDiv);

    this.stickyIntersector = EmoticonsDropdown.menuOnClick(this.menu, this.scroll, menuScroll);

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
        this.categoryPush(this.recentDiv, 'Recent', Promise.resolve(this.recentStickers), true);
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

    const checkAnimationDiv = (div: HTMLDivElement) => {
      const players = animationIntersector.getAnimations(div);
      players.forEach(player => {
        if(!visible.has(div)) {
          animationIntersector.checkAnimation(player, true, true);
        } else {
          animationIntersector.checkAnimation(player, false);
        }
      });
    };

    const processInvisibleDiv = (div: HTMLDivElement) => {
      visible.delete(div);
      //console.log('STICKER INvisible:', target, docID);

      const docID = div.dataset.docID;
      const doc = appDocsManager.getDoc(docID);

      checkAnimationDiv(div);

      div.innerHTML = '';
      this.renderSticker(doc, div);
    };

    let locked = false;
    const visible: Set<HTMLDivElement> = new Set();
    this.animatedIntersector = new IntersectionObserver((entries) => {
      if(locked) {
        return;
      }

      entries.forEach(entry => {
        const {target, isIntersecting} = entry;

        const div = target as HTMLDivElement;
        const docID = div.dataset.docID;
        const doc = appDocsManager.getDoc(docID);
        if(isIntersecting) {
          //console.log('STICKER visible:', target, docID);
          if(visible.has(div)) {
            return;
          }

          visible.add(div);
          
          wrapSticker({
            doc, 
            div,
            width: 80,
            height: 80,
            lazyLoadQueue: null, 
            group: EMOTICONSSTICKERGROUP, 
            onlyThumb: false,
            play: true,
            loop: true
          }).then(() => {
            checkAnimationDiv(div);
          });
        } else {
          processInvisibleDiv(div);
        }
      });

      //animationIntersector.checkAnimations(true, EMOTICONSSTICKERGROUP, false);
    });
    
    emoticonsDropdown.events.onClose.push(() => {
      locked = true;
    });

    emoticonsDropdown.events.onCloseAfter.push(() => {
      const divs = [...visible];

      for(const div of divs) {
        processInvisibleDiv(div);
      }
    });

    emoticonsDropdown.events.onOpenAfter.push(() => {
      locked = false;

      // refresh
      this.animatedIntersector.disconnect();
      const divs = [...this.animatedDivs];
      for(const div of divs) {
        this.animatedIntersector.observe(div);
      }
    });

    /* setInterval(() => {
      // @ts-ignore
      console.log('STICKERS RENDERED IN PANEL:', Object.values(lottieLoader.players).filter(p => p.width == 80).length);
    }, .25e3); */
    

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

    const items = this.recentDiv.querySelector('.category-items');
    items.prepend(div);

    if(items.childElementCount > 20) {
      (Array.from(items.children) as HTMLElement[]).slice(20).forEach(el => el.remove());
    }
  }

  onClose() {

  }
}