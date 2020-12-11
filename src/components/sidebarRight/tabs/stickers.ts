import { SliderTab } from "../../slider";
import SearchInput from "../../searchInput";
import Scrollable from "../../scrollable";
import LazyLoadQueue from "../../lazyLoadQueue";
import { findUpClassName } from "../../../helpers/dom";
import appImManager from "../../../lib/appManagers/appImManager";
import appStickersManager from "../../../lib/appManagers/appStickersManager";
import PopupStickers from "../../popupStickers";
import animationIntersector from "../../animationIntersector";
import { RichTextProcessor } from "../../../lib/richtextprocessor";
import { wrapSticker } from "../../wrappers";
import appSidebarRight, { AppSidebarRight } from "..";
import { StickerSet, StickerSetCovered } from "../../../layer";

export default class AppStickersTab implements SliderTab {
  private container = document.getElementById('stickers-container') as HTMLDivElement;
  private contentDiv = this.container.querySelector('.sidebar-content') as HTMLDivElement;
  private backBtn = this.container.querySelector('.sidebar-close-button') as HTMLButtonElement;
  //private input = this.container.querySelector('#stickers-search') as HTMLInputElement;
  private searchInput: SearchInput;
  private setsDiv = this.contentDiv.firstElementChild as HTMLDivElement;
  private scrollable: Scrollable;
  private lazyLoadQueue: LazyLoadQueue;

  constructor() {
    this.scrollable = new Scrollable(this.contentDiv, 'STICKERS-SEARCH');

    this.lazyLoadQueue = new LazyLoadQueue();

    this.searchInput = new SearchInput('Search Stickers', (value) => {
      this.search(value);
    });

    this.backBtn.parentElement.append(this.searchInput.container);

    this.setsDiv.addEventListener('click', (e) => {
      const sticker = findUpClassName(e.target, 'sticker-set-sticker');
      if(sticker) {
        const docId = sticker.dataset.docId;
        appImManager.chat.input.sendMessageWithDocument(docId);
        return;
      }

      const target = findUpClassName(e.target, 'sticker-set');
      if(!target) return;


      const id = target.dataset.stickerSet as string;
      const access_hash = target.dataset.stickerSet as string;

      const button = findUpClassName(e.target, 'sticker-set-button') as HTMLElement;
      if(button) {
        e.preventDefault();
        e.cancelBubble = true;

        button.setAttribute('disabled', 'true');
        
        appStickersManager.getStickerSet({id, access_hash}).then(full => {
          appStickersManager.toggleStickerSet(full.set).then(changed => {
            if(changed) {
              button.innerText = full.set.installed_date ? 'Added' : 'Add';
              button.classList.toggle('gray', !!full.set.installed_date);
            }
          }).finally(() => {
            //button.style.width = set.installed_date ? '68px' : '52px';
            button.removeAttribute('disabled');
          });
        });
      } else {
        appStickersManager.getStickerSet({id, access_hash}).then(full => {
          new PopupStickers(full.set).show();
        });
      }
    });
  }

  public onCloseAfterTimeout() {
    this.setsDiv.innerHTML = '';
    this.searchInput.value = '';
    animationIntersector.checkAnimations(undefined, 'STICKERS-SEARCH');
  }

  public renderSet(set: StickerSet.stickerSet) {
    //console.log('renderSet:', set);
    const div = document.createElement('div');
    div.classList.add('sticker-set');

    const header = document.createElement('div');
    header.classList.add('sticker-set-header');

    const details = document.createElement('div');
    details.classList.add('sticker-set-details');
    details.innerHTML = `
      <div class="sticker-set-name">${RichTextProcessor.wrapEmojiText(set.title)}</div>
      <div class="sticker-set-count">${set.count} stickers</div>
    `;
    
    const button = document.createElement('button');
    button.classList.add('btn-primary', 'sticker-set-button');
    button.innerText = set.installed_date ? 'Added' : 'Add';
   // button.style.width = set.installed_date ? '68px' : '52px';

    if(set.installed_date) {
      button.classList.add('gray');
    }

    //ripple(button);

    header.append(details, button);

    const stickersDiv = document.createElement('div');
    stickersDiv.classList.add('sticker-set-stickers');

    const count = Math.min(5, set.count);
    for(let i = 0; i < count; ++i) {
      const stickerDiv = document.createElement('div');
      stickerDiv.classList.add('sticker-set-sticker');

      stickersDiv.append(stickerDiv);
    }

    appStickersManager.getStickerSet(set).then(set => {
      //console.log('renderSet got set:', set);
      
      for(let i = 0; i < count; ++i) {
        const div = stickersDiv.children[i] as HTMLDivElement;
        const doc = set.documents[i];
        if(doc._ == 'documentEmpty') {
          continue;
        }

        wrapSticker({
          doc, 
          div, 
          lazyLoadQueue: this.lazyLoadQueue, 
          group: 'STICKERS-SEARCH', 
          /* play: false,
          loop: false, */
          play: true,
          loop: true,
          width: 68,
          height: 68
        });
      }
    });

    /* const onMouseOver = () => {
      const animations: AnimationItem['animation'][] = [];
      for(let i = 0; i < count; ++i) {
        const stickerDiv = stickersDiv.children[i] as HTMLElement;
        const animationItem = animationIntersector.getAnimation(stickerDiv);
        if(!animationItem) continue;

        const animation = animationItem.animation;

        animations.push(animation);
        animation.loop = true;
        animation.play();
      }

      div.addEventListener('mouseout', () => {
        animations.forEach(animation => {
          animation.loop = false;
        });

        div.addEventListener('mouseover', onMouseOver, {once: true});
      }, {once: true});
    };

    div.addEventListener('mouseover', onMouseOver, {once: true}); */

    div.dataset.stickerSet = set.id;
    div.dataset.access_hash = set.access_hash;
    div.dataset.title = set.title;

    div.append(header, stickersDiv);

    this.setsDiv.append(div);
  }

  public init() {
    appSidebarRight.selectTab(AppSidebarRight.SLIDERITEMSIDS.stickers);

    appSidebarRight.toggleSidebar(true).then(() => {
      this.renderFeatured();
    });
  }

  public renderFeatured() {
    return appStickersManager.getFeaturedStickers().then(coveredSets => {
      if(this.searchInput.value) {
        return;
      }

      coveredSets = this.filterRendered('', coveredSets);
      coveredSets.forEach(set => {
        this.renderSet(set.set);
      });
    });
  }

  private filterRendered(query: string, coveredSets: StickerSetCovered[]) {
    coveredSets = coveredSets.slice();

    const children = Array.from(this.setsDiv.children) as HTMLElement[];
    children.forEachReverse(el => {
      const id = el.dataset.stickerSet;
      const index = coveredSets.findIndex(covered => covered.set.id == id);
  
      if(index !== -1) {
        coveredSets.splice(index, 1);
      } else if(!query || !el.dataset.title.toLowerCase().includes(query.toLowerCase())) {
        el.remove();
      }
    });

    animationIntersector.checkAnimations(undefined, 'STICKERS-SEARCH');

    return coveredSets;
  }

  public search(query: string) {
    if(!query) {
      return this.renderFeatured();
    }

    return appStickersManager.searchStickerSets(query, false).then(coveredSets => {
      if(this.searchInput.value != query) {
        return;
      }

      //console.log('search result:', coveredSets);

      coveredSets = this.filterRendered(query, coveredSets);
      coveredSets.forEach(set => {
        this.renderSet(set.set);
      });
    });
  }
}