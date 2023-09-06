/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import type {AppStickersManager} from '../../lib/appManagers/appStickersManager';
import PopupElement from '.';
import wrapSticker from '../wrappers/sticker';
import LazyLoadQueue from '../lazyLoadQueue';
import {putPreloader} from '../putPreloader';
import animationIntersector, {AnimationItemGroup} from '../animationIntersector';
import appImManager from '../../lib/appManagers/appImManager';
import mediaSizes from '../../helpers/mediaSizes';
import {i18n} from '../../lib/langPack';
import Button from '../button';
import findUpClassName from '../../helpers/dom/findUpClassName';
import toggleDisability from '../../helpers/dom/toggleDisability';
import {attachClickEvent} from '../../helpers/dom/clickEvent';
import {toastNew} from '../toast';
import setInnerHTML from '../../helpers/dom/setInnerHTML';
import wrapEmojiText from '../../lib/richTextProcessor/wrapEmojiText';
import createStickersContextMenu from '../../helpers/dom/createStickersContextMenu';
import attachStickerViewerListeners from '../stickerViewer';
import {Document, StickerSet} from '../../layer';
import Row from '../row';
import replaceContent from '../../helpers/dom/replaceContent';
import rootScope from '../../lib/rootScope';
import wrapCustomEmoji from '../wrappers/customEmoji';
import emoticonsDropdown from '../emoticonsDropdown';
import ButtonMenuToggle from '../buttonMenuToggle';
import {copyTextToClipboard} from '../../helpers/clipboard';

const ANIMATION_GROUP: AnimationItemGroup = 'STICKERS-POPUP';

export default class PopupStickers extends PopupElement {
  private appendTo: HTMLElement;
  private updateAdded: {[setId: Long]: (added: boolean) => void};
  private sets: StickerSet.stickerSet[];
  private button: HTMLElement;

  constructor(
    private stickerSetInput: Parameters<AppStickersManager['getStickerSet']>[0] | Parameters<AppStickersManager['getStickerSet']>[0][],
    private isEmojis?: boolean
  ) {
    super('popup-stickers', {
      closable: true,
      overlayClosable: true,
      body: true,
      scrollable: true,
      title: true,
      footer: true
    });

    this.title.append(i18n('Loading'));
    this.updateAdded = {};

    emoticonsDropdown.setIgnoreMouseOut('popup', true);
    this.addEventListener('close', () => {
      emoticonsDropdown.setIgnoreMouseOut('popup', false);
      animationIntersector.setOnlyOnePlayableGroup();
    });

    this.appendTo = this.scrollable.container;

    this.appendTo.classList.add('is-loading');
    putPreloader(this.appendTo, true);

    const btn = Button('btn-primary btn-primary-transparent disable-hover', {noRipple: true, text: 'Loading'});
    this.footer.append(btn);

    attachStickerViewerListeners({listenTo: this.appendTo, listenerSetter: this.listenerSetter});

    const onStickerSetUpdate = (set: StickerSet.stickerSet) => {
      const idx = this.sets.findIndex((_set) => _set.id === set.id);
      if(idx === -1) {
        return;
      }

      this.sets[idx] = set;
      const updateAdded = this.updateAdded[set.id];
      updateAdded?.(!!set.installed_date);
      this.updateButton();
    };

    this.listenerSetter.add(rootScope)('stickers_installed', onStickerSetUpdate);
    this.listenerSetter.add(rootScope)('stickers_deleted', onStickerSetUpdate);

    this.loadStickerSet();
  }

  private createStickerSetElements(set?: StickerSet.stickerSet) {
    const container = document.createElement('div');
    container.classList.add('sticker-set');

    let headerRow: Row, updateAdded: (added: boolean) => void;
    if(set) {
      headerRow = new Row({
        title: wrapEmojiText(set.title),
        subtitle: i18n(set.pFlags.emojis ? 'EmojiCount' : 'Stickers', [set.count]),
        buttonRight: true
      });

      updateAdded = (added) => {
        replaceContent(headerRow.buttonRight, i18n(added ? 'Stickers.SearchAdded' : 'Stickers.SearchAdd'));
        headerRow.buttonRight.classList.toggle('active', added);
      };

      updateAdded(!!set.installed_date);

      container.append(headerRow.container);
    }

    const itemsContainer = document.createElement('div');
    itemsContainer.classList.add('sticker-set-stickers');

    container.append(itemsContainer);

    return {container, headerRow, updateAdded, itemsContainer};
  }

  private onStickersClick = async(e: MouseEvent) => {
    const target = findUpClassName(e.target, 'sticker-set-sticker');
    if(!target) return;

    const docId = target.dataset.docId;
    if(await appImManager.chat.input.sendMessageWithDocument(docId)) {
      this.hide();
    }
  };

  private async loadStickerSet() {
    const middleware = this.middlewareHelper.get();
    const inputs = Array.isArray(this.stickerSetInput) ? this.stickerSetInput : [this.stickerSetInput];
    const setsPromises = inputs.map((input) => this.managers.appStickersManager.getStickerSet(input));
    let sets = await Promise.all(setsPromises);
    if(!middleware()) return;
    let firstSet = sets[0];
    if(sets.length === 1 && !firstSet) {
      toastNew({langPackKey: this.isEmojis ? 'AddEmojiNotFound' : 'StickerSet.DontExist'});
      this.hide();
      return;
    }

    sets = sets.filter(Boolean);
    firstSet = sets[0];

    this.sets = sets.map((set) => set.set);

    const isEmojis = this.isEmojis ??= !!firstSet.set.pFlags.emojis;

    if(!isEmojis) {
      attachClickEvent(this.appendTo, this.onStickersClick, {listenerSetter: this.listenerSetter});

      const {destroy} = createStickersContextMenu({
        listenTo: this.appendTo,
        isStickerPack: true,
        onSend: () => this.hide()
      });

      this.addEventListener('close', destroy);
    }

    animationIntersector.setOnlyOnePlayableGroup(ANIMATION_GROUP);

    const lazyLoadQueue = new LazyLoadQueue();
    const loadPromises: Promise<any>[] = [];

    const containersPromises = sets.map(async(set) => {
      const {container, itemsContainer, headerRow, updateAdded} = this.createStickerSetElements(sets.length > 1 ? set.set : undefined);

      if(headerRow) {
        attachClickEvent(headerRow.buttonRight, () => {
          this.managers.appStickersManager.toggleStickerSet(set.set);
        }, {listenerSetter: this.listenerSetter});
      }

      this.updateAdded[set.set.id] = updateAdded;

      let divs: (HTMLElement | DocumentFragment)[];

      const docs = set.documents.filter((doc) => doc?._ === 'document') as Document.document[];
      if(isEmojis) {
        const fragment = wrapCustomEmoji({
          docIds: docs.map((doc) => doc.id),
          loadPromises,
          animationGroup: ANIMATION_GROUP,
          customEmojiSize: mediaSizes.active.esgCustomEmoji,
          middleware
          // lazyLoadQueue
        });

        (Array.from(fragment.children) as HTMLElement[]).slice(1).forEach((element) => {
          const span = document.createElement('span');
          span.classList.add('super-emoji');
          element.replaceWith(span);
          span.append(element);
        });

        divs = [fragment];

        itemsContainer.classList.replace('sticker-set-stickers', 'super-emojis');
        itemsContainer.classList.add('is-emojis', 'not-local');
      } else {
        divs = await Promise.all(docs.map(async(doc) => {
          const div = document.createElement('div');
          div.classList.add('sticker-set-sticker');

          const size = mediaSizes.active.popupSticker.width;

          await wrapSticker({
            doc,
            div,
            lazyLoadQueue,
            group: ANIMATION_GROUP,
            play: true,
            loop: true,
            width: size,
            height: size,
            withLock: true,
            loadPromises,
            middleware
          });

          return div;
        }));
      }

      itemsContainer.append(...divs.filter(Boolean));

      return container;
    });

    const containers = await Promise.all(containersPromises);
    await Promise.all(loadPromises);

    const button = this.button = Button('', {noRipple: true});

    this.updateButton();

    attachClickEvent(button, () => {
      const toggle = toggleDisability([button], true);

      this.managers.appStickersManager.toggleStickerSets(sets.map((set) => set.set)).then(() => {
        this.hide();
      }).catch(() => {
        toggle();
      });
    }, {listenerSetter: this.listenerSetter});

    if(sets.length === 1) {
      setInnerHTML(this.title, wrapEmojiText(firstSet.set.title));
    } else {
      setInnerHTML(this.title, i18n('Emoji'));
    }

    const btnMenu = ButtonMenuToggle({
      listenerSetter: this.listenerSetter,
      buttons: [{
        icon: 'copy',
        text: 'CopyLink',
        onClick: () => {
          const prefix = `https://t.me/${this.isEmojis ? 'addemoji' : 'addstickers'}/`;
          const text = sets.map((set) => prefix + set.set.short_name).join('\n');
          copyTextToClipboard(text);
        }
      }],
      direction: 'bottom-left'
    });
    this.title.after(btnMenu);

    this.footer.textContent = '';
    this.footer.append(button);

    this.appendTo.classList.remove('is-loading');
    this.appendTo.textContent = '';
    this.appendTo.append(...containers);

    this.scrollable.onAdditionalScroll();
  }

  private updateButton() {
    const {sets, isEmojis} = this;
    let isAdd: boolean, buttonAppend: HTMLElement;
    if(sets.length === 1) {
      const firstSet = sets[0];
      buttonAppend = i18n(isEmojis ? 'EmojiCount' : 'Stickers', [firstSet.count]);
      isAdd = !firstSet.installed_date;
    } else {
      const installed = sets.filter((set) => set.installed_date);
      let count: number;
      if(sets.length === installed.length) {
        isAdd = false;
        count = sets.length;
      } else {
        isAdd = true;
        count = sets.length - installed.length;
      }

      buttonAppend = i18n('EmojiPackCount', [count]);
    }

    this.button.className = isAdd ? 'btn-primary btn-color-primary' : 'btn-primary btn-primary-transparent danger';
    replaceContent(this.button, i18n(isAdd ? 'AddStickersCount' : 'RemoveStickersCount', [buttonAppend]));
  }
}
