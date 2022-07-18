/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import PopupElement from ".";
import appImManager from "../../lib/appManagers/appImManager";
import { TelegramWebviewEventCallback } from "../../types";

const weakMap: WeakMap<Window, TelegramWebviewEventCallback> = new WeakMap();
window.addEventListener('message', (e) => {
  const callback = weakMap.get(e.source as Window);
  if(!callback) {
    return;
  }
  
  callback(JSON.parse(e.data));
});

export function createVerificationIframe(url: string, callback: TelegramWebviewEventCallback) {
  const iframe = document.createElement('iframe');
  // iframe.title = 'Complete Payment';
  iframe.allow = 'payment';
  // iframe.setAttribute('sandbox', 'allow-forms allow-scripts allow-same-origin allow-top-navigation allow-modals');
  iframe.setAttribute('sandbox', 'allow-forms allow-scripts allow-same-origin allow-modals');
  iframe.classList.add('payment-verification');
  iframe.src = url;

  iframe.addEventListener('load', () => {
    weakMap.set(iframe.contentWindow, callback);
  }, {once: true});

  return iframe;
}

export default class PopupPaymentVerification extends PopupElement<{
  finish: () => void
}> {
  constructor(private url: string) {
    super('popup-payment popup-payment-verification', {
      closable: true,
      overlayClosable: true,
      body: true,
      title: 'Checkout.WebConfirmation.Title'
    });

    this.d();
  }

  private d() {
    const iframe = createVerificationIframe(this.url, (event) => {
      if(event.eventType !== 'web_app_open_tg_link') {
        return;
      }

      this.dispatchEvent('finish');
      this.hide();
      appImManager.openUrl('https://t.me' + event.eventData.path_full);
    });

    this.body.append(iframe);
    this.show();
  }
}
