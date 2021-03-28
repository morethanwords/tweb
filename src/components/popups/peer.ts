import AvatarElement from "../avatar";
import PopupElement, { PopupButton } from ".";
import { i18n, LangPackKey } from "../../lib/langPack";

export default class PopupPeer extends PopupElement {
  constructor(private className: string, options: Partial<{
    peerId: number,
    title: string,
    titleLangKey?: LangPackKey,
    description: string,
    descriptionLangKey?: LangPackKey,
    buttons: Array<PopupButton>
  }> = {}) {
    super('popup-peer' + (className ? ' ' + className : ''), options.buttons, {overlayClosable: true});

    let avatarEl = new AvatarElement();
    avatarEl.setAttribute('dialog', '1');
    avatarEl.setAttribute('peer', '' + options.peerId);
    avatarEl.classList.add('avatar-32');

    if(options.descriptionLangKey) this.title.append(i18n(options.titleLangKey));
    else this.title.innerText = options.title || '';
    this.header.prepend(avatarEl);

    let p = document.createElement('p');
    p.classList.add('popup-description');
    if(options.descriptionLangKey) p.append(i18n(options.descriptionLangKey));
    else p.innerHTML = options.description;

    this.container.insertBefore(p, this.header.nextElementSibling);
  }
}
