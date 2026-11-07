/*
 * "I have already looked at this one" marks, and which of them the list is showing.
 *
 * Going through 200+ stories takes more than one sitting, and the sandbox is reloaded constantly
 * while iterating — so both the marks and the filter over them live in localStorage under keys of
 * the sandbox's own, next to the theme. They are a reviewer's scratch pad: nothing else reads them.
 * Each sandbox (popups, widgets) keeps its own, under its own key.
 */

import {createSignal} from 'solid-js';
import {readStoredChoice, storeChoice} from '@helpers/storedChoice';

/** Which marks the list shows. Survives the reload an edit triggers, so a review pass is not restarted. */
export type StoryCheckedFilter = 'all' | 'unchecked' | 'checked';

export type CheckedStories = ReturnType<typeof createCheckedStories>;

/** `storageKey` holds the marks; the filter over them goes under `${storageKey}-filter`. */
export function createCheckedStories(storageKey: string) {
  const filterStorageKey = storageKey + '-filter';

  function read(): string[] {
    try {
      const stored = JSON.parse(localStorage.getItem(storageKey));
      return Array.isArray(stored) ? stored.filter((id) => typeof(id) === 'string') : [];
    } catch{
      return [];
    }
  }

  const [checkedIds, setCheckedIds] = createSignal(new Set(read()));
  const [filter, setFilterSignal] = createSignal(readStoredChoice<StoryCheckedFilter>(filterStorageKey, ['all', 'unchecked', 'checked'], 'all'));

  function write(ids: Set<string>) {
    setCheckedIds(ids);

    try {
      localStorage.setItem(storageKey, JSON.stringify([...ids]));
    } catch{}
  }

  const isChecked = (id: string) => checkedIds().has(id);

  return {
    isChecked,
    count: () => checkedIds().size,
    setChecked(id: string, checked: boolean) {
      const ids = new Set(checkedIds());
      checked ? ids.add(id) : ids.delete(id);
      write(ids);
    },
    clear: () => write(new Set()),
    filter,
    setFilter(value: StoryCheckedFilter) {
      setFilterSignal(value);
      storeChoice(filterStorageKey, value);
    },
    /** Whether a story belongs in the list as it is filtered right now. */
    matchesFilter(id: string) {
      const value = filter();
      return value === 'all' || isChecked(id) === (value === 'checked');
    }
  };
}
