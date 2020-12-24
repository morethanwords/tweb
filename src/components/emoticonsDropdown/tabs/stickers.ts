import emoticonsDropdown, { EmoticonsDropdown, EMOTICONSSTICKERGROUP, EmoticonsTab } from "..";
import { readBlobAsText } from "../../../helpers/blob";
import mediaSizes from "../../../helpers/mediaSizes";
import { MessagesAllStickers, StickerSet } from "../../../layer";
import appDocsManager, { MyDocument } from "../../../lib/appManagers/appDocsManager";
import appDownloadManager from "../../../lib/appManagers/appDownloadManager";
import appStickersManager from "../../../lib/appManagers/appStickersManager";
import lottieLoader from "../../../lib/lottieLoader";
import { RichTextProcessor } from "../../../lib/richtextprocessor";
import rootScope from "../../../lib/rootScope";
import animationIntersector from "../../animationIntersector";
import LazyLoadQueue, { LazyLoadQueueRepeat } from "../../lazyLoadQueue";
import { putPreloader, renderImageFromUrl } from "../../misc";
import Scrollable, { ScrollableX } from "../../scrollable";
import StickyIntersector from "../../stickyIntersector";
import { wrapSticker } from "../../wrappers";

export class SuperStickerRenderer {
  lazyLoadQueue: LazyLoadQueueRepeat;
  animatedDivs: Set<HTMLDivElement> = new Set();

  constructor(private regularLazyLoadQueue: LazyLoadQueue, private group: string) {
    this.lazyLoadQueue = new LazyLoadQueueRepeat(undefined, (target, visible) => {
      if(!visible) {
        this.processInvisibleDiv(target as HTMLDivElement);
      }
    });
  }

  renderSticker(doc: MyDocument, div?: HTMLDivElement) {
    if(!div) {
      div = document.createElement('div');
      div.classList.add('grid-item', 'super-sticker');

      if(doc.sticker == 2) {
        this.animatedDivs.add(div);

        this.lazyLoadQueue.observe({
          div, 
          load: this.processVisibleDiv
        });
      }
    } 

    // * This will wrap only a thumb
    wrapSticker({
      doc, 
      div,
      lazyLoadQueue: this.regularLazyLoadQueue, 
      group: this.group, 
      onlyThumb: doc.sticker == 2
    });

    return div;
  }

  checkAnimationContainer = (div: HTMLElement, visible: boolean) => {
    //console.error('checkAnimationContainer', div, visible);
    const players = animationIntersector.getAnimations(div);
    players.forEach(player => {
      if(!visible) {
        animationIntersector.checkAnimation(player, true, true);
      } else {
        animationIntersector.checkAnimation(player, false);
      }
    });
  };

  processVisibleDiv = (div: HTMLElement) => {
    const docId = div.dataset.docId;
    const doc = appDocsManager.getDoc(docId);
    
    const size = mediaSizes.active.esgSticker.width;

    const promise = wrapSticker({
      doc, 
      div: div as HTMLDivElement,
      width: size,
      height: size,
      lazyLoadQueue: null, 
      group: this.group, 
      onlyThumb: false,
      play: true,
      loop: true
    });

    promise.then(() => {
      //clearTimeout(timeout);
      this.checkAnimationContainer(div, this.lazyLoadQueue.intersector.isVisible(div));
    });

    /* let timeout = window.setTimeout(() => {
      console.error('processVisibleDiv timeout', div, doc);
    }, 1e3); */

    return promise;
  };

  processInvisibleDiv = (div: HTMLElement) => {
    const docId = div.dataset.docId;
    const doc = appDocsManager.getDoc(docId);

    //console.log('STICKER INvisible:', /* div,  */docId);

    this.checkAnimationContainer(div, false);

    div.innerHTML = '';
    this.renderSticker(doc, div as HTMLDivElement);
  };
}

export default class StickersTab implements EmoticonsTab {
  public content: HTMLElement;
  private stickersDiv: HTMLElement;

  private stickerSets: {[id: string]: {
    stickers: HTMLElement,
    tab: HTMLElement
  }} = {};

  private recentDiv: HTMLElement;
  private recentStickers: MyDocument[] = [];

  private scroll: Scrollable;

  private menu: HTMLElement;
  
  private mounted = false;

  private queueCategoryPush: {element: HTMLElement, prepend: boolean}[] = [];

  private stickyIntersector: StickyIntersector;

  private superStickerRenderer: SuperStickerRenderer;

  categoryPush(categoryDiv: HTMLElement, categoryTitle: string, promise: Promise<MyDocument[]>, prepend?: boolean) {
    //if((docs.length % 5) != 0) categoryDiv.classList.add('not-full');

    const itemsDiv = document.createElement('div');
    itemsDiv.classList.add('category-items', 'super-stickers');

    const titleDiv = document.createElement('div');
    titleDiv.classList.add('category-title');
    titleDiv.innerHTML = categoryTitle;

    categoryDiv.append(titleDiv, itemsDiv);

    this.stickyIntersector.observeStickyHeaderChanges(categoryDiv);

    this.queueCategoryPush.push({element: categoryDiv, prepend});

    promise.then(documents => {
      documents.forEach(doc => {
        //if(doc._ == 'documentEmpty') return;
        itemsDiv.append(this.superStickerRenderer.renderSticker(doc));
      });

      if(this.queueCategoryPush.length) {
        this.queueCategoryPush.forEach(({element, prepend}) => {
          if(prepend) {
            if(this.recentDiv.parentElement) {
              this.stickersDiv.prepend(element);
              this.stickersDiv.prepend(this.recentDiv);
            } else {
              this.stickersDiv.prepend(element);
            }
          } else this.stickersDiv.append(element);
        });

        this.queueCategoryPush.length = 0;
      }
    });
  }

  async renderStickerSet(set: StickerSet.stickerSet, prepend = false) {
    const categoryDiv = document.createElement('div');
    categoryDiv.classList.add('sticker-category');

    const button = document.createElement('button');
    button.classList.add('btn-icon', 'menu-horizontal-div-item');

    this.stickerSets[set.id] = {
      stickers: categoryDiv,
      tab: button
    };

    if(prepend) {
      this.menu.insertBefore(button, this.menu.firstElementChild.nextSibling);
    } else {
      this.menu.append(button);
    }

    //stickersScroll.append(categoryDiv);

    const promise = appStickersManager.getStickerSet(set);
    this.categoryPush(categoryDiv, RichTextProcessor.wrapEmojiText(set.title), promise.then(stickerSet => stickerSet.documents as MyDocument[]), prepend);
    const stickerSet = await promise;

    //console.log('got stickerSet', stickerSet, li);
    
    if(stickerSet.set.thumb) {
      const downloadOptions = appStickersManager.getStickerSetThumbDownloadOptions(stickerSet.set);
      const promise = appDownloadManager.download(downloadOptions);

      if(stickerSet.set.pFlags.animated) {
        promise
        .then(readBlobAsText)
        //.then(JSON.parse)
        .then(json => {
          lottieLoader.loadAnimationWorker({
            container: button,
            loop: true,
            autoplay: false,
            animationData: json,
            width: 32,
            height: 32,
            needUpscale: true
          }, EMOTICONSSTICKERGROUP);
        });
      } else {
        const image = new Image();
        promise.then(blob => {
          renderImageFromUrl(image, URL.createObjectURL(blob), () => {
            button.append(image);
          });
        });
      }
    } else if(stickerSet.documents[0]._ != 'documentEmpty') { // as thumb will be used first sticker
      wrapSticker({
        doc: stickerSet.documents[0],
        div: button as any, 
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
    this.menu = menuWrapper.firstElementChild as HTMLUListElement;

    let menuScroll = new ScrollableX(menuWrapper);

    this.stickersDiv = document.createElement('div');
    this.stickersDiv.classList.add('stickers-categories');
    this.content.append(this.stickersDiv);

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

    rootScope.on('stickers_installed', (e) => {
      const set: StickerSet.stickerSet = e.detail;
      
      if(!this.stickerSets[set.id] && this.mounted) {
        this.renderStickerSet(set, true);
      }
    });

    rootScope.on('stickers_deleted', (e) => {
      const set: StickerSet.stickerSet = e.detail;
      
      if(this.stickerSets[set.id] && this.mounted) {
        const elements = this.stickerSets[set.id];
        elements.stickers.remove();
        elements.tab.remove();
        delete this.stickerSets[set.id];
      }
    });

    this.stickersDiv.addEventListener('click', EmoticonsDropdown.onMediaClick);

    this.scroll = new Scrollable(this.content, 'STICKERS');
    this.scroll.setVirtualContainer(this.stickersDiv);

    this.stickyIntersector = EmoticonsDropdown.menuOnClick(this.menu, this.scroll, menuScroll);

    const preloader = putPreloader(this.content, true);

    Promise.all([
      appStickersManager.getRecentStickers().then(stickers => {
        this.recentStickers = stickers.stickers.slice(0, 20) as MyDocument[];
  
        //stickersScroll.prepend(categoryDiv);

        this.stickerSets['recent'] = {
          stickers: this.recentDiv,
          tab: this.menu.firstElementChild as HTMLElement
        };

        preloader.remove();
        this.categoryPush(this.recentDiv, 'Recent', Promise.resolve(this.recentStickers), true);
      }),

      appStickersManager.getAllStickers().then((res) => {
        preloader.remove();

        for(let set of (res as MessagesAllStickers.messagesAllStickers).sets) {
          this.renderStickerSet(set);
        }
      })
    ]).finally(() => {
      this.mounted = true;
    });

    this.superStickerRenderer = new SuperStickerRenderer(EmoticonsDropdown.lazyLoadQueue, EMOTICONSSTICKERGROUP);

    emoticonsDropdown.addLazyLoadQueueRepeat(this.superStickerRenderer.lazyLoadQueue, this.superStickerRenderer.processInvisibleDiv);

    /* setInterval(() => {
      // @ts-ignore
      const players = Object.values(lottieLoader.players).filter(p => p.width == 80);
      
      console.log('STICKERS RENDERED IN PANEL:', players.length, players.filter(p => !p.paused).length, this.superStickerRenderer.lazyLoadQueue.intersector.getVisible().length);
    }, .25e3); */
    

    this.init = null;
  }

  pushRecentSticker(doc: MyDocument) {
    if(!this.recentDiv?.parentElement) {
      return;
    }

    let div = this.recentDiv.querySelector(`[data-doc-id="${doc.id}"]`);
    if(!div) {
      div = this.superStickerRenderer.renderSticker(doc);
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