/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import PopupElement, {addCancelButton, PopupButton} from '@components/popups';
import {FormatterArguments, LangPackKey, i18n} from '@lib/langPack';


// ! cant use PopupPeer/confirmationPopup because of awkward recursive dependencies
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

export default class LoginPage {
  public element: HTMLElement;
  public container: HTMLElement;
  public imageDiv: HTMLElement;
  public inputWrapper: HTMLElement;
  public title: HTMLElement;
  public subtitle: HTMLParagraphElement;

  constructor(options: {
    className: string,
    withInputWrapper?: boolean,
    titleLangKey?: LangPackKey,
    subtitleLangKey?: LangPackKey,
  }) {
    this.element = document.body.querySelector('.' + options.className) as HTMLDivElement;
    // this.element = document.createElement('div');
    // this.element.className = 'page-' + options.className;

    this.container = document.createElement('div');
    this.container.className = 'container center-align';

    this.imageDiv = document.createElement('div');
    this.imageDiv.className = 'auth-image';

    this.title = document.createElement('h4');
    if(options.titleLangKey) {
      this.title.append(i18n(options.titleLangKey));
    }

    this.subtitle = document.createElement('p');
    this.subtitle.className = 'subtitle';
    if(options.subtitleLangKey) {
      this.subtitle.append(i18n(options.subtitleLangKey));
    }

    this.container.append(this.imageDiv, this.title, this.subtitle);

    if(options.withInputWrapper) {
      this.inputWrapper = document.createElement('div');
      this.inputWrapper.className = 'input-wrapper';
      this.container.append(this.inputWrapper);
    }

    this.element.append(this.container);
  }
}
