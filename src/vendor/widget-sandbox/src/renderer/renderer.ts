// Renderer bundle entry (security-critical, invariant 6). Runs inside the
// sandboxed srcdoc iframe on the web and inside the native WebViews; it is the
// ONLY script that ever executes there (CSP nonce). The DOM work lives in
// core.ts; this file binds it to the frame's document and to the transport.

import { createRenderer, toBase64 } from './core';
import { documentEnv } from './document-env';
import type { HostToRenderer } from '../shared/protocol';

// Transport is chosen at build time: 'port' (web: MessageChannel from the host
// page), 'webkit' (WKScriptMessageHandler in, evaluateJavaScript out) or 'android'
// (@JavascriptInterface in, evaluateJavascript out).
declare const __TW_TRANSPORT__: 'port' | 'webkit' | 'android';

const doc = document;

document.currentScript?.remove();

const core = createRenderer(documentEnv(doc, __TW_TRANSPORT__ === 'port'));
const onMessage = (msg: HostToRenderer) => core.onMessage(msg);

if (__TW_TRANSPORT__ === 'webkit' || __TW_TRANSPORT__ === 'android') {
  // Native host: messages in through `__twReceive(json)` (evaluateJavaScript),
  // out through the `tw` script message handler (WebKit) or the `tw`
  // @JavascriptInterface object (Android). Binary payloads go as base64.
  const handler = __TW_TRANSPORT__ === 'webkit' ? (window as any).webkit?.messageHandlers?.tw : (window as any).tw;
  const start = () => {
    (window as any).__twReceive = (json: string) => onMessage(JSON.parse(json) as HostToRenderer);
    core.init((msg) => {
      if (msg.type === 'result' && msg.binary) {
        handler.postMessage(JSON.stringify({ ...msg, binary: undefined, binaryBase64: toBase64(msg.binary) }));
        return;
      }
      handler.postMessage(JSON.stringify(msg));
    });
    handler.postMessage(JSON.stringify({ type: 'ready' }));
  };
  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
} else {
  // Web host: a private MessagePort. tweb: the frame makes it and hands the embedding window, and it alone, the other
  // end with its announcement. It used to take one from a `tw-init` whose source was its parent: a message the page
  // posts comes from the window its script is of, and that is the tab's for a frame in a Document Picture-in-Picture
  // window — whose frames never started.
  const { port1: port, port2 } = new MessageChannel();
  // once the document is there, as when the host's port came
  const announce = () => {
    core.init((msg, transfer) => port.postMessage(msg, transfer));
    port.onmessage = (ev) => onMessage(ev.data as HostToRenderer);
    window.parent.postMessage({ type: 'tw-renderer-ready' }, '*', [port2]);
  };
  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', announce, { once: true });
  else announce();
}
