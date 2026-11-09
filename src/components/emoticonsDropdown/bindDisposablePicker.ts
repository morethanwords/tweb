import type {EmoticonsDropdown} from '@components/emoticonsDropdown';
import createFocusTrap from '@helpers/dom/focusTrap';

/**
 * A picker opened for one choice: with the keyboard layer it holds the focus while open (over any trap
 * around its opener) and gives it back to `returnFocusTo`, or to where it was, as it closes; once closed
 * it is destroyed. `onClose` runs as it starts closing, `onClosed` before it is destroyed.
 */
export default function bindDisposablePicker(dropdown: EmoticonsDropdown, options: {
  returnFocusTo?: HTMLElement,
  onClose?: () => void,
  onClosed?: () => void
} = {}) {
  const focusTrap = createFocusTrap(dropdown.getElement());
  dropdown.addEventListener('opened', () => focusTrap.activate(options.returnFocusTo), {once: true});
  dropdown.addEventListener('close', () => {
    options.onClose?.();
    focusTrap.deactivate();
  });
  dropdown.addEventListener('closed', () => {
    options.onClosed?.();
    dropdown.hideAndDestroy();
  });
}
