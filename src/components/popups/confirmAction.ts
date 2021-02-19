import PopupElement, { addCancelButton, PopupButton, PopupOptions } from ".";

export default class PopupConfirmAction extends PopupElement {
  constructor(className: string, buttons: PopupButton[], options: PopupOptions & Partial<{title: string, text: string}> = {}) {
    super('popup-peer popup-confirm-action ' + className, addCancelButton(buttons), {
      overlayClosable: true,
      ...options
    });

    this.title.innerHTML = options.title || 'Warning';
    
    const p = document.createElement('p');
    p.classList.add('popup-description');
    p.innerHTML = options.text;

    this.container.insertBefore(p, this.header.nextElementSibling);
  }
}
