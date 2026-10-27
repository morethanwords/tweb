// * The editors open right now. Kept apart from the editor itself, which is loaded on demand: an account
// * switch closes them outright - they edit the previous account's media - without loading it.
const openEditors: Set<() => void> = new Set();

export function trackOpenMediaEditor(close: () => void) {
  openEditors.add(close);
  return () => openEditors.delete(close);
}

export function closeAllMediaEditors() {
  [...openEditors].forEach((close) => close());
}
