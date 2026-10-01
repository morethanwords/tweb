/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import {Accessor, createEffect, createMemo, createSignal, JSX, onCleanup, untrack} from 'solid-js';
import classNames from '@helpers/string/classNames';
import {getMiddleware, Middleware} from '@helpers/middleware';
import {MATH_MARKER_RE, decodeInlineMath} from '@helpers/math/mathMarker';
import styles from '@components/instantViewStyles';
import loadTemml from '@helpers/math/loadTemml';
import {fastRaf} from '@helpers/schedulers';
import {TextWithEntities} from '@layer';
import {updateGraphemeOffsets} from '@lib/richTextProcessor/graphemes';
import createMessageTextRevealLeafBinding from '@components/chat/bubbleParts/solidMessageText/revealLeafBinding';
import {
  MessageTextLayoutEvent,
  MessageTextPhase,
  MessageTextRevealCoordinator
} from '@components/chat/bubbleParts/solidMessageText';

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

// A formula's source is bounded by the message limit (32 KB); what it turns into is not. Temml's
// `maxExpand` counts macro expansions, not their size, so `\def\x{…200 chars…}` used 999 times
// grew 2 KB of message into 200k tokens, and one `\def\x#1{#1#1…}` fed a long argument does the
// same in a single expansion; a dozen nested `\cancelto`s build their body 2^12 times without any
// macro at all. The MathML is worse still: Chrome appends `<mi>` siblings in quadratic time, so
// 100k of them held the main thread for 14 s and left the tab at "Page Unresponsive" every time
// the chat opened. patches/temml.patch adds two budgets, both enforced while the work happens
// rather than after it: every token an expansion emits is charged against `maxExpandTokens`,
// and every MathML node the builder creates against `maxNodes`. A formula over either falls back
// to its source, like one that does not parse. 4k nodes is three times the largest formula
// anyone writes (a 12×12 matrix of fractions is 1.2k) and costs ~50 ms to build and lay out.
export const MAX_FORMULA_EXPANDED_TOKENS = 100_000;
export const MAX_FORMULA_NODES = 4_000;

// Typesetting is synchronous and its cost is the size of the result: in Chrome, layout is ~10 µs
// per MathML node whatever the tree's shape, on top of the build. A message can hold dozens of
// formulas at the node budget, and a chat opens with dozens of messages, so that work must not
// all land in the frame the chat opens in. Formulas are typeset through a queue with a per-frame
// allowance: while a frame has allowance left they typeset right away — an ordinary screen of
// messages fits in one frame and looks as before — and once it is spent the rest keep showing
// their source until the next frame. The chat is interactive from the first frame however much
// math it carries, and no frame does more than the allowance plus one formula.
const FRAME_NODE_ALLOWANCE = 2_000;
let frameNodes = 0;
let frameArmed = false;
const waiting: Array<() => number> = [];

function armFrame() {
  if(frameArmed) return;
  frameArmed = true;
  fastRaf(() => {
    frameArmed = false;
    frameNodes = 0;
    try {
      while(waiting.length && frameNodes < FRAME_NODE_ALLOWANCE) {
        frameNodes += waiting.shift()();
      }
    } finally {
      // a spent allowance needs one more frame to reset it, or the next formula to arrive —
      // seconds later, with nothing queued — would wait a frame and flash its source
      if(waiting.length || frameNodes >= FRAME_NODE_ALLOWANCE) armFrame();
    }
  });
}

// Runs `typeset` (which returns the number of nodes it added) right away if the current frame
// has allowance left — synchronously, so the common case costs no extra tick — and otherwise
// in a later frame, returning a promise for when it has run. `immediate` typesets now whatever
// the frame has left: the composer's own formula is one user-driven formula at a time, bounded
// by the node budget, and must not wait behind the backlog of the chat under it.
function typesetWithinFrameAllowance(typeset: () => number, immediate?: boolean): void | Promise<void> {
  if(immediate || frameNodes < FRAME_NODE_ALLOWANCE) {
    frameNodes += typeset();
    armFrame();
    return;
  }

  return new Promise<void>((resolve) => {
    waiting.push(() => {
      try {
        return typeset();
      } finally {
        resolve();
      }
    });
    armFrame();
  });
}

// Render LaTeX `source` into `element` as MathML. Shows the raw source until Temml loads and its
// turn comes, and as a fallback if the library fails to load, the source doesn't parse (matches
// WebA's behaviour) or the formula is over budget. `immediate` is for the composer: see
// `typesetWithinFrameAllowance`.
export function renderLatexInto(
  element: HTMLElement,
  source: string,
  isBlock: boolean,
  middleware?: Middleware,
  immediate?: boolean
) {
  element.textContent = source;
  return loadTemml().then((temml) => typesetWithinFrameAllowance(() => {
    if(middleware && !middleware()) return 0;
    try {
      element.textContent = '';
      temml.render(source, element, {
        displayMode: isBlock,
        throwOnError: true,
        maxExpandTokens: MAX_FORMULA_EXPANDED_TOKENS,
        maxNodes: MAX_FORMULA_NODES
      });
      namespaceLabelIds(element);
      return element.getElementsByTagName('*').length;
    } catch{
      element.textContent = source;
      return 0;
    }
  }, immediate), () => {
    if(middleware && !middleware()) return;
    element.textContent = source;
  });
}

// Block math (`$$…$$`) — a Solid component used directly in the IV block renderer. Rich-message
// formulas register as regular reveal leaves, so one body-level cursor accounts for their source
// graphemes instead of letting the complete formula flash ahead of the surrounding text.
export function Latex(props: {
  source: string,
  isBlock?: boolean,
  sourceRevision?: Accessor<number>,
  phase?: Accessor<MessageTextPhase>,
  revealCoordinator?: MessageTextRevealCoordinator,
  onTextLayout?: (event: MessageTextLayoutEvent) => void
}): JSX.Element {
  let ref: HTMLSpanElement;
  let generation = getMiddleware();
  let offsetsText = '';
  let offsets = [0];
  let renderKey: string;
  const sourceRevision = () => props.sourceRevision?.() ?? 0;
  const phase = () => props.phase?.() ?? 'final';
  const value = createMemo<TextWithEntities>(() => ({
    _: 'textWithEntities',
    text: props.source || '',
    entities: []
  }));
  const revealBinding = createMessageTextRevealLeafBinding({
    coordinator: props.revealCoordinator,
    value,
    element: () => ref
  });
  const revealLeaf = revealBinding?.leaf;
  const coordinatedPhase = revealLeaf ? props.revealCoordinator.phase : undefined;
  const [renderedSourceRevision, setRenderedSourceRevision] = createSignal(untrack(sourceRevision));

  const visibleSource = createMemo(() => {
    const source = value().text;
    const visibleGraphemes = revealLeaf?.visibleGraphemes();
    if(visibleGraphemes === undefined) return source;

    if(source !== offsetsText) {
      const append = source.length >= offsetsText.length && source.startsWith(offsetsText);
      offsets = updateGraphemeOffsets(offsetsText, offsets, source, append);
      offsetsText = source;
    }

    const index = Math.max(0, Math.min(Math.floor(visibleGraphemes), offsets.length - 1));
    return source.slice(0, offsets[index]);
  });

  createEffect(() => {
    const revision = revealLeaf ? untrack(sourceRevision) : sourceRevision();
    if(revealBinding && !revealBinding.ready()) return;
    const source = visibleSource();
    const fullSource = value().text;
    const currentPhase = coordinatedPhase?.() ?? phase();
    const complete = source === fullSource;
    const shouldTypeset = complete && currentPhase === 'final';
    const nextRenderKey = `${shouldTypeset ? 'latex' : 'raw'}\x00${source}`;
    setRenderedSourceRevision(revision);
    if(nextRenderKey === renderKey) return;
    renderKey = nextRenderKey;

    generation.destroy();
    generation = getMiddleware();
    const middleware = generation.get();
    if(!source) {
      ref.textContent = '';
      props.onTextLayout?.({
        element: ref,
        sourceRevision: revision,
        phase: currentPhase,
        reason: 'render',
        renderMode: 'replace'
      });
      return;
    }

    // Parsing each growing source revision would make a long formula
    // quadratic, even if the reveal cursor has caught up between slow tokens.
    // Keep the grapheme-safe raw source throughout streaming/finalizing; the
    // coordinator changes finalizing to final only after the last reveal.
    if(!shouldTypeset) {
      ref.textContent = source;
      props.onTextLayout?.({
        element: ref,
        sourceRevision: revision,
        phase: currentPhase,
        reason: 'render',
        renderMode: 'replace'
      });
      return;
    }

    const ready = renderLatexInto(ref, source, props.isBlock, middleware);
    props.onTextLayout?.({
      element: ref,
      sourceRevision: revision,
      phase: currentPhase,
      reason: 'render',
      renderMode: 'replace'
    });
    ready.then(() => {
      if(!middleware()) return;
      props.onTextLayout?.({
        element: ref,
        sourceRevision: untrack(sourceRevision),
        phase: coordinatedPhase ? untrack(coordinatedPhase) : untrack(phase),
        reason: 'resources-ready',
        renderMode: 'replace'
      });
    });
  });
  onCleanup(() => {
    generation.destroy();
  });
  return (
    <span
      ref={ref!}
      class={classNames(styles.Latex, props.isBlock && styles.LatexBlock)}
      data-source-revision={renderedSourceRevision()}
    />
  );
}

// Inline math — wrapRichText emits the base64 marker as plain text. Replace each marker in the
// fragment with a span and render it with Temml (display mode off). Run on the fragment BEFORE it
// is inserted into the document, so the `\x02…` sentinels never become visible.
export function hydrateInlineMath(
  fragment: DocumentFragment | HTMLElement,
  middleware?: Middleware,
  typeset = true
) {
  const walker = document.createTreeWalker(fragment, NodeFilter.SHOW_TEXT);
  const textNodes: Text[] = [];
  const work: Promise<unknown>[] = [];
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
      const source = decodeInlineMath(m[1]);
      if(typeset) work.push(renderLatexInto(span, source, false, middleware));
      else span.textContent = source;
      pieces.append(span);
      last = m.index + m[0].length;
    }
    if(last < text.length) {
      pieces.append(text.slice(last));
    }
    textNode.replaceWith(pieces);
  }
  return work.length ? Promise.allSettled(work) : undefined;
}
