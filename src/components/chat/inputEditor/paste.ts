const proseMirrorPasteEvents = new WeakSet<Event>();

export function markProseMirrorPaste(event: Event) {
  proseMirrorPasteEvents.add(event);
}

export function isProseMirrorPaste(event: Event) {
  return proseMirrorPasteEvents.has(event);
}
