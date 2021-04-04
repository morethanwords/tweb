import AvatarElement from "../avatar";
import PopupElement, { addCancelButton, PopupButton, PopupOptions } from ".";
import { i18n, LangPackKey } from "../../lib/langPack";
import CheckboxField, { CheckboxFieldOptions } from "../checkboxField";

export type PopupPeerButtonCallbackCheckboxes = Partial<{[text in LangPackKey]: boolean}>;
export type PopupPeerButtonCallback = (checkboxes?: PopupPeerButtonCallbackCheckboxes) => void;

export type PopupPeerOptions = PopupOptions & Partial<{
  peerId: number,
  title: string,
  titleLangKey?: LangPackKey,
  titleLangArgs?: any[],
  description: string,
  descriptionLangKey?: LangPackKey,
  descriptionLangArgs?: any[],
  buttons: Array<Omit<PopupButton, 'callback'> & Partial<{callback: PopupPeerButtonCallback}>>,
  checkboxes: Array<CheckboxFieldOptions & {checkboxField?: CheckboxField}>
}>;
export default class PopupPeer extends PopupElement {
  constructor(private className: string, options: PopupPeerOptions = {}) {
    super('popup-peer' + (className ? ' ' + className : ''), addCancelButton(options.buttons), {overlayClosable: true, ...options});

    if(options.peerId) {
      let avatarEl = new AvatarElement();
      avatarEl.setAttribute('dialog', '1');
      avatarEl.setAttribute('peer', '' + options.peerId);
      avatarEl.classList.add('avatar-32');
      this.header.prepend(avatarEl);
    }

    if(options.descriptionLangKey) this.title.append(i18n(options.titleLangKey, options.titleLangArgs));
    else this.title.innerText = options.title || '';

    let p = document.createElement('p');
    p.classList.add('popup-description');
    if(options.descriptionLangKey) p.append(i18n(options.descriptionLangKey, options.descriptionLangArgs));
    else p.innerHTML = options.description;

    const fragment = document.createDocumentFragment();
    fragment.append(p);

    if(options.checkboxes) {
      this.container.classList.add('have-checkbox');
      
      options.checkboxes.forEach(o => {
        o.withRipple = true;
        const checkboxField = new CheckboxField(o);
        o.checkboxField = checkboxField;
        fragment.append(checkboxField.label);
      });

      options.buttons.forEach(button => {
        if(button.callback) {
          const original = button.callback;
          button.callback = () => {
            const c: PopupPeerButtonCallbackCheckboxes = {};
            options.checkboxes.forEach(o => {
              c[o.text] = o.checkboxField.checked;
            });
            original(c);
          };
        }
      });
    }

    this.container.insertBefore(fragment, this.header.nextElementSibling);
  }
}
