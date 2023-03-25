/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import AvatarElement from '../avatar';
import PopupElement, {addCancelButton, PopupButton, PopupOptions} from '.';
import {i18n, LangPackKey} from '../../lib/langPack';
import CheckboxField, {CheckboxFieldOptions} from '../checkboxField';
import setInnerHTML from '../../helpers/dom/setInnerHTML';
import wrapEmojiText from '../../lib/richTextProcessor/wrapEmojiText';

export type PopupPeerButton = Omit<PopupButton, 'callback'> & Partial<{callback: PopupPeerButtonCallback}>;
export type PopupPeerButtonCallbackCheckboxes = Set<LangPackKey>;
export type PopupPeerButtonCallback = (checkboxes?: PopupPeerButtonCallbackCheckboxes) => void;
export type PopupPeerCheckboxOptions = CheckboxFieldOptions & {checkboxField?: CheckboxField};

export type PopupPeerOptions = Omit<PopupOptions, 'buttons' | 'title'> & Partial<{
  peerId: PeerId,
  threadId: number,
  title: string | HTMLElement,
  titleLangKey: LangPackKey,
  titleLangArgs: any[],
  noTitle: boolean,
  description: Parameters<typeof setInnerHTML>[1],
  descriptionRaw: string,
  descriptionLangKey: LangPackKey,
  descriptionLangArgs: any[],
  buttons: Array<PopupPeerButton>,
  checkboxes: Array<PopupPeerCheckboxOptions>
}>;
export default class PopupPeer extends PopupElement {
  protected description: HTMLParagraphElement;

  constructor(private className: string, options: PopupPeerOptions = {}) {
    super('popup-peer' + (className ? ' ' + className : ''), {
      overlayClosable: true,
      ...options,
      title: true,
      buttons: options.buttons && addCancelButton(options.buttons)
    });

    if(options.peerId) {
      const avatarEl = new AvatarElement();
      avatarEl.classList.add('avatar-32');
      avatarEl.updateWithOptions({
        isDialog: true,
        peerId: options.peerId,
        threadId: options.threadId,
        wrapOptions: {
          middleware: this.middlewareHelper.get()
        }
      });
      this.header.prepend(avatarEl);
    }

    if(!options.noTitle) {
      if(options.titleRaw) {

      } else if(options.titleLangKey || !options.title) {
        this.title.append(i18n(options.titleLangKey || 'AppName', options.titleLangArgs));
      } else if(options.title instanceof HTMLElement) {
        this.title.append(options.title);
      } else this.title.innerText = options.title || '';
    }

    const fragment = document.createDocumentFragment();

    if(options.descriptionLangKey || options.description || options.descriptionRaw) {
      const p = this.description = document.createElement('p');
      p.classList.add('popup-description');
      if(options.descriptionLangKey) p.append(i18n(options.descriptionLangKey, options.descriptionLangArgs));
      else if(options.description) setInnerHTML(p, options.description);
      else if(options.descriptionRaw) p.append(wrapEmojiText(options.descriptionRaw));

      fragment.append(p);
    }

    if(options.checkboxes) {
      this.container.classList.add('have-checkbox');

      options.checkboxes.forEach((o) => {
        o.withRipple = true;
        const checkboxField = new CheckboxField(o);
        o.checkboxField = checkboxField;
        fragment.append(checkboxField.label);
      });

      options.buttons.forEach((button) => {
        if(button.callback) {
          const original = button.callback;
          button.callback = () => {
            const c: Set<LangPackKey> = new Set();
            options.checkboxes.forEach((o) => {
              if(o.checkboxField.checked) {
                c.add(o.text);
              }
            });
            original(c);
          };
        }
      });
    }

    this.container.insertBefore(fragment, this.header.nextElementSibling);
  }
}
