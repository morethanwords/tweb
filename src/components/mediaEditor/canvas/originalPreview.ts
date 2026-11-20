import type {MediaEditorContextValue} from '@components/mediaEditor/context';
import ListenerSetter from '@helpers/listenerSetter';

export function canPreviewOriginal(context: MediaEditorContextValue) {
  return !context.isEditingForAvatar && context.editorState.currentTab === 'adjustments';
}

/** Display-only: neither the document, its history nor final rendering reads this flag. */
export function attachOriginalPreview(element: HTMLElement, context: MediaEditorContextValue) {
  const listeners = new ListenerSetter();
  let pointerId: number;

  const reset = () => {
    const previous = pointerId;
    pointerId = undefined;
    context.editorState.previewOriginal = false;
    if(previous !== undefined && element.hasPointerCapture(previous)) element.releasePointerCapture(previous);
  };
  listeners.add(element)('pointerdown', (event: PointerEvent) => {
    if(!canPreviewOriginal(context) || event.button !== 0 || pointerId !== undefined || event.defaultPrevented) return;
    const target = event.target as Element;
    // Leave the filter's curves/blur gestures, layers and video controls alone.
    if(target.closest('button, input, [role="button"], [contenteditable="true"], svg, [aria-hidden="true"]')) return;
    pointerId = event.pointerId;
    element.setPointerCapture(pointerId);
    context.editorState.previewOriginal = true;
    event.preventDefault();
  });
  const finish = (event: PointerEvent) => {
    if(event.pointerId === pointerId) reset();
  };
  listeners.add(element)('pointerup', finish);
  listeners.add(element)('pointercancel', finish);
  listeners.add(element)('lostpointercapture', finish);
  listeners.add(element.ownerDocument.defaultView)('blur', reset);
  return {
    reset,
    dispose: () => {
      reset();
      listeners.removeAll();
    }
  };
}
