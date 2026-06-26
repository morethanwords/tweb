/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

// * What the message-input `keyup` listener needs to do for a given key press.
// * - 'skip': the key cannot change content nor move the caret (pure modifiers,
// *   locks, dead/IME-composition keys) — nothing to re-check, bail before any
// *   DOM walk.
// * - 'content-handled': the key changes content (typed char, Backspace, Delete,
// *   Enter, ...) — the `input` event already fired BEFORE this `keyup` and the
// *   input handler already re-parsed + called checkAutocomplete with the parsed
// *   value, so `keyup` re-doing it is pure redundant work (it would bail at the
// *   previousQuery guard anyway). Skip the re-walk.
// * - 'caret-move': the key can move the caret WITHOUT firing an `input` event
// *   (arrows, Home/End, PageUp/PageDown — including with a modifier held, e.g. Cmd/Option/
// *   Ctrl + arrow for line/word navigation) — no input handler ran, so `keyup` must re-check
// *   autocomplete (the query depends on caret position).
export type InputKeyupAction = 'skip' | 'content-handled' | 'caret-move';

// * keys that move the caret but never emit an `input` event
const CARET_MOVE_KEYS = new Set<string>([
  'ArrowLeft',
  'ArrowRight',
  'ArrowUp',
  'ArrowDown',
  'Home',
  'End',
  'PageUp',
  'PageDown'
]);

// * single-char content keys handled here for completeness; the length-based
// * branch below already covers every printable character (e.key is the char)
const CONTENT_EDIT_KEYS = new Set<string>([
  'Backspace',
  'Delete',
  'Enter'
]);

export default function classifyInputKeyup(e: Pick<KeyboardEvent, 'key' | 'ctrlKey' | 'metaKey' | 'altKey'>): InputKeyupAction {
  const key = e.key;

  // * caret-navigation keys move the caret WITHOUT firing an `input` event, so keyup is the
  // * only chance to re-check autocomplete — and this holds even with a modifier held: Cmd+←/→
  // * (macOS line start/end), Option+←/→ and Ctrl+←/→ (word jump) are caret moves, not text
  // * entry. So this MUST be checked before the modifier-combo guard below.
  if(CARET_MOVE_KEYS.has(key)) {
    return 'caret-move';
  }

  // * a modifier combo (Ctrl/Meta/Alt held) is a shortcut, not text entry; markdown
  // * shortcuts are applied in keydown and emit their own input event when they change
  // * content, so keyup has nothing extra to do
  if(e.ctrlKey || e.metaKey || e.altKey) {
    return 'skip';
  }

  // * printable characters report a single-codepoint e.key (e.g. 'a', '本', ':') — these
  // * always fire an `input` event, so the input handler already covered them
  if(key && Array.from(key).length === 1) {
    return 'content-handled';
  }

  if(CONTENT_EDIT_KEYS.has(key)) {
    return 'content-handled';
  }

  // * everything else (Shift, Control, Alt, Meta, CapsLock, Tab, Escape, F-keys,
  // * Dead, Process/IME composition keys, ...) changes neither content nor caret
  return 'skip';
}
