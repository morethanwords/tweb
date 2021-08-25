/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import AvatarElement from "../avatar";
import PopupElement, { addCancelButton, PopupButton, PopupOptions } from ".";
import { i18n, LangPackKey } from "../../lib/langPack";
import CheckboxField, { CheckboxFieldOptions } from "../checkboxField";

export type PopupPeerButtonCallbackCheckboxes = Set<LangPackKey>;
export type PopupPeerButtonCallback = (checkboxes?: PopupPeerButtonCallbackCheckboxes) => void;
export type PopupPeerCheckboxOptions = CheckboxFieldOptions & {checkboxField?: CheckboxField};

export type PopupPeerOptions = PopupOptions & Partial<{
  peerId: number,
  title: string,
  titleLangKey?: LangPackKey,
  titleLangArgs?: any[],
  noTitle?: boolean,
  description: string,
  descriptionLangKey?: LangPackKey,
  descriptionLangArgs?: any[],
  buttons?: Array<Omit<PopupButton, 'callback'> & Partial<{callback: PopupPeerButtonCallback}>>,
  checkboxes: Array<PopupPeerCheckboxOptions>
}>;
export default class PopupPeer extends PopupElement {
  constructor(private className: string, options: PopupPeerOptions = {}) {
    super('popup-peer' + (className ? ' ' + className : ''), options.buttons && addCancelButton(options.buttons), {overlayClosable: true, ...options});

    if(options.peerId) {
      let avatarEl = new AvatarElement();
      avatarEl.setAttribute('dialog', '1');
      avatarEl.setAttribute('peer', '' + options.peerId);
      avatarEl.classList.add('avatar-32');
      this.header.prepend(avatarEl);
    }

    if(!options.noTitle) {
      if(options.titleLangKey || !options.title) this.title.append(i18n(options.titleLangKey || 'AppName', options.titleLangArgs));
      else this.title.innerText = options.title || '';
    }

    const fragment = document.createDocumentFragment();

    if(options.descriptionLangKey || options.description) {
      const p = document.createElement('p');
      p.classList.add('popup-description');
      if(options.descriptionLangKey) p.append(i18n(options.descriptionLangKey, options.descriptionLangArgs));
      else if(options.description) p.innerHTML = options.description;
  
      fragment.append(p);
    }

    if(options.checkboxes) {
      this.container.classList.add('have-checkbox');
      
      options.checkboxes.forEach(o => {
        o.withRipple = false;
        const checkboxField = new CheckboxField(o);
        o.checkboxField = checkboxField;
        fragment.append(checkboxField.label);
      });

      options.buttons.forEach(button => {
        if(button.callback) {
          const original = button.callback;
          button.callback = () => {
            const c: Set<LangPackKey> = new Set();
            options.checkboxes.forEach(o => {
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
