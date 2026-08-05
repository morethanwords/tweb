/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import temmlUrl from 'temml/dist/temml.min.js?url';

export type TemmlRender = (source: string, element: HTMLElement, options?: {displayMode?: boolean, throwOnError?: boolean}) => void;
export type Temml = {render: TemmlRender};

let temmlPromise: Promise<Temml> | undefined;

// Temml MUST reach the browser as a file no bundler re-printed. Its lexer builds the master token
// regex by concatenating string literals holding RAW lone surrogates (the surrogate-pair
// alternative, `"|[\uD800-\uDBFF][\uDC00-\uDFFF]"`). Re-printing that folded string writes each
// lone surrogate as U+FFFD, so the class degrades to `[<FFFD>d800-<FFFD>dbff]`, whose `0-<FFFD>`
// range swallows `\` and makes every control word lex as a one-letter command: `\frac` dies with
// "Unsupported function name: \f" and nothing but bare symbols parses. Verified on temml 0.13.3
// that BOTH the esbuild dev dep-optimizer and the rolldown production build mangle those 4 code
// points — https://github.com/ronkok/Temml/pull/128 did NOT fix it, and `optimizeDeps.exclude`
// would only cover dev. So: `?url` (Vite emits the file byte-identical) + a runtime load the
// bundler cannot see.
//
// We take `temml.min.js` rather than `temml.mjs` because upstream minifies it with terser at
// publish time and terser escapes the lone surrogates correctly — it is 49KB gzip / 41KB brotli
// against the .mjs bundle's 115KB / 93KB, i.e. lighter than the (broken) bundled copy ever was.
// The price is that it is an IIFE global build, not ESM, so it loads via a <script> tag and
// publishes `window.temml`. That global is a `var` in a classic script and therefore
// non-configurable — it stays for the life of the page by design, not by omission.
export default function loadTemml(): Promise<Temml> {
  if(!temmlPromise) {
    temmlPromise = Promise.all([
      loadTemmlScript(),
      import('temml/dist/Temml-Local.css')
    ]).then(([temml]) => temml);
  }

  return temmlPromise;
}

function loadTemmlScript(): Promise<Temml> {
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = temmlUrl;
    script.onload = () => {
      const temml = (window as any).temml as Temml;
      if(temml) resolve(temml);
      else reject(new Error('temml: loaded but no global'));
    };
    script.onerror = () => reject(new Error('temml: failed to load'));
    document.head.append(script);
  });
}
