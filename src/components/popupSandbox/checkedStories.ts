/*
 * "I have already looked at this one" marks, and which of them the list is showing.
 *
 * Going through 200+ stories takes more than one sitting, and the sandbox is reloaded constantly
 * while iterating — so both the marks and the filter over them live in localStorage under keys of
 * the sandbox's own, next to the theme. They are a reviewer's scratch pad: nothing else reads them.
 */

import {createSignal} from 'solid-js';

const STORAGE_KEY = 'popup-sandbox-checked';
const FILTER_STORAGE_KEY = 'popup-sandbox-checked-filter';

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

/** Which marks the list shows. Survives the reload an edit triggers, so a review pass is not restarted. */
export type StoryCheckedFilter = 'all' | 'unchecked' | 'checked';

function readFilter(): StoryCheckedFilter {
  try {
    const stored = localStorage.getItem(FILTER_STORAGE_KEY);
    if(stored === 'checked' || stored === 'unchecked') return stored;
  } catch{}

  return 'all';
}

const [checkedFilter, setCheckedFilterSignal] = createSignal<StoryCheckedFilter>(readFilter());

export {checkedFilter};

export function setCheckedFilter(filter: StoryCheckedFilter) {
  setCheckedFilterSignal(filter);

  try {
    localStorage.setItem(FILTER_STORAGE_KEY, filter);
  } catch{}
}

/** Whether a story belongs in the list as it is filtered right now. */
export function matchesCheckedFilter(id: string) {
  const filter = checkedFilter();
  return filter === 'all' || isStoryChecked(id) === (filter === 'checked');
}
