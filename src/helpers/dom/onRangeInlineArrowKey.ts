import getInlineArrowKeys from '@helpers/dom/getInlineArrowKeys';
import {isElementRTL} from '@helpers/dom/isDocumentRTL';

/**
 * The horizontal arrows on a value slider (`<input type="range">`) go toward its end and its start:
 * ArrowLeft raises a right-to-left one. Chromium and Firefox step such a range by its direction,
 * WebKit by the keys' sides, so a right-to-left range is stepped here, the same in every engine.
 */
export default function onRangeInlineArrowKey(event: KeyboardEvent) {
  const input = event.currentTarget as HTMLInputElement;
  if(
    (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') ||
    event.altKey || event.ctrlKey || event.metaKey || event.shiftKey ||
    !isElementRTL(input)
  ) {
    return;
  }

  event.preventDefault();
  const value = input.value;
  try {
    if(event.key === getInlineArrowKeys(true).next) input.stepUp();
    else input.stepDown();
  } catch{ // * `step="any"` has no step to take
    return;
  }

  if(input.value === value) return;
  input.dispatchEvent(new Event('input', {bubbles: true}));
  input.dispatchEvent(new Event('change', {bubbles: true}));
}
