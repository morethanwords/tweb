import {copyTextToClipboard} from '@helpers/clipboard';
import {attachClickEvent} from '@helpers/dom/clickEvent';
import ListenerSetter from '@helpers/listenerSetter';
import wrapPlainText from '@lib/richTextProcessor/wrapPlainText';
import Button from '@components/button';
import ButtonIcon from '@components/buttonIcon';
import ButtonMenuToggle from '@components/buttonMenuToggle';
import shareUrlToPeers from '@components/popups/shareUrl';
import ripple from '@components/ripple';
import {toastNew} from '@components/toast';

export class InviteLink {
  public container: HTMLDivElement;
  public textElement: HTMLDivElement;
  public button: HTMLButtonElement;
  public buttonText: HTMLSpanElement;
  public onButtonClick: () => void;

  public url: string;

  constructor({
    buttons,
    button,
    onButtonClick,
    listenerSetter,
    url,
    noRightButton,
    onClick
  }: {
    buttons?: Parameters<typeof ButtonMenuToggle>[0]['buttons'],
    button?: HTMLButtonElement | false,
    onButtonClick?: () => void,
    listenerSetter: ListenerSetter,
    url?: string,
    noRightButton?: boolean,
    onClick?: () => void
  }) {
    this.onButtonClick = onButtonClick;

    const linkContainer = this.container = document.createElement('div');
    linkContainer.classList.add('invite-link-container');

    const link = document.createElement('div');
    link.classList.add('invite-link', 'rp-overflow');

    const text = this.textElement = document.createElement('div');
    text.classList.add('invite-link-text');

    let rightButton: HTMLElement;
    if(buttons) {
      rightButton = ButtonMenuToggle({
        buttons,
        direction: 'bottom-left',
        buttonOptions: {noRipple: true},
        listenerSetter
      });
    } else if(!noRightButton) {
      rightButton = ButtonIcon('copy', {noRipple: true});
      attachClickEvent(rightButton, () => this.copyLink(), {listenerSetter});
    }

    if(rightButton) rightButton.classList.add('invite-link-menu');

    if(!button && button !== false) {
      button = Button('', {text: 'ShareLink'});
      this.buttonText = button.lastElementChild as HTMLSpanElement;
      attachClickEvent(button, () => {
        if(this.onButtonClick) this.onButtonClick();
        else this.shareLink();
      }, {listenerSetter});
    }

    if(button) {
      this.button = button;
      button.className = 'btn-primary btn-color-primary invite-link-button';
    }

    if(url) this.setUrl(url);
    ripple(link);
    link.append(...[
      text,
      rightButton
    ].filter(Boolean));

    linkContainer.append(link, button || '');

    attachClickEvent(link, onClick || (() => this.copyLink()), {listenerSetter});
  }

  public setUrl(url: string) {
    let s = url;
    if(s.includes('//')) {
      s = url.split('//').slice(1).join('//');
    }
    this.textElement.replaceChildren(wrapPlainText(s));
    this.url = url;
  }

  public copyLink = (url: string = this.url) => {
    copyTextToClipboard(url);
    toastNew({langPackKey: 'LinkCopied'});
  };

  public shareLink = (url: string = this.url) => {
    shareUrlToPeers({url, openAfter: true});
  };
}
