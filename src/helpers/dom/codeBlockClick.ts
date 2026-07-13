/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import findUpClassName from '@helpers/dom/findUpClassName';

export type CodeBlockClickTarget = {
  code: HTMLElement,
  container: HTMLElement | null, // null for a bare `.monospace-text` (no code-header wrapper)
  isWrapToggle: boolean
};

// Resolve a click/mousedown target to the code block it acts on (the `.code-code` of a fenced block,
// or a bare `.monospace-text`), or null if it isn't a code-block control. Shared by the chat bubbles
// handler and the Instant View onClick delegator so the detection lives in one place.
export function getCodeBlockClickTarget(target: EventTarget): CodeBlockClickTarget | null {
  const container = findUpClassName(target, 'code-header') && findUpClassName(target, 'code');
  const code = container?.querySelector<HTMLElement>('.code-code') || findUpClassName(target, 'monospace-text');
  if(!code) {
    return null;
  }
  return {code, container: container || null, isWrapToggle: !!findUpClassName(target, 'code-header-toggle-wrap')};
}

// Toggle the code block between horizontal-scroll and wrap.
export function toggleCodeBlockWrap({code, container}: CodeBlockClickTarget) {
  if(!container) {
    return;
  }
  const present = container.classList.toggle('is-scrollable');
  code.classList.toggle('no-scrollbar', present);
}
