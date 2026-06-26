import {bindActiveWindowListener} from '@helpers/appWindow';

const positionKeyRegexp = /^key[a-zA-Z]$/i;

function matchNonMetaKey(event: KeyboardEvent, key: string) {
  if(positionKeyRegexp.test(key)) return event.code.toLowerCase() === key.toLowerCase();

  return event.key.toLowerCase() === key.toLowerCase();
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
