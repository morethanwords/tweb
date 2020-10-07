import { PopupElement } from "./popup";
import appStickersManager from "../lib/appManagers/appStickersManager";
import { RichTextProcessor } from "../lib/richtextprocessor";
import Scrollable from "./scrollable";
import { wrapSticker } from "./wrappers";
import LazyLoadQueue from "./lazyLoadQueue";
import { putPreloader } from "./misc";
import animationIntersector from "./animationIntersector";
import { findUpClassName } from "../lib/utils";
import appImManager from "../lib/appManagers/appImManager";
import { StickerSet } from "../layer";

const ANIMATION_GROUP = 'STICKERS-POPUP';

export default class PopupStickers extends PopupElement {
  private stickersFooter: HTMLElement;
  private stickersDiv: HTMLElement;
  private h6: HTMLElement;

  private set: StickerSet.stickerSet;

  constructor(private stickerSetInput: {
    //_: 'inputStickerSetID',
    id: string,
    access_hash: string
  }) {
    super('popup-stickers', null, {closable: true, body: true});

    this.h6 = document.createElement('h6');
    this.h6.innerText = 'Loading...';

    this.header.append(this.h6);

    this.onClose = () => {
      animationIntersector.setOnlyOnePlayableGroup('');
      animationIntersector.checkAnimations(false);
      this.stickersFooter.removeEventListener('click', this.onFooterClick);
      this.stickersDiv.removeEventListener('click', this.onStickersClick);
      this.element.removeEventListener('click', onOverlayClick);
    };

    this.onCloseAfterTimeout = () => {
      animationIntersector.checkAnimations(undefined, ANIMATION_GROUP);
    };

    const onOverlayClick = (e: MouseEvent) => {
      if(!findUpClassName(e.target, 'popup-container')) {
        this.closeBtn.click();
      }
    };

    this.element.addEventListener('click', onOverlayClick);

    const div = document.createElement('div');
    div.classList.add('sticker-set');

    this.stickersDiv = document.createElement('div');
    this.stickersDiv.classList.add('sticker-set-stickers');

    putPreloader(this.stickersDiv);

    this.stickersFooter = document.createElement('div');
    this.stickersFooter.classList.add('sticker-set-footer');

    div.append(this.stickersDiv);

    this.stickersFooter.innerText = 'Loading...';

    this.body.append(div);
    const scrollable = new Scrollable(this.body);
    this.body.append(this.stickersFooter);
    
    // const editButton = document.createElement('button');
    // editButton.classList.add('btn-primary');

    // this.stickersFooter.append(editButton);

    this.loadStickerSet();
  }

  onFooterClick = () => {
    this.stickersFooter.setAttribute('disabled', 'true');

    appStickersManager.toggleStickerSet(this.set).then(() => {
      this.closeBtn.click();
    }).catch(() => {
      this.stickersFooter.removeAttribute('disabled');
    });
  };

  onStickersClick = (e: MouseEvent) => {
    const target = findUpClassName(e.target, 'sticker-set-sticker');
    if(!target) return;

    const fileID = target.dataset.docID;
    if(appImManager.chatInputC.sendMessageWithDocument(fileID)) {
      this.closeBtn.click();
    } else {
      console.warn('got no doc by id:', fileID);
    }
  };

  private loadStickerSet() {
    return appStickersManager.getStickerSet(this.stickerSetInput).then(set => {
      //console.log('PopupStickers loadStickerSet got set:', set);

      this.set = set.set;

      animationIntersector.checkAnimations(true);
      animationIntersector.setOnlyOnePlayableGroup(ANIMATION_GROUP);

      this.h6.innerHTML = RichTextProcessor.wrapEmojiText(set.set.title);
      !set.set.installed_date ? this.stickersFooter.classList.add('add') : this.stickersFooter.classList.remove('add');
      this.stickersFooter.innerHTML = set.set.hasOwnProperty('installed_date') ? '<div style="cursor: pointer; margin: 0 auto; width: 150px;">Remove stickers</div>' : `<button class="btn-primary">ADD ${set.set.count} STICKERS</button>`;

      this.stickersFooter.addEventListener('click', this.onFooterClick);

      if(set.documents.length) {
        this.stickersDiv.addEventListener('click', this.onStickersClick);
      }

      const lazyLoadQueue = new LazyLoadQueue();
      
      this.stickersDiv.innerHTML = '';
      for(let doc of set.documents) {
        if(doc._ == 'documentEmpty') {
          continue;
        }
        
        const div = document.createElement('div');
        div.classList.add('sticker-set-sticker');
        
        wrapSticker({
          doc, 
          div, 
          lazyLoadQueue, 
          group: ANIMATION_GROUP, 
          play: true,
          loop: true,
          width: 80,
          height: 80
        });

        this.stickersDiv.append(div);
      }
    });
  }
}