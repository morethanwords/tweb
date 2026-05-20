/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import PopupElement, {addCancelButton, PopupButton} from '@components/popups';
import {FormatterArguments, LangPackKey, i18n} from '@lib/langPack';

// ! cant use PopupPeer/confirmationPopup because of awkward recursive dependencies.
// Originally lived in `src/pages/loginPage.ts` next to the `LoginPage` DOM helper;
// extracted here so the legacy `pages/` module tree could be removed in the
// SolidJS auth-flow refactor.
export class SimpleConfirmationPopup extends PopupElement {
  constructor(options: {
    titleLangKey: LangPackKey;
    descriptionLangKey: LangPackKey;
    descriptionArgs?: FormatterArguments;
    buttons: PopupButton[];
  }) {
    super('popup-peer popup-confirmation', {
      title: options.titleLangKey,
      buttons: options.buttons
    });

    const description = document.createElement('p');
    description.classList.add('popup-description');
    description.append(i18n(options.descriptionLangKey, options.descriptionArgs));
    this.header.after(description);
  }

  static show(options: {
    titleLangKey: LangPackKey;
    descriptionLangKey: LangPackKey;
    descriptionArgs?: FormatterArguments;
    button: PopupButton
  }) {
    return new Promise<void>((resolve, reject) => {
      let resolved = false

      const buttons = addCancelButton([options.button])
      const cancelButton = buttons.find((button) => button.isCancel);
      cancelButton.callback = () => {
        if(!resolved) {
          reject();
          resolved = true;
        }
      }
      options.button.callback = () => {
        if(!resolved) {
          resolve()
          resolved = true;
        }
      }

      const popup = PopupElement.createPopup(SimpleConfirmationPopup, {
        titleLangKey: options.titleLangKey,
        descriptionLangKey: options.descriptionLangKey,
        descriptionArgs: options.descriptionArgs,
        buttons: buttons
      })

      popup.addEventListener('closeAfterTimeout', () => {
        if(!resolved) {
          reject();
          resolved = true;
        }
      })

      popup.show()
    })
  }
}

export default SimpleConfirmationPopup;
