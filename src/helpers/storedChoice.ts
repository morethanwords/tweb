/*
 * A choice kept in localStorage across reloads: a debug switch, a sandbox's view or filter. Storage may be out of reach
 * (a private window, blocked site data, a full quota): a read gives the fallback then, and a write is skipped.
 */

/** What is stored under `key` if it is one of `values`, else `fallback`. */
export function readStoredChoice<T extends string>(key: string, values: readonly T[], fallback?: T): T {
  try {
    const value = localStorage.getItem(key) as T;
    return values.includes(value) ? value : fallback;
  } catch{
    return fallback;
  }
}

/** What is stored under `key`, whatever it is (a filter typed into a search), else `fallback`. */
export function readStoredText(key: string, fallback = '') {
  try {
    return localStorage.getItem(key) ?? fallback;
  } catch{
    return fallback;
  }
}

/** Keeps `value` under `key`. */
export function storeChoice(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch{}
}
