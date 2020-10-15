import AvatarElement from "./avatar";
import { PopupElement, PopupButton } from "./popup";

export default class PopupPeer extends PopupElement {
  constructor(private className: string, options: Partial<{
    peerID: number,
    title: string,
    description: string,
    buttons: Array<PopupButton>
  }> = {}) {
    super('popup-peer' + (className ? ' ' + className : ''), options.buttons);

    let avatarEl = new AvatarElement();
    avatarEl.setAttribute('dialog', '1');
    avatarEl.setAttribute('peer', '' + options.peerID);
    avatarEl.classList.add('peer-avatar');

    this.title.innerText = options.title || '';
    this.header.prepend(avatarEl);

    let p = document.createElement('p');
    p.classList.add('popup-description');
    p.innerHTML = options.description;

    this.container.insertBefore(p, this.header.nextElementSibling);
  }
}