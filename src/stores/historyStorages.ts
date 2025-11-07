import type {HistoryStorage, HistoryStorageKey} from '../lib/appManagers/appMessagesManager';
import {createStore} from 'solid-js/store';
import createHistoryStorage from '../lib/appManagers/utils/messages/createHistoryStorage';
import {MOUNT_CLASS_TO} from '../config/debug';

const cache: {
  [key in HistoryStorageKey]: ReturnType<typeof createStore<HistoryStorage>>
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

MOUNT_CLASS_TO && (MOUNT_CLASS_TO.historyStorages = cache);
