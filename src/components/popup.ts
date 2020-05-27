import AvatarElement from "./avatar";
import { ripple } from "./misc";

export class PopupElement {
  protected element = document.createElement('div');
  protected container = document.createElement('div');
  protected header = document.createElement('div');
  protected title = document.createElement('div');

  constructor(className: string) {
    this.element.classList.add('popup');
    this.element.className = 'popup' + (className ? ' ' + className : '');
    this.container.classList.add('popup-container', 'z-depth-1');

    this.header.classList.add('popup-header');
    this.title.classList.add('popup-title');

    this.header.append(this.title);
    this.container.append(this.header);
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

export type PopupPeerButton = {
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
    buttons: Array<PopupPeerButton>
  }> = {}) {
    super('popup-peer' + (className ? ' ' + className : ''));

    let avatarEl = new AvatarElement();
    avatarEl.setAttribute('dialog', '1');
    avatarEl.setAttribute('peer', '' + options.peerID);
    avatarEl.classList.add('peer-avatar');

    this.title.innerText = options.title || '';
    this.header.prepend(avatarEl);

    let p = document.createElement('p');
    p.classList.add('popup-description');
    p.innerHTML = options.description;

    let buttonsDiv = document.createElement('div');
    buttonsDiv.classList.add('popup-buttons');

    let buttons = options.buttons.map(b => {
      let button = document.createElement('button');
      ripple(button);
      button.className = 'btn' + (b.isDanger ? ' danger' : '');
      button.innerHTML =  b.text;

      if(b.callback) {
        button.addEventListener('click', () => {
          b.callback();
          this.destroy();
        });
      } else if(b.isCancel) {
        button.addEventListener('click', () => {
          this.destroy();
        });
      }

      return button;
    });

    buttonsDiv.append(...buttons);

    this.container.append(p, buttonsDiv);
  }
}