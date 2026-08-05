/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import {JSX, onMount} from 'solid-js';
import classNames from '@helpers/string/classNames';
import {MATH_MARKER_RE, decodeInlineMath} from '@helpers/math/mathMarker';
import styles from '@components/instantView.module.scss';
import loadTemml from '@helpers/math/loadTemml';

// Temml writes `\label{foo}` straight into `id="foo"`, and formula sources arrive in message
// content — so a message would otherwise pick ids for the document. That is two problems: an id is
// exposed on `window` under its own name (a DOM-clobbering primitive), and it can collide with an
// id the app or another formula already owns. Rewrite every id, and the `\ref` links pointing at
// them, into a per-render namespace: the dashes keep it off the global scope and the counter keeps
// each rendered formula to itself.
let labelIdSeed = 0;
function namespaceLabelIds(element: HTMLElement) {
  const labelled = element.querySelectorAll('[id]');
  const referencing = element.querySelectorAll('[href^="#"]');
  if(!labelled.length && !referencing.length) {
    return;
  }

  const prefix = 'tml-label-' + ++labelIdSeed + '-';
  labelled.forEach((node) => node.setAttribute('id', prefix + node.getAttribute('id')));
  referencing.forEach((node) => node.setAttribute('href', '#' + prefix + node.getAttribute('href').slice(1)));
}

// Render LaTeX `source` into `element` as MathML. Shows the raw source until Temml loads and as a
// fallback if the library fails to load or the source doesn't parse (matches WebA's behaviour).
export function renderLatexInto(element: HTMLElement, source: string, isBlock: boolean) {
  element.textContent = source;
  loadTemml().then((temml) => {
    try {
      element.textContent = '';
      temml.render(source, element, {displayMode: isBlock, throwOnError: true});
      namespaceLabelIds(element);
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
