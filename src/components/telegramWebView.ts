import EventListenerBase from '@helpers/eventListenerBase';
import {TelegramWebViewEvent, TelegramWebViewEventMap, TelegramWebViewSendEventMap} from '@types';

const weakMap: WeakMap<Window, TelegramWebView> = new WeakMap();
window.addEventListener('message', (e) => {
  weakMap.get(e.source as Window)?.onMessage(e.origin, e.data);
});

export default class TelegramWebView extends EventListenerBase<{
  [type in keyof TelegramWebViewEventMap]: (data: TelegramWebViewEventMap[type]) => void
}> {
  public iframe: HTMLIFrameElement;
  public lastDispatchedWebViewEvent: {type: keyof TelegramWebViewSendEventMap, count: number};

  private onLoad: () => void;
  private html: string;
  private origin: string;

  constructor({url, sandbox, allow, html, origin, onLoad}: {
    url?: string,
    sandbox?: string,
    allow?: string,
    html?: string,
    origin?: string,
    onLoad?: () => void
  }) {
    super(false);

    const iframe = this.iframe = document.createElement('iframe');
    if(url) iframe.src = url;
    if(sandbox) iframe.setAttribute('sandbox', sandbox);
    if(allow) iframe.allow = allow;
    if(html) this.html = html;
    if(origin) this.origin = origin;

    if(onLoad) {
      this.onLoad = onLoad;
      iframe.addEventListener('load', onLoad, {once: true});
    }
  }

  // ! `origin` is set only for a frame the server asked to keep on the origin it was opened at
  // ! (`webViewResultUrl.same_origin`) — the WindowProxy keeps its identity across a cross-origin
  // ! navigation, so without this the document that replaced it would inherit the bridge, and with
  // ! it the privileges of the bot the frame was opened for
  public setOrigin(origin: string) {
    this.origin = origin;
  }

  public onMessage(origin: string, data: string) {
    if(this.origin && origin !== this.origin) {
      return;
    }

    this.onTelegramWebViewEvent(JSON.parse(data));
  }

  public onMount() {
    // ! the WindowProxy stays the same object across the srcdoc navigation, so registering
    // ! before assigning it keeps the bridge working and avoids missing an early event
    // ! from the frame
    weakMap.set(this.iframe.contentWindow, this);
    if(this.html) {
      // ! never write into contentWindow.document — a no-src iframe inherits this origin,
      // ! which would run the embedded third-party scripts as web.telegram.org
      this.iframe.srcdoc = this.html;
    }
  }

  public destroy() {
    this.cleanup();
    weakMap.delete(this.iframe.contentWindow);
    this.iframe.removeEventListener('load', this.onLoad);
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
    if(this.lastDispatchedWebViewEvent?.type !== eventType) {
      this.lastDispatchedWebViewEvent = {type: eventType, count: 0};
    }

    ++this.lastDispatchedWebViewEvent.count;
    // ! targeting the origin makes the browser drop the event when the frame has navigated away —
    // ! otherwise an answer to a request the mini app made (its location, the clipboard, a custom
    // ! method result) would be handed to whatever document occupies the frame by the time it arrives
    this.iframe.contentWindow.postMessage(JSON.stringify({
      eventType,
      eventData
    }), this.origin || '*');
  }
}
