import {NodeSelection} from '@tiptap/pm/state';
import type {EditorView} from '@tiptap/pm/view';

type VerticalRect = {
  bottom: number,
  top: number
};

export function getVerticalVisibilityAdjustment(
  target: VerticalRect,
  viewport: VerticalRect
) {
  if(target.bottom - target.top > viewport.bottom - viewport.top) {
    return target.top - viewport.top;
  }
  if(target.top < viewport.top) return target.top - viewport.top;
  if(target.bottom > viewport.bottom) return target.bottom - viewport.bottom;
  return 0;
}

function getSelectionRect(view: EditorView): VerticalRect | undefined {
  const {selection} = view.state;
  if(selection instanceof NodeSelection) {
    const node = view.nodeDOM(selection.from);
    if(node?.nodeType === Node.ELEMENT_NODE) {
      return (node as Element).getBoundingClientRect();
    }
  }

  try {
    const rect = view.coordsAtPos(selection.head, 1);
    if(rect.top !== 0 || rect.bottom !== 0) return rect;
  } catch{
    // Fall through to the textblock DOM. Empty ProseMirror textblocks can
    // have no native caret rectangle even though their placeholder is visible.
  }

  const {$from, empty} = selection;
  if(!empty || $from.depth < 1 || !$from.parent.isTextblock) return;
  const node = view.nodeDOM($from.before($from.depth));
  if(node?.nodeType !== Node.ELEMENT_NODE) return;
  const rect = (node as Element).getBoundingClientRect();
  return rect.top !== 0 || rect.bottom !== 0 ? rect : undefined;
}

/**
 * Keeps the editor selection between the expanded composer's overlay toolbars.
 * Returning false lets ProseMirror retain its regular horizontal and ancestor
 * scrolling after this editor-local vertical correction.
 */
export default function keepChatInputSelectionVisible(
  view: EditorView,
  explicitTarget?: Element
) {
  const scroller = view.dom as HTMLElement;
  const wrapper = scroller.closest<HTMLElement>('.new-message-wrapper.is-expanded');
  if(!wrapper || scroller.scrollHeight <= scroller.clientHeight) return false;

  const target = explicitTarget?.getBoundingClientRect() || getSelectionRect(view);
  if(!target || target.top === 0 && target.bottom === 0) return false;

  const scrollerRect = scroller.getBoundingClientRect();
  const style = scroller.ownerDocument.defaultView.getComputedStyle(scroller);
  const topToolbar = wrapper.querySelector<HTMLElement>(
    '.message-input-editor-toolbar-top'
  );
  const bottomToolbar = wrapper.querySelector<HTMLElement>(
    '.message-input-editor-toolbar-bottom'
  );
  const topToolbarRect = topToolbar?.getBoundingClientRect();
  const bottomToolbarRect = bottomToolbar?.getBoundingClientRect();
  const viewport = {
    top: Math.max(
      scrollerRect.top + (parseFloat(style.paddingTop) || 0),
      topToolbarRect?.bottom || scrollerRect.top
    ),
    bottom: Math.min(
      scrollerRect.bottom - (parseFloat(style.paddingBottom) || 0),
      bottomToolbarRect?.top || scrollerRect.bottom
    )
  };
  if(viewport.bottom <= viewport.top) return false;

  const adjustment = getVerticalVisibilityAdjustment(target, viewport);
  if(adjustment) scroller.scrollTop += adjustment;
  return !!explicitTarget;
}
