import type Chat from '@components/chat/chat';
import noop from '@helpers/noop';
import shallowCopy from '@helpers/dom/shallowCopy';

/**
 * Where a widget runs its first task while its bubble is not in the chat yet. The engine is off the page's thread
 * (the `worker` transport), so the widget cannot draw in the moment the bubble enters; it draws before, here, and its
 * frame moves into the bubble as the bubble enters — with the content and the height it ends up with.
 *
 * Here is a hidden copy of the chain the bubble will sit in: the chat's bubbles column, a date group, a group, then
 * the bubble and what it holds down to the widget's block, each copied with its classes and inline style only. It is
 * laid out at the width the chat's scrollable gives its column, so the widget lays out at the width it will have, and
 * answers its layout queries from there. The copy is out of sight and out of reach (no hit testing, no focus, no
 * accessibility tree) and holds no `data-*` of the bubble, so nothing that looks for bubbles finds it. Out of sight by
 * clipping, not visibility (the renderer's `:host{all:initial}` makes a widget visible again) nor opacity (WebKit
 * samples the animations of a transparent subtree sparsely: a widget's first `animationiteration` events were lost).
 */

type Layer = {
  layer: HTMLElement,
  observer: ResizeObserver,
  /** Resolves once the scrollable's width is known (the observer's first report). */
  sized: Promise<void>,
  users: number
};

const layers = new WeakMap<Chat, Layer>();

function getLayer(chat: Chat): Layer {
  let entry = layers.get(chat);
  if(entry) return entry;
  const bubbles = chat.bubbles;
  const layer = document.createElement('div');
  // below the topbar and its plates, where the bubbles show: what the widget hit-tests there is its own (`reveal`)
  layer.style.cssText = 'position:absolute;top:var(--chat-padding-top,0px);left:0;height:0;overflow:hidden;pointer-events:none;contain:strict;';
  layer.setAttribute('aria-hidden', 'true');
  let markSized: () => void;
  const sized = new Promise<void>((resolve) => markSized = resolve);
  // the width the scrollable gives the column (without its scrollbar), as the observer reports it: nothing is read.
  // Made in the chat's own window (the client may be in Document Picture-in-Picture).
  const view = bubbles.container.ownerDocument.defaultView ?? window;
  const observer = new view.ResizeObserver(([entry]) => {
    layer.style.width = entry.contentRect.width + 'px';
    markSized();
  });
  observer.observe(bubbles.scrollable.container);
  bubbles.container.append(layer);
  layers.set(chat, entry = {layer, observer, sized, users: 0});
  return entry;
}

export type WidgetStage = {
  /** Where the frame waits; it leaves by being appended elsewhere. */
  container: HTMLElement,
  /**
   * Makes the copy hit-testable for one synchronous call (a widget's `elementFromPoint` while it runs here): shown,
   * unclipped and on top; returns what puts it back. No frame is painted, nor input taken, in between.
   */
  reveal: () => () => void,
  /** What `reachPoint` shifts for a point of the copy (the copy's column); none: the block's bubble, as for the picture. */
  mover?: HTMLElement,
  /** The copy of what the bubble draws over the block (`stageInChat`'s `overlay`), laid out where it will be. */
  overlay?: HTMLElement,
  dispose: () => void
};

/**
 * Makes the point (x, y) of a widget's frame (widget CSS px) hit-testable for one synchronous call (the widget's
 * `elementFromPoint`): where something else is topmost there — it is out of the viewport, under the topbar or the
 * input field — `mover`, the frame's bubble or its staged copy, is shifted so that the point lands in the middle of
 * what its scrolling container shows, over the rest of the chat; returns what puts it back. No frame is painted, nor
 * input taken, in between.
 */
export function reachPoint(frame: HTMLElement, x: number, y: number, mover: HTMLElement): () => void {
  const doc = frame.ownerDocument;
  const view = doc.defaultView;
  const rect = frame.getBoundingClientRect();
  // the chat's own transforms (its opening animation) scale the frame
  const scale = frame.offsetWidth ? rect.width / frame.offsetWidth : 1;
  const px = rect.left + x * scale, py = rect.top + y * scale;
  const inView = px >= 0 && py >= 0 && px < view.innerWidth && py < view.innerHeight;
  if(inView && doc.elementFromPoint(px, py) === frame) return noop;

  const area = (mover.closest('.scrollable') ?? doc.documentElement).getBoundingClientRect();
  const top = Math.max(area.top, 0), bottom = Math.min(area.bottom, view.innerHeight);
  const left = Math.max(area.left, 0), right = Math.min(area.right, view.innerWidth);
  const dx = px < left || px >= right ? (left + right) / 2 - px : 0;
  const dy = (top + bottom) / 2 - py;
  const style = mover.style.cssText;
  // `translate` composes with a transform the bubble has
  mover.style.translate = `${dx}px ${dy}px`;
  mover.style.zIndex = '2147483647';
  if(view.getComputedStyle(mover).position === 'static') mover.style.position = 'relative';
  return () => mover.style.cssText = style;
}

const REVEALED = 'pointer-events:auto;overflow:visible;contain:none;clip-path:none;z-index:2147483647;';

/**
 * `copy`: the copy, inert (out of hit testing and focus) but for the call; `layer`: what holds it under everything,
 * clipped; `clipping`: an ancestor that clips it too (the block it waits in). Other copies in the layer stay inert.
 */
function revealer(copy: HTMLElement, layer: HTMLElement, clipping?: HTMLElement) {
  return () => {
    const style = layer.style.cssText;
    const overflow = clipping?.style.overflow;
    layer.style.cssText = style + REVEALED;
    copy.inert = false;
    if(clipping) clipping.style.overflow = 'visible';
    return () => {
      layer.style.cssText = style;
      copy.inert = true;
      if(clipping) clipping.style.overflow = overflow;
    };
  };
}

/**
 * Stages a frame for the widget block `block`, which is inside its bubble while the bubble is not in the chat;
 * undefined where there is nothing to copy (no bubble, no chat), or the start is let go (`cancelled`) before the chat's
 * scrollable has a width — one taken out of the page never reports it. `overlay`, what the bubble draws over the block
 * (the message's time over its corner), is copied whole into the copy of its parent, so that it can be measured there.
 */
export async function stageInChat(
  chat: Chat,
  block: HTMLElement,
  overlay?: HTMLElement,
  cancelled?: Promise<void>
): Promise<WidgetStage | undefined> {
  const bubble = block.closest('.bubble');
  if(!bubble || !chat?.bubbles?.container) return;
  const entry = getLayer(chat);
  ++entry.users;
  // the last copy gone takes the layer and its observer with it
  const release = () => {
    if(--entry.users || layers.get(chat) !== entry) return;
    entry.observer.disconnect();
    entry.layer.remove();
    layers.delete(chat);
  };
  const sized = await Promise.race([entry.sized.then(() => true), ...(cancelled ? [cancelled.then(() => false)] : [])]);
  if(!sized) {
    release();
    return;
  }

  // every copy at the top of the layer, over the others: each is where the chat shows bubbles when it hit-tests
  const column = document.createElement('div');
  column.className = chat.bubbles.chatInner.className;
  column.style.cssText = 'position:absolute;top:0;left:0;right:0;min-height:0;transform:none;transition:none;';
  column.inert = true;
  const dateGroup = document.createElement('div');
  dateGroup.className = 'bubbles-date-group';
  const group = document.createElement('div');
  group.className = 'bubbles-group';
  column.append(dateGroup);
  dateGroup.append(group);

  const path: HTMLElement[] = [];
  for(let node: HTMLElement = block; node; node = node === bubble ? null : node.parentElement) path.unshift(node);
  let parent: HTMLElement = group;
  const copies = new Map<Element, HTMLElement>();
  for(const node of path) {
    const copy = shallowCopy(node as HTMLElement);
    parent.append(copy);
    copies.set(node, parent = copy);
  }

  // after the block's chain, as the bubble has it (the time comes last in its content)
  const overlayParent = overlay && copies.get(overlay.parentElement);
  const overlayCopy = overlayParent?.appendChild(overlay.cloneNode(true) as HTMLElement);

  entry.layer.append(column);
  return {
    container: parent,
    reveal: revealer(column, entry.layer),
    mover: column,
    overlay: overlayCopy,
    dispose: () => {
      column.remove();
      release();
    }
  };
}

/**
 * Stages a frame inside the block itself (a widget starting again where its picture is): hidden over it, at its size
 * (a height the bot declared is the block's).
 */
export function stageInBlock(block: HTMLElement): WidgetStage {
  const container = document.createElement('div');
  // clipped away whole, at the block's size
  container.style.cssText = 'position:absolute;inset:0;clip-path:inset(50%);pointer-events:none;';
  container.inert = true;
  container.setAttribute('aria-hidden', 'true');
  block.append(container);
  return {container, reveal: revealer(container, container, block), dispose: () => container.remove()};
}
