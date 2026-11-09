/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import applyWithoutTransition from '@helpers/dom/applyWithoutTransition';
import {computeRanges, TextHighlightMatch} from '@helpers/dom/textHighlight';

/**
 * The collapsible part of every rendered details block (`pageBlockDetails`), whoever draws it — a page in the
 * Instant View or a rich message in a bubble — so what lands on its text from outside (an anchor jump, a quote or a
 * search match lit up in a bubble) can open it.
 */
export const DETAILS_CONTENT_CLASS = 'iv-details-content';

export type DetailsControls = {
  isOpen: () => boolean,
  setOpen: (open: boolean) => void
};

const registry: WeakMap<HTMLElement, DetailsControls> = new WeakMap();

/** `content` is the details' collapsible part, the element that carries `DETAILS_CONTENT_CLASS` */
export function registerDetails(content: HTMLElement, controls: DetailsControls) {
  registry.set(content, controls);
}

/**
 * Opens what is collapsed, its expand transition skipped when `instantly`: the geometry is final as this returns,
 * for a scroll and a highlight measured right after it. One reflow for all of them, and none when nothing opens.
 */
function openDetails(contents: HTMLElement[], instantly?: boolean) {
  const opening = contents.filter((content) => {
    const controls = registry.get(content);
    return controls && !controls.isOpen();
  });
  if(!opening.length) {
    return false;
  }

  const open = () => opening.forEach((content) => registry.get(content).setOpen(true));
  if(instantly) {
    applyWithoutTransition(opening, open);
  } else {
    open();
  }

  return true;
}

function getDetailsAncestors(node: Node) {
  const contents: HTMLElement[] = [];
  let element = node instanceof HTMLElement ? node : node.parentElement;
  while(element = element?.closest<HTMLElement>(`.${DETAILS_CONTENT_CLASS}`)) {
    contents.push(element);
    element = element.parentElement;
  }

  return contents;
}

/** Opens every collapsed details the element sits inside, so it is actually visible before it is scrolled to */
export function expandDetailsAncestors(element: Node, instantly?: boolean) {
  return openDetails(getDetailsAncestors(element), instantly);
}

/**
 * Opens every collapsed details the range shows text of: those around it, and those it takes in wholly or in part —
 * nested ones at every level. A details whose title alone the range covers stays as it is.
 */
export function expandDetailsInRange(range: Range, instantly?: boolean) {
  const common = range.commonAncestorContainer;
  const contents = getDetailsAncestors(common);
  if(common instanceof Element) {
    common.querySelectorAll<HTMLElement>(`.${DETAILS_CONTENT_CLASS}`).forEach((content) => {
      if(range.intersectsNode(content)) {
        contents.push(content);
      }
    });
  }

  return openDetails(contents, instantly);
}

/**
 * Opens, at once, every collapsed details that holds the text a highlight of `match` in `container` is about — its
 * first occurrence, the one a jump scrolls to. A container without details costs a lookup and nothing more.
 */
export function expandTextMatchDetails(container: HTMLElement, match: TextHighlightMatch, skip?: string) {
  if(!container.querySelector(`.${DETAILS_CONTENT_CLASS}`)) {
    return false;
  }

  const [range] = computeRanges(container, match, skip);
  return range ? expandDetailsInRange(range, true) : false;
}
