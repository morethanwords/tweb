import PopupElement, { addCancelButton, PopupButton, PopupOptions } from ".";
import { LangPackKey, _i18n } from "../../lib/langPack";

export default class PopupConfirmAction extends PopupElement {
  constructor(className: string, buttons: PopupButton[], options: PopupOptions & {title: LangPackKey, text: LangPackKey}) {
    super('popup-peer popup-confirm-action ' + className, addCancelButton(buttons), {
      overlayClosable: true,
      ...options
    });

    _i18n(this.title, options.title);
    
    const p = document.createElement('p');
    p.classList.add('popup-description');
    _i18n(p, options.text);

    this.container.insertBefore(p, this.header.nextElementSibling);
  }
}
