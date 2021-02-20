import PopupElement from ".";
import appStickersManager from "../../lib/appManagers/appStickersManager";
import { RichTextProcessor } from "../../lib/richtextprocessor";
import Scrollable from "../scrollable";
import { wrapSticker } from "../wrappers";
import LazyLoadQueue from "../lazyLoadQueue";
import { putPreloader } from "../misc";
import animationIntersector from "../animationIntersector";
import { findUpClassName } from "../../helpers/dom";
import appImManager from "../../lib/appManagers/appImManager";
import { StickerSet } from "../../layer";
import mediaSizes from "../../helpers/mediaSizes";

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
    super('popup-stickers', null, {closable: true, overlayClosable: true, body: true});

    this.h6 = document.createElement('h6');
    this.h6.innerText = 'Loading...';

    this.header.append(this.h6);

    this.onClose = () => {
      animationIntersector.setOnlyOnePlayableGroup('');
      this.stickersFooter.removeEventListener('click', this.onFooterClick);
      this.stickersDiv.removeEventListener('click', this.onStickersClick);
    };

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
      this.btnClose.click();
    }).catch(() => {
      this.stickersFooter.removeAttribute('disabled');
    });
  };

  onStickersClick = (e: MouseEvent) => {
    const target = findUpClassName(e.target, 'sticker-set-sticker');
    if(!target) return;

    const fileId = target.dataset.docId;
    if(appImManager.chat.input.sendMessageWithDocument(fileId)) {
      this.btnClose.click();
    } else {
      console.warn('got no doc by id:', fileId);
    }
  };

  private loadStickerSet() {
    return appStickersManager.getStickerSet(this.stickerSetInput).then(set => {
      //console.log('PopupStickers loadStickerSet got set:', set);

      this.set = set.set;

      animationIntersector.setOnlyOnePlayableGroup(ANIMATION_GROUP);

      this.h6.innerHTML = RichTextProcessor.wrapEmojiText(set.set.title);
      !set.set.installed_date ? this.stickersFooter.classList.add('add') : this.stickersFooter.classList.remove('add');
      this.stickersFooter.innerHTML = set.set.hasOwnProperty('installed_date') ? '<div style="cursor: pointer; margin: 0 auto; width: 150px;">Remove stickers</div>' : `<button class="btn-primary btn-color-primary">ADD ${set.set.count} STICKERS</button>`;

      this.stickersFooter.addEventListener('click', this.onFooterClick);

      if(set.documents.length) {
        this.stickersDiv.addEventListener('click', this.onStickersClick);
      }

      const lazyLoadQueue = new LazyLoadQueue();
      
      this.stickersDiv.innerHTML = '';
      for(let doc of set.documents) {
        if(doc._ === 'documentEmpty') {
          continue;
        }
        
        const div = document.createElement('div');
        div.classList.add('sticker-set-sticker');

        const size = mediaSizes.active.esgSticker.width;
        
        wrapSticker({
          doc, 
          div, 
          lazyLoadQueue, 
          group: ANIMATION_GROUP, 
          play: true,
          loop: true,
          width: size,
          height: size
        });

        this.stickersDiv.append(div);
      }
    });
  }
}