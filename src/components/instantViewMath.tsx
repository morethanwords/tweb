/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import {JSX, onMount} from 'solid-js';
import classNames from '@helpers/string/classNames';
import {MATH_MARKER_RE, decodeInlineMath} from '@helpers/math/mathMarker';
import styles from '@components/instantView.module.scss';

type TemmlRender = (source: string, element: HTMLElement, options?: {displayMode?: boolean, throwOnError?: boolean}) => void;
let temmlPromise: Promise<{render: TemmlRender}> | undefined;

// Temml and its font CSS load lazily on the first formula (not at IV open) as a Vite-minified async
// chunk. WebA loads the unminified bundle via `temml.mjs?url` to dodge an old Temml/Vite build bug;
// that bug is fixed since https://github.com/ronkok/Temml/pull/128, so a plain dynamic import works
// and lets Vite minify + tree-shake it (~2x smaller over the wire).
function ensureTemml(): Promise<{render: TemmlRender}> {
  if(!temmlPromise) {
    temmlPromise = Promise.all([
      import('temml'),
      import('temml/dist/Temml-Local.css')
    ]).then(([m]) => (m as unknown as {default: {render: TemmlRender}}).default);
  }
  return temmlPromise;
}

// Render LaTeX `source` into `element` as MathML. Shows the raw source until Temml loads and as a
// fallback if the library fails to load or the source doesn't parse (matches WebA's behaviour).
export function renderLatexInto(element: HTMLElement, source: string, isBlock: boolean) {
  element.textContent = source;
  ensureTemml().then((temml) => {
    try {
      element.textContent = '';
      temml.render(source, element, {displayMode: isBlock, throwOnError: true});
    } catch{
      element.textContent = source;
    }
  }, () => {
    element.textContent = source;
  });
}

// Block math (`$$…$$`) — a Solid component used directly in the IV block renderer.
export function Latex(props: {source: string, isBlock?: boolean}): JSX.Element {
  let ref: HTMLSpanElement;
  onMount(() => renderLatexInto(ref, props.source, props.isBlock));
  return <span ref={ref!} class={classNames(styles.Latex, props.isBlock && styles.LatexBlock)} />;
}

// Inline math — wrapRichText emits the base64 marker as plain text. Replace each marker in the
// fragment with a span and render it with Temml (display mode off). Run on the fragment BEFORE it
// is inserted into the document, so the `\x02…` sentinels never become visible.
export function hydrateInlineMath(fragment: DocumentFragment | HTMLElement) {
  const walker = document.createTreeWalker(fragment, NodeFilter.SHOW_TEXT);
  const textNodes: Text[] = [];
  let node: Node;
  while((node = walker.nextNode())) {
    if(node.nodeValue.includes('\x02')) {
      textNodes.push(node as Text);
    }
  }

  for(const textNode of textNodes) {
    const text = textNode.nodeValue;
    MATH_MARKER_RE.lastIndex = 0;
    if(!MATH_MARKER_RE.test(text)) {
      continue;
    }

    MATH_MARKER_RE.lastIndex = 0;
    const pieces = document.createDocumentFragment();
    let last = 0;
    let m: RegExpExecArray;
    while((m = MATH_MARKER_RE.exec(text))) {
      if(m.index > last) {
        pieces.append(text.slice(last, m.index));
      }
      const span = document.createElement('span');
      span.className = styles.LatexInline;
      renderLatexInto(span, decodeInlineMath(m[1]), false);
      pieces.append(span);
      last = m.index + m[0].length;
    }
    if(last < text.length) {
      pieces.append(text.slice(last));
    }
    textNode.replaceWith(pieces);
  }
}
