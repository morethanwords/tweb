import { PopupElement } from "./popup";
import appStickersManager, { MTStickerSet } from "../lib/appManagers/appStickersManager";
import { RichTextProcessor } from "../lib/richtextprocessor";
import Scrollable from "./scrollable_new";
import { wrapSticker } from "./wrappers";
import LazyLoadQueue from "./lazyLoadQueue";
import { putPreloader, ripple } from "./misc";
import animationIntersector from "./animationIntersector";
import { findUpClassName } from "../lib/utils";
import appDocsManager from "../lib/appManagers/appDocsManager";
import appImManager from "../lib/appManagers/appImManager";

export default class PopupStickers extends PopupElement {
  private stickersFooter: HTMLElement;
  private stickersDiv: HTMLElement;
  private h6: HTMLElement;
  private closeBtn: HTMLElement;

  private set: MTStickerSet;

  constructor(private stickerSetInput: {
    //_: 'inputStickerSetID',
    id: string,
    access_hash: string
  }) {
    super('popup-stickers');

    this.h6 = document.createElement('h6');
    this.h6.innerText = 'Loading...';

    const popupBody = document.createElement('div');
    popupBody.classList.add('popup-body');

    this.closeBtn = document.createElement('span');
    this.closeBtn.classList.add('btn-icon', 'popup-close', 'tgico-close');
    this.header.append(this.closeBtn, this.h6);

    this.closeBtn.addEventListener('click', () => {
      this.destroy();
      animationIntersector.checkAnimations(false);
      this.stickersFooter.removeEventListener('click', this.onFooterClick);
      this.stickersDiv.removeEventListener('click', this.onStickersClick);
      this.element.removeEventListener('click', onOverlayClick);

      setTimeout(() => {
        animationIntersector.checkAnimations(undefined, 'STICKERS-POPUP');
      }, 1001);
    }, {once: true});
    ripple(this.closeBtn);

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

    popupBody.append(div);
    this.container.append(popupBody);

    const scrollable = new Scrollable(popupBody, 'y', undefined);

    popupBody.append(this.stickersFooter);
    
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
      //JOPA SGORELA SUKA, kak zdes mojet bit false esli u menya etot nabor dobavlen i otobrajaetsya v telege ???
      //koroche sut v tom, chto esli ti dobavil nabor a potom ctrl + f5 , i najimaesh na popup stikera v chate, to ono dumaet chto nabora net, potomu chto installed_date kakogoto huya false, i ego pravda tam net.
      //razberis brat.. a tak vrode vse rabotaet namana. ya gavnokoder i gavnoverstker
      //testiroval na stikere v dialoge viti (zeleniy dinozavr) http://i.piccy.info/i9/71cbc718bedb6d8a33da9bff775d8316/1591669743/204119/1382638/Snymok_ekrana_2020_06_09_v_05_28_25.jpg
      //console.log('hasOwnProperty got set installed_date ????', set.set.hasOwnProperty('installed_date'));

      this.set = set.set;

      animationIntersector.checkAnimations(true);

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
        const div = document.createElement('div');
        div.classList.add('sticker-set-sticker');
        
        wrapSticker({
          doc, 
          div, 
          lazyLoadQueue, 
          group: 'STICKERS-POPUP', 
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