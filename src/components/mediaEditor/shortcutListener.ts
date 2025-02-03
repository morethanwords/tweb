export function addShortcutListener(combos: string[], callback: (combo: string) => void) {
  const listener = (event: KeyboardEvent) => {
    const pairs = combos
    .map((combo) => [combo, combo.toLowerCase().split('+')] as const)
    .sort((a, b) => b[1].length - a[1].length);

    for(const [combo, keys] of pairs) {
      const isComboMatched = keys.every((key) => {
        return (
          (key === 'ctrl' && event.ctrlKey) ||
          (key === 'shift' && event.shiftKey) ||
          (key === 'alt' && event.altKey) ||
          (key === 'meta' && event.metaKey) ||
          (key === 'anymeta' && (event.ctrlKey || event.shiftKey || event.altKey || event.metaKey)) ||
          event.key.toLowerCase() === key
        );
      });

      if(isComboMatched) {
        event.preventDefault();
        callback(combo);
        break;
      }
    }
  };
  document.addEventListener('keydown', listener);

  return () => document.removeEventListener('keydown', listener);
}
