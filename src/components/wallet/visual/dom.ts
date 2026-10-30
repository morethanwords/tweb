// DOM helpers shared by the wallet visuals: the screen pixel ratio, layout
// offsets, and the hidden <svg> that holds the SVG filters of the amount line.

import {getAppWindow, getOverlayRoot, onAppWindowChange} from '@helpers/appWindow';

/** Pixels per CSS pixel of the window the app is in (a Document PiP one may stand on another screen), capped at 3. */
export function pixelRatio(): number {
  return Math.min(getAppWindow().devicePixelRatio || 1, 3);
}

/** Offset of `el` inside `root` along the offsetParent chain. */
export function offsetIn(el: HTMLElement, root: Element): {x: number, y: number} {
  let x = 0, y = 0;
  for(let n = el; n && n !== root; n = n.offsetParent as HTMLElement) {
    x += n.offsetLeft;
    y += n.offsetTop;
  }
  return {x, y};
}

/**
 * The width `el` is laid out with, unlike its box on screen not scaled by a transform around it (the amount line is
 * scaled to fit, a popup scales as it opens). For a box that is no inline one — a flex item, a positioned element.
 */
export function layoutWidth(el: Element): number {
  return parseFloat((el.ownerDocument.defaultView || getAppWindow()).getComputedStyle(el).width) || 0;
}

// MARK: SVG filters

const SVG_NS = 'http://www.w3.org/2000/svg';
let filterHost: SVGSVGElement = null;
let filterSeed = 0;
let unfollowWindow: () => void;

function svgElement<K extends keyof SVGElementTagNameMap>(name: K): SVGElementTagNameMap[K] {
  return getOverlayRoot().ownerDocument.createElementNS(SVG_NS, name);
}

/**
 * Adds a filter to the shared hidden <svg>, created on demand and removed
 * with its last filter. The filter gets a unique id.
 */
function addFilter(filter: SVGFilterElement, prefix: string) {
  if(!filterHost) {
    filterHost = svgElement('svg');
    filterHost.setAttribute('width', '0');
    filterHost.setAttribute('height', '0');
    filterHost.setAttribute('aria-hidden', 'true');
    filterHost.style.position = 'absolute';
    getOverlayRoot().append(filterHost);
    // * a filter is found by its id in the document of what uses it: the host goes where the app goes (Document PiP)
    unfollowWindow = onAppWindowChange(() => filterHost && getOverlayRoot().append(filterHost));
  }
  filter.id = `wallet-${prefix}-${++filterSeed}`;
  filterHost.append(filter);
}

export function removeFilter(filter: SVGFilterElement) {
  if(filter.parentNode !== filterHost) return;
  filter.remove();
  if(!filterHost.childElementCount) {
    filterHost.remove();
    filterHost = null;
    unfollowWindow?.();
    unfollowWindow = undefined;
  }
}

export interface BlurFilter {
  id: string,
  filter: SVGFilterElement,
  blur: SVGFEGaussianBlurElement
}

/** Vertical smear of a drum line: one step for the whole line, its cells move in time. */
export function smearFilter(): BlurFilter {
  const filter = svgElement('filter');
  filter.setAttribute('x', '-20%');
  filter.setAttribute('y', '-60%');
  filter.setAttribute('width', '140%');
  filter.setAttribute('height', '220%');
  const blur = svgElement('feGaussianBlur');
  blur.setAttribute('stdDeviation', '0 0');
  filter.append(blur);
  addFilter(filter, 'drum');
  return {id: filter.id, filter, blur};
}

/** The drop filter of one digit cell: blur, alpha threshold and a slight edge softening. */
export function gooFilter(): BlurFilter {
  const filter = svgElement('filter');
  filter.setAttribute('x', '-40%');
  filter.setAttribute('y', '-40%');
  filter.setAttribute('width', '180%');
  filter.setAttribute('height', '180%');
  filter.setAttribute('color-interpolation-filters', 'sRGB');
  const blur = svgElement('feGaussianBlur');
  blur.setAttribute('in', 'SourceGraphic');
  blur.setAttribute('stdDeviation', '0');
  const threshold = svgElement('feColorMatrix');
  threshold.setAttribute('values', '1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 19 -8');
  const soft = svgElement('feGaussianBlur');
  soft.setAttribute('stdDeviation', '0.45');
  filter.append(blur, threshold, soft);
  addFilter(filter, 'goo');
  return {id: filter.id, filter, blur};
}
