import {getAppWindow} from '@helpers/appWindow';

type ComposedSelection = Selection & {
  getComposedRanges?: (options: {shadowRoots: ShadowRoot[]}) => StaticRange[]
};

/**
 * The text selected in an HTML widget inside `container` (a bubble), '' when none: all of it when it reaches into the
 * widget (from a caption above it too). A widget's text sits in its shadow root, of which the document's selection says
 * little — Chromium and WebKit report a range collapsed at the root's host, with the text in `toString()` — so the
 * widget's part is found by the selection's composed ranges. Where there are none (Chromium before 137, WebKit before
 * 17, or one that takes only the shadow roots as arguments), a selection whose range is collapsed at the host and yet
 * has text is the shadow root's, and one with an end at the host goes into it; Firefox's range is in the root itself.
 */
export function getWidgetSelectedText(container: Element) {
  const selection = getAppWindow().getSelection() as ComposedSelection;
  const text = selection?.rangeCount ? selection.toString() : '';
  if(!text) return '';
  for(const host of container.querySelectorAll('.widget-shadow')) {
    const root = host.shadowRoot;
    if(!root) continue;
    let composed: AbstractRange;
    try {
      composed = selection.getComposedRanges?.({shadowRoots: [root]})[0];
    } catch{}

    if(composed) {
      if(!composed.collapsed && reachesWidget(composed, host, root)) return text;
      continue;
    }

    const range = selection.getRangeAt(0);
    if(range.collapsed ? isAtNode(range.startContainer, range.startOffset, host) : reachesWidget(range, host, root)) {
      return text;
    }
  }

  return '';
}

/** `range` reaches into the widget of `host`: an end in its root or at the host, or the host within it. */
function reachesWidget(range: AbstractRange, host: Element, root: ShadowRoot) {
  const {startContainer, startOffset, endContainer, endOffset} = range;
  if(root.contains(startContainer) || root.contains(endContainer)) return true;
  if(isAtNode(startContainer, startOffset, host) || isAtNode(endContainer, endOffset, host)) return true;
  // * both ends in the page's tree
  const live = host.ownerDocument.createRange();
  live.setStart(startContainer, startOffset);
  live.setEnd(endContainer, endOffset);
  return live.intersectsNode(host);
}

/** The point (`container`, `offset`) is at `node`: just before it, inside it or just after it. */
function isAtNode(container: Node, offset: number, node: Node) {
  const around = node.ownerDocument.createRange();
  around.selectNode(node);
  return around.isPointInRange(container, offset);
}
