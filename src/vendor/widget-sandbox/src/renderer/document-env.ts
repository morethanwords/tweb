// The renderer core bound to a whole document (the iframe / WebView renderers and the `frame` engine frame).

import type { RendererEnv } from './core';
import { measureDocHeight } from '../shared/doc-height';

/** The frame's root scheme, in the UA layer so a widget's own `color-scheme` still wins (core.ts `frameColorScheme`). */
function frameColorScheme(doc: Document) {
  let schemeStyle: HTMLStyleElement | null = null;
  return (scheme: 'light' | 'dark') => {
    if (!schemeStyle) {
      schemeStyle = doc.createElement('style');
      doc.head.appendChild(schemeStyle);
    }
    schemeStyle.textContent = `@layer tw-ua{:where(html){color-scheme:${scheme}}}`;
  };
}

/**
 * The whole document is the widget's: coordinates coincide, the window is the viewport. `inPage`: a frame inside a
 * page (the web's renderer frame and the `frame` engine frame), not a WebView, which is a top-level document over the
 * bubble.
 */
export function documentEnv(doc: Document = document, inPage = false): RendererEnv {
  return {
    doc,
    root: doc,
    roots: () => ({ html: doc.documentElement, head: doc.head, body: doc.body }),
    origin: () => null,
    viewport: () => ({ innerWidth: window.innerWidth, innerHeight: window.innerHeight, dpr: window.devicePixelRatio }),
    docHeight: () => measureDocHeight(doc),
    matchMedia: (query) => matchMedia(query).matches,
    onViewportResize: (cb) => {
      window.addEventListener('resize', cb);
      return () => window.removeEventListener('resize', cb);
    },
    onColorSchemeChange: (cb) => {
      const mq = matchMedia('(prefers-color-scheme: dark)');
      mq.addEventListener('change', cb);
      return () => mq.removeEventListener('change', cb);
    },
    ...(inPage ? { frameColorScheme: frameColorScheme(doc) } : {}),
  };
}
