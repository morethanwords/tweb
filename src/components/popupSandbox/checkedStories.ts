/*
 * "I have already looked at this one" marks.
 *
 * Going through 200+ stories takes more than one sitting, and the sandbox is reloaded constantly
 * while iterating — so the marks live in localStorage under a key of the sandbox's own, next to
 * the theme. They are a reviewer's scratch pad: nothing else reads them.
 */

import {createSignal} from 'solid-js';

const STORAGE_KEY = 'popup-sandbox-checked';

function read(): string[] {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY));
    return Array.isArray(stored) ? stored.filter((id) => typeof(id) === 'string') : [];
  } catch{
    return [];
  }
}

const [checkedIds, setCheckedIds] = createSignal(new Set(read()));

function write(ids: Set<string>) {
  setCheckedIds(ids);

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...ids]));
  } catch{}
}

export function isStoryChecked(id: string) {
  return checkedIds().has(id);
}

export function checkedStoriesCount() {
  return checkedIds().size;
}

export function setStoryChecked(id: string, checked: boolean) {
  const ids = new Set(checkedIds());
  checked ? ids.add(id) : ids.delete(id);
  write(ids);
}

export function clearCheckedStories() {
  write(new Set());
}
