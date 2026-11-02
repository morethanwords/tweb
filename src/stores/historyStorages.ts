import type {HistoryStorage, HistoryStorageKey} from '@appManagers/appMessagesManager';
import {onCleanup} from 'solid-js';
import {createStore} from 'solid-js/store';
import createHistoryStorage from '@appManagers/utils/messages/createHistoryStorage';
import {holdCount, releaseCount} from '@helpers/holdCount';
import {MOUNT_CLASS_TO} from '@config/debug';

type S = ReturnType<typeof createStore<HistoryStorage>>;

const cache: {
  [key in HistoryStorageKey]: S
} = {};

/**
 * How many hold the storage of a key (`useHistoryStorage`, for as long as their root lives: an open chat). The worker
 * deleting its storage - a history cleared, a channel reloaded - empties a held one in place (`apiManagerProxy`) and
 * leaves it here: the next updates of the key go to the very storage its holders read. Dropped, they went to a new
 * one, and a chat kept reading the emptied one until it was opened again
 */
const held: Map<HistoryStorageKey, number> = new Map();

export default function useHistoryStorage(key: HistoryStorageKey) {
  if(!key) return;
  const storage = _useHistoryStorage(key)[0];
  holdCount(held, key);
  // * by the key it has by then: a storage is renamed in place
  onCleanup(() => releaseCount(held, storage.key));

  return storage;
}

export function _useHistoryStorage(key: HistoryStorageKey) {
  return cache[key] ??= createStore(createHistoryStorage(key));
}

export function _deleteHistoryStorage(key: HistoryStorageKey) {
  if(!held.has(key)) {
    delete cache[key];
  }
}

export function _changeHistoryStorageKey(key: HistoryStorageKey, newKey: HistoryStorageKey) {
  cache[newKey] = cache[key];
  delete cache[key];

  const count = held.get(key);
  if(count) {
    held.delete(key);
    held.set(newKey, (held.get(newKey) || 0) + count);
  }
}

export function _iterateHistoryStorages(callback: (key: HistoryStorageKey, value: S) => void) {
  for(const i in cache) {
    callback(i as HistoryStorageKey, cache[i as HistoryStorageKey]);
  }
}

MOUNT_CLASS_TO && (MOUNT_CLASS_TO.historyStorages = cache);
