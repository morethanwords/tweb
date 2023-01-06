/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import PopupElement from '.';
import appImManager from '../../lib/appManagers/appImManager';
import TelegramWebView from '../telegramWebView';

export function createVerificationIframe(options: ConstructorParameters<typeof TelegramWebView>[0]) {
  const result = new TelegramWebView({
    ...options,
    sandbox: 'allow-forms allow-scripts allow-same-origin allow-modals'
  });
  const {iframe} = result;
  iframe.allow = 'payment';
  iframe.classList.add('payment-verification');
  return result;
}

export default class PopupPaymentVerification extends PopupElement<{
  finish: () => void
}> {
  private telegramWebView: TelegramWebView;

  constructor(private url: string, private openPathAfter?: boolean) {
    super('popup-payment popup-payment-verification', {
      closable: true,
      overlayClosable: true,
      body: true,
      title: 'Checkout.WebConfirmation.Title'
    });

    this.d();
  }

  private d() {
    const telegramWebView = this.telegramWebView = createVerificationIframe({
      url: this.url
    });

    telegramWebView.addEventListener('web_app_open_tg_link', (e) => {
      this.dispatchEvent('finish');
      this.hide();
      if(this.openPathAfter) {
        appImManager.openUrl('https://t.me' + e.path_full);
      }
    });

    this.body.append(telegramWebView.iframe);
    this.show();
    telegramWebView.onMount();
  }

  protected destroy() {
    this.telegramWebView.destroy();
    return super.destroy();
  }
}
