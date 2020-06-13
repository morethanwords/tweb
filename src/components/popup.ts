import AvatarElement from "./avatar";
import { ripple } from "./misc";

export class PopupElement {
  protected element = document.createElement('div');
  protected container = document.createElement('div');
  protected header = document.createElement('div');
  protected title = document.createElement('div');

  constructor(className: string, buttons?: Array<PopupButton>) {
    this.element.classList.add('popup');
    this.element.className = 'popup' + (className ? ' ' + className : '');
    this.container.classList.add('popup-container', 'z-depth-1');

    this.header.classList.add('popup-header');
    this.title.classList.add('popup-title');

    this.header.append(this.title);
    this.container.append(this.header);

    if(buttons && buttons.length) {
      const buttonsDiv = document.createElement('div');
      buttonsDiv.classList.add('popup-buttons');
  
      const buttonsElements = buttons.map(b => {
        const button = document.createElement('button');
        button.className = 'btn' + (b.isDanger ? ' danger' : '');
        button.innerHTML =  b.text;
        ripple(button);
  
        if(b.callback) {
          button.addEventListener('click', () => {
            b.callback();
            this.destroy();
          }, {once: true});
        } else if(b.isCancel) {
          button.addEventListener('click', () => {
            this.destroy();
          }, {once: true});
        }
  
        return button;
      });
  
      buttonsDiv.append(...buttonsElements);
      this.container.append(buttonsDiv);
    }

    this.element.append(this.container);
  }

  public show() {
    document.body.append(this.element);
    void this.element.offsetWidth; // reflow
    this.element.classList.add('active');
  }

  public destroy() {
    this.element.classList.remove('active');
    setTimeout(() => {
      this.element.remove();
    }, 1000);
  }
}

export type PopupButton = {
  text: string,
  callback?: () => void,
  isDanger?: true,
  isCancel?: true
};

export class PopupPeer extends PopupElement {
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