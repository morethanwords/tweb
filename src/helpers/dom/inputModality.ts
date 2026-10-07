import {bindActiveWindowListener} from '@helpers/appWindow';

let lastInputWasPointer = false;

// Capture phase, so a handler that stops the event cannot hide it from here.
bindActiveWindowListener((win) => win.document, 'pointerdown', (e) => {
  if(e.isTrusted) lastInputWasPointer = true;
}, true);
bindActiveWindowListener((win) => win.document, 'keydown', (e) => {
  if(e.isTrusted) lastInputWasPointer = false;
}, true);

/**
 * Whether the user's latest input was a pointer (mouse, pen, touch) rather than a key.
 *
 * Ask it when something OPENS: the browser rings whatever a script focuses after any key press —
 * the very Escape that closes a menu included — so by the time it closes, focus handed back to the
 * opener would ring for someone who only ever used the mouse.
 */
export default function isLastInputPointer() {
  return lastInputWasPointer;
}
