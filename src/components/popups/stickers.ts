/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import PopupElement from ".";
import type { AppStickersManager } from "../../lib/appManagers/appStickersManager";
import { wrapSticker } from "../wrappers";
import LazyLoadQueue from "../lazyLoadQueue";
import { putPreloader } from "../putPreloader";
import animationIntersector from "../animationIntersector";
import appImManager from "../../lib/appManagers/appImManager";
import mediaSizes from "../../helpers/mediaSizes";
import { i18n } from "../../lib/langPack";
import Button from "../button";
import findUpClassName from "../../helpers/dom/findUpClassName";
import toggleDisability from "../../helpers/dom/toggleDisability";
import { attachClickEvent } from "../../helpers/dom/clickEvent";
import { toastNew } from "../toast";
import setInnerHTML from "../../helpers/dom/setInnerHTML";
import wrapEmojiText from "../../lib/richTextProcessor/wrapEmojiText";

const ANIMATION_GROUP = 'STICKERS-POPUP';

export default class PopupStickers extends PopupElement {
  private stickersFooter: HTMLElement;
  private stickersDiv: HTMLElement;

  constructor(private stickerSetInput: Parameters<AppStickersManager['getStickerSet']>[0]) {
    super('popup-stickers', {closable: true, overlayClosable: true, body: true, scrollable: true, title: true});

    this.title.append(i18n('Loading'));

    this.addEventListener('close', () => {
      animationIntersector.setOnlyOnePlayableGroup('');
    });

    const div = document.createElement('div');
    div.classList.add('sticker-set');

    this.stickersDiv = document.createElement('div');
    this.stickersDiv.classList.add('sticker-set-stickers', 'is-loading');

    attachClickEvent(this.stickersDiv, this.onStickersClick, {listenerSetter: this.listenerSetter});

    putPreloader(this.stickersDiv, true);

    this.stickersFooter = document.createElement('div');
    this.stickersFooter.classList.add('sticker-set-footer');

    div.append(this.stickersDiv);

    const btn = Button('btn-primary btn-primary-transparent disable-hover', {noRipple: true, text: 'Loading'});
    this.stickersFooter.append(btn);

    this.scrollable.append(div);
    this.body.append(this.stickersFooter);
    
    // const editButton = document.createElement('button');
    // editButton.classList.add('btn-primary');

    // this.stickersFooter.append(editButton);

    this.loadStickerSet();
  }

  private onStickersClick = (e: MouseEvent) => {
    const target = findUpClassName(e.target, 'sticker-set-sticker');
    if(!target) return;

    const fileId = target.dataset.docId;
    if(appImManager.chat.input.sendMessageWithDocument(fileId)) {
      this.hide();
    } else {
      console.warn('got no doc by id:', fileId);
    }
  };

  private loadStickerSet() {
    return this.managers.appStickersManager.getStickerSet(this.stickerSetInput).then(async(set) => {
      if(!set) {
        toastNew({langPackKey: 'StickerSet.DontExist'});
        this.hide();
        return;
      }

      animationIntersector.setOnlyOnePlayableGroup(ANIMATION_GROUP);

      let button: HTMLElement;
      const s = i18n('Stickers', [set.set.count]);
      if(set.set.installed_date) {
        button = Button('btn-primary btn-primary-transparent danger', {noRipple: true});
        button.append(i18n('RemoveStickersCount', [s]));
      } else {
        button = Button('btn-primary btn-color-primary', {noRipple: true});
        button.append(i18n('AddStickersCount', [s]));
      }

      attachClickEvent(button, () => {
        const toggle = toggleDisability([button], true);

        this.managers.appStickersManager.toggleStickerSet(set.set).then(() => {
          this.hide();
        }).catch(() => {
          toggle();
        });
      });

      const lazyLoadQueue = new LazyLoadQueue();
      const divs = await Promise.all(set.documents.map(async(doc) => {
        if(doc._ === 'documentEmpty') {
          return;
        }
        
        const div = document.createElement('div');
        div.classList.add('sticker-set-sticker');

        const size = mediaSizes.active.esgSticker.width;
        
        await wrapSticker({
          doc, 
          div, 
          lazyLoadQueue, 
          group: ANIMATION_GROUP, 
          play: true,
          loop: true,
          width: size,
          height: size
        });

        return div;
      }));

      setInnerHTML(this.title, wrapEmojiText(set.set.title));
      this.stickersFooter.classList.toggle('add', !set.set.installed_date);
      this.stickersFooter.textContent = '';
      this.stickersFooter.append(button);

      this.stickersDiv.classList.remove('is-loading');
      this.stickersDiv.innerHTML = '';
      this.stickersDiv.append(...divs.filter(Boolean));

      this.scrollable.onAdditionalScroll();
    });
  }
}
