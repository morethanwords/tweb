import type {HistoryStorage, HistoryStorageKey} from '@appManagers/appMessagesManager';
import {createStore} from 'solid-js/store';
import createHistoryStorage from '@appManagers/utils/messages/createHistoryStorage';
import {MOUNT_CLASS_TO} from '@config/debug';

type S = ReturnType<typeof createStore<HistoryStorage>>;

const cache: {
  [key in HistoryStorageKey]: S
} = {};

export default function useHistoryStorage(key: HistoryStorageKey) {
  if(!key) return;
  return _useHistoryStorage(key)[0];
}

export function _useHistoryStorage(key: HistoryStorageKey) {
  return cache[key] ??= createStore(createHistoryStorage(key));
}

export function _deleteHistoryStorage(key: HistoryStorageKey) {
  delete cache[key];
}

export function _changeHistoryStorageKey(key: HistoryStorageKey, newKey: HistoryStorageKey) {
  cache[newKey] = cache[key];
  delete cache[key];
}

export function _iterateHistoryStorages(callback: (key: HistoryStorageKey, value: S) => void) {
  for(const i in cache) {
    callback(i as HistoryStorageKey, cache[i as HistoryStorageKey]);
  }
}

MOUNT_CLASS_TO && (MOUNT_CLASS_TO.historyStorages = cache);
