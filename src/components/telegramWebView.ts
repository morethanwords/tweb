/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import EventListenerBase from '../helpers/eventListenerBase';
import {TelegramWebViewEvent, TelegramWebViewEventCallback, TelegramWebViewEventMap, TelegramWebViewSendEventMap} from '../types';

const weakMap: WeakMap<Window, TelegramWebViewEventCallback> = new WeakMap();
window.addEventListener('message', (e) => {
  const callback = weakMap.get(e.source as Window);
  if(!callback) {
    return;
  }

  callback(JSON.parse(e.data));
});

export default class TelegramWebView extends EventListenerBase<{
  [type in keyof TelegramWebViewEventMap]: (data: TelegramWebViewEventMap[type]) => void
}> {
  public iframe: HTMLIFrameElement;

  constructor({url, sandbox, allow}: {
    url: string,
    sandbox?: string,
    allow?: string
  }) {
    super(false);

    const iframe = this.iframe = document.createElement('iframe');
    iframe.src = url;
    if(sandbox) iframe.setAttribute('sandbox', sandbox);
    if(allow) iframe.allow = allow;
  }

  public onMount() {
    weakMap.set(this.iframe.contentWindow, this.onTelegramWebViewEvent);
  }

  public destroy() {
    this.cleanup();
    weakMap.delete(this.iframe.contentWindow);
  }

  private onTelegramWebViewEvent = ({eventType, eventData}: TelegramWebViewEvent) => {
    if((eventData as any) === '') {
      eventData = undefined;
    }

    // console.log('onTelegramWebViewEvent', eventType, eventData);
    this.dispatchEvent(eventType, eventData as any);
  };

  public dispatchWebViewEvent<T extends keyof TelegramWebViewSendEventMap>(
    eventType: T,
    eventData: TelegramWebViewSendEventMap[T]
  ) {
    this.iframe.contentWindow.postMessage(JSON.stringify({
      eventType,
      eventData
    }), '*');
  }
}
