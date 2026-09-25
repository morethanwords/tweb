import preserveEditorSelectionOnToolbarButton, {
  isEditorSelectionPreservingTarget
} from '@components/chat/inputEditor/toolbarButton';

describe('chat input editor toolbar button', () => {
  test('cancels mousedown before the button handler without swallowing it', () => {
    const button = document.createElement('button');
    preserveEditorSelectionOnToolbarButton(button);
    const handler = vi.fn((event: MouseEvent) => {
      expect(event.defaultPrevented).toBe(true);
    });
    button.addEventListener('mousedown', handler);

    const event = new MouseEvent('mousedown', {
      bubbles: true,
      cancelable: true
    });
    expect(button.dispatchEvent(event)).toBe(false);
    expect(handler).toHaveBeenCalledOnce();
  });

  test('marks the button and its contents as selection-preserving targets', () => {
    const button = document.createElement('button');
    const icon = document.createElement('span');
    button.append(icon);
    preserveEditorSelectionOnToolbarButton(button);

    expect(isEditorSelectionPreservingTarget(button)).toBe(true);
    expect(isEditorSelectionPreservingTarget(icon)).toBe(true);
    expect(isEditorSelectionPreservingTarget(document.body)).toBe(false);
  });
});
