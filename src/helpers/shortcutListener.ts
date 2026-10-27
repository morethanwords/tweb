import {bindActiveWindowListener} from '@helpers/appWindow';
import {IS_APPLE} from '@environment/userAgent';

const positionKeyRegexp = /^key[a-zA-Z]$/i;
const latinLetterRegexp = /^[a-z]$/i;
const nonLatinLetterRegexp = /^(?!\p{Script=Latin})\p{L}$/u;

function matchNonMetaKey(event: KeyboardEvent, key: string) {
  if(positionKeyRegexp.test(key)) return event.code.toLowerCase() === key.toLowerCase();

  if(event.key.toLowerCase() === key.toLowerCase()) return true;

  // * a non-Latin layout (Cyrillic, Greek, Hebrew…) types its own letter: Ctrl+F gives 'а' on a Russian one,
  // * so the letter is read from the key's place, as the browser's own shortcuts do. A Latin layout
  // * (Dvorak, AZERTY) keeps matching by the letter it types, and a letter that AltGr or the Mac's Option
  // * typed is text being entered, not a shortcut
  return latinLetterRegexp.test(key) &&
    nonLatinLetterRegexp.test(event.key) &&
    !event.getModifierState('AltGraph') &&
    !(IS_APPLE && event.altKey) &&
    event.code.toLowerCase() === 'key' + key.toLowerCase();
}

function matchComboKey(event: KeyboardEvent, key: string) {
  return (
    (key === 'ctrl' && event.ctrlKey) ||
    (key === 'shift' && event.shiftKey) ||
    (key === 'alt' && event.altKey) ||
    (key === 'meta' && event.metaKey) ||
    (key === 'anymeta' && (event.ctrlKey || event.shiftKey || event.altKey || event.metaKey)) ||
    matchNonMetaKey(event, key)
  );
}

export function addShortcutListener(combos: string[], callback: (combo: string, event: KeyboardEvent) => void, preventByDefault = true) {
  const listener = (event: KeyboardEvent) => {
    const pairs = combos
    .map((combo) => [combo, combo.toLowerCase().split('+')] as const)
    .sort((a, b) => b[1].length - a[1].length);

    for(const [combo, keys] of pairs) {
      const isComboMatched = keys.every((key) => matchComboKey(event, key));

      if(isComboMatched) {
        preventByDefault && event.preventDefault();
        callback(combo, event);
        break;
      }
    }
  };

  // Follow the active app window so shortcuts keep firing when the client is popped into a Document
  // PiP window (its key events fire on the PiP document, not the tab's).
  return bindActiveWindowListener((w) => w.document, 'keydown', listener);
}
