const PRESERVE_EDITOR_SELECTION_ATTRIBUTE = 'data-preserve-chat-input-editor-selection';

export function isEditorSelectionPreservingTarget(target: globalThis.Node | null) {
  return target instanceof Element && !!target.closest(
    `[${PRESERVE_EDITOR_SELECTION_ATTRIBUTE}]`
  );
}

export default function preserveEditorSelectionOnToolbarButton(button: HTMLButtonElement) {
  button.setAttribute(PRESERVE_EDITOR_SELECTION_ATTRIBUTE, '');
  button.addEventListener('mousedown', (event) => event.preventDefault(), {
    capture: true
  });
}
