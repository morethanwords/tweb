// The product renderer: renderer-bundle.js in a sandboxed, opaque-origin
// iframe (srcdoc with a nonce CSP), talking to the host over a MessagePort.
// Trusted code, validated ops only; see docs/decisions.md for the sandbox flags.

import rendererBundle from 'virtual:renderer-bundle';
import { buildSrcdoc, makeNonce } from '../renderer/srcdoc';
import type { HostToRenderer, RendererToHost } from '../shared/protocol';
import type { Renderer, RendererFactory } from './renderer';

export class IframeRenderer implements Renderer {
  static readonly factory: RendererFactory = (container, theme) => new IframeRenderer(container, theme);

  readonly element: HTMLIFrameElement;
  onMessage: ((msg: RendererToHost) => void) | null = null;
  onDiag: ((kind: string, detail: string) => void) | null = null;
  /** tweb: the frame's end of the channel it made, handed over with its announcement; till then what is sent waits. */
  private port: MessagePort | null = null;
  private waiting: [unknown, Transferable[]][] = [];
  private onWindowMessage: (e: MessageEvent) => void;
  /**
   * tweb: the window whose `message` the frame's announcement comes as, until it came: its parent's, the one its element
   * is in (a Document Picture-in-Picture window's frame announces itself there, never to the tab's).
   */
  private listening: Window | null = null;
  protected destroyed = false;

  /**
   * `bundle`: another trusted script for the frame (the `frame` sync transport's engine frame); `wasm` relaxes the CSP
   * for it; `url` loads the same document from a URL instead of srcdoc (a cross-site URL lets site isolation run the
   * frame in its own process). The frame stays sandboxed, i.e. opaque-origin, either way.
   */
  constructor(container: HTMLElement, theme: 'light' | 'dark', bundle: { js: string; wasm: boolean; url?: string } = { js: rendererBundle, wasm: false }) {
    const nonce = makeNonce();
    const iframe = document.createElement('iframe');
    // Opaque origin, no popups, no top navigation, no same-origin access.
    // allow-forms is needed for `submit` events to be dispatched at all; the
    // submission itself can never navigate (renderer preventDefault + CSP
    // form-action 'none' + action attributes are never forwarded). See docs/decisions.md.
    iframe.setAttribute('sandbox', 'allow-scripts allow-forms');
    iframe.setAttribute('referrerpolicy', 'no-referrer');
    iframe.className = 'widget-frame';
    iframe.style.colorScheme = theme;
    if (bundle.url) iframe.src = bundle.url;
    else iframe.srcdoc = buildSrcdoc(bundle.js, nonce, bundle.wasm);
    this.element = iframe;
    this.onWindowMessage = (e) => {
      if (e.source !== iframe.contentWindow || e.data?.type !== 'tw-renderer-ready' || !e.ports[0]) return;
      this.unlisten();
      const port = this.port = e.ports[0];
      port.onmessage = (ev) => this.receive(ev.data);
      for (const [msg, transfer] of this.waiting.splice(0)) port.postMessage(msg, transfer);
    };
    // Listening before the frame is attached: its announcement cannot be missed. tweb: in the window it goes into.
    this.listen(container.ownerDocument.defaultView ?? window);
    container.appendChild(iframe);
  }

  private listen(win: Window) {
    this.unlisten();
    this.listening = win;
    win.addEventListener('message', this.onWindowMessage);
  }

  private unlisten() {
    this.listening?.removeEventListener('message', this.onWindowMessage);
    this.listening = null;
  }

  /**
   * tweb: the frame's element moved into another window's document before the frame announced itself: a moved frame
   * loads again, and announces itself to its new parent. (After it has, the port is the frame's: one moved then starts
   * blank, as before.)
   */
  rebind() {
    const win = this.element.ownerDocument.defaultView;
    if (this.listening && win && win !== this.listening) this.listen(win);
  }

  /** Frame → host message. */
  protected receive(data: unknown) {
    this.onMessage?.(data as RendererToHost);
  }

  /** The frame is already loading; the renderer bundle announces itself through the port once initialised. */
  load() {}

  send(msg: HostToRenderer) {
    this.post(msg);
  }

  /** To the frame: at once, or once it has handed over its port. */
  protected post(msg: unknown, transfer: Transferable[] = []) {
    if (this.destroyed) return;
    if (this.port) this.port.postMessage(msg, transfer);
    else this.waiting.push([msg, transfer]);
  }

  setTheme(theme: 'light' | 'dark') {
    this.element.style.colorScheme = theme;
  }

  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    this.unlisten();
    this.waiting.length = 0;
    this.port?.close();
    this.element.remove();
  }
}
