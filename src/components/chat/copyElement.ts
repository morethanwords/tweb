import noop from '@helpers/noop';
import drawMediaToCanvas from '@helpers/canvas/drawMediaToCanvas';
import shouldSnapshotImage from '@components/mediaViewer/shouldSnapshotImage';
import lottieLoader from '@lib/lottie/lottieLoader';
import type LottiePlayer from '@lib/lottie/lottiePlayer';

// which element of a copy is which of its source's
export type CopyPairs = Map<Element, Element>;

/**
 * A copy of an element that shows what it shows: its canvases have their pixels drawn in, its videos (and its
 * images whose object URL may be gone) are pictures of what they show, and what is not shown in it (hidden by a
 * rule through its ancestors, which the copy, drawn elsewhere, would not get) is left out. A copy is no message,
 * field or button: ids and keys are dropped.
 */
export default function copyElement<T extends HTMLElement>(source: T, pairs: CopyPairs = new Map()): T {
  const copy = cloneWithPairs(source, pairs);
  const hidden: Element[] = [];
  pairs.forEach((element, original) => {
    if(original === source) {
      return;
    }

    if(
      original instanceof HTMLElement &&
      !original.getClientRects().length &&
      getComputedStyle(original).display !== 'contents'
    ) {
      hidden.push(element);
      pairs.delete(original);
    } else if(original instanceof HTMLCanvasElement) {
      // a sticker drawn by a worker (a reply's thumbnail) has its frame asked for
      const player = original.dataset.offscreen ? lottieLoader.getAnimation(original.parentElement) : undefined;
      if(player?.offscreen) {
        paintPlayerFrame(player, element as HTMLCanvasElement, player.curFrame);
      } else if(original.width && original.height) try {
        (element as HTMLCanvasElement).getContext('2d').drawImage(original, 0, 0);
      } catch{}
    } else if(
      original instanceof HTMLVideoElement ||
      // a picture by a worker's object URL that may be revoked by now: the original shows what it decoded, a copy
      // would load the URL anew
      (original instanceof HTMLImageElement && shouldSnapshotImage(original))
    ) {
      const frame = drawMediaToCanvas(original) || document.createElement('canvas');
      frame.className = original.className;
      frame.style.cssText = original.style.cssText;
      // laid out and cropped as it was, by rules of its tag too (`.reply-media > img`), which a canvas does not get
      keepStyle(original, frame, ['width', 'height', 'object-fit', 'object-position']);
      element.replaceWith(frame);
      pairs.set(original, frame);
    }
  });
  hidden.forEach((element) => element.remove());

  dropIdentity(copy);
  return copy;
}

/**
 * A copy of an element of a kind of the page's own (a custom element) would be one of that kind: made by its class,
 * and run as one once it is put in the page — registered where its original is (a row of reactions, by its message),
 * mounted anew (a Solid one, without its props), measured, observed. A copy is a picture: what stands for it there is an
 * element of no kind, as its original is made and laid out (its tag's own rules are gone, but for how it is displayed)
 */
function cloneShallow(source: Element) {
  if(!source.localName.includes('-') || !customElements.get(source.localName)) {
    return source.cloneNode(false) as Element;
  }

  const copy = document.createElement(source.localName + '-copy');
  for(const {name, value} of Array.from(source.attributes)) {
    copy.setAttribute(name, value);
  }

  copy.style.display = getComputedStyle(source).display;
  return copy;
}

/** A deep copy, and which of its elements is which of the source's */
export function cloneWithPairs<T extends Element>(source: T, pairs: CopyPairs): T {
  const copy = cloneShallow(source) as T;
  pairs.set(source, copy);
  source.childNodes.forEach((child) => {
    copy.appendChild(child instanceof Element ? cloneWithPairs(child, pairs) : child.cloneNode(true));
  });
  return copy;
}

// a copy is no message, field or button: its ids and keys go
export function dropIdentity(copy: HTMLElement) {
  for(const element of [copy, ...Array.from(copy.querySelectorAll<HTMLElement>('*'))]) {
    for(const name of ['id', 'data-mid', 'data-peer-id', 'data-doc-id', 'contenteditable', 'tabindex', 'role', 'aria-label']) {
      element.removeAttribute(name);
    }
  }
}

// puts on an element of a copy how its original's properties came out, which rules it no longer gets gave it
export function keepStyle(original: Element, copy: HTMLElement, properties: string[]) {
  const style = getComputedStyle(original);
  for(const property of properties) {
    copy.style.setProperty(property, style.getPropertyValue(property));
  }
}

/**
 * A copy is drawn out of its original's place: the custom properties the original gets there (set on it by
 * a selector through its ancestors, or inherited from them) and the copy would not, are put on the copy.
 */
export function keepContext(original: Element, copy: HTMLElement, context: Element) {
  const originalStyle = getComputedStyle(original);
  const contextStyle = getComputedStyle(context);
  for(let i = 0, length = originalStyle.length; i < length; ++i) {
    const property = originalStyle[i];
    if(!property.startsWith('--')) {
      continue;
    }

    const value = originalStyle.getPropertyValue(property);
    if(value !== contextStyle.getPropertyValue(property)) {
      copy.style.setProperty(property, value);
    }
  }
}

/**
 * Paints a frame of a sticker drawn by a worker on a canvas, once it arrives: the sticker's own canvas, handed
 * over to the worker, cannot be drawn from
 */
export function paintPlayerFrame(player: LottiePlayer, canvas: HTMLCanvasElement, frameNo?: number) {
  player.exportFrame(frameNo).then(({frame}) => {
    canvas.width = frame.width;
    canvas.height = frame.height;
    canvas.getContext('2d').drawImage(frame, 0, 0);
    frame.close?.();
  }).catch(noop);
}
