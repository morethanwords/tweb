import {createRoot} from 'solid-js';
import useHistoryStorage, {_changeHistoryStorageKey, _deleteHistoryStorage, _useHistoryStorage} from '@stores/historyStorages';
import type {HistoryStorageKey} from '@appManagers/appMessagesManager';

/**
 * A chat reads its history from the tab's mirror of the worker's storage (`useHistoryStorage`, held for as long as the
 * chat shows it). The worker deletes the storage when the history is cleared or a channel is reloaded, and the mirror
 * dropped the tab's copy with it: the updates after that (a read receipt, the newest message) made a copy of their own,
 * which the open chat - still holding the dropped one - never saw. Its messages sent after "Clear history" never got
 * read, and the chat's newest message stayed unknown, until it was opened again.
 */

let id = 0;
const makeKey = () => `history_${++id}` as HistoryStorageKey;

// * as the chat holds it: in a root, until the root is disposed
function hold(key: HistoryStorageKey) {
  return createRoot((dispose) => ({storage: useHistoryStorage(key), dispose}));
}

// * as the mirror writes an update of the worker's storage
function update(key: HistoryStorageKey, readOutboxMaxId: number) {
  _useHistoryStorage(key)[1]('readOutboxMaxId', readOutboxMaxId);
}

test('a storage held stays the one the updates of its key go to after the worker deleted it', () => {
  const key = makeKey();
  const {storage, dispose} = hold(key);
  update(key, 5);

  _deleteHistoryStorage(key);
  update(key, 7);
  expect(storage.readOutboxMaxId).toBe(7);
  dispose();
});

test('a storage nobody holds is dropped when the worker deletes it', () => {
  const key = makeKey();
  const [before] = _useHistoryStorage(key);

  _deleteHistoryStorage(key);
  expect(_useHistoryStorage(key)[0]).not.toBe(before);
});

test('let go of, it is dropped again; held twice, it stays until both let go', () => {
  const key = makeKey();
  const first = hold(key);
  const second = hold(key);

  first.dispose();
  _deleteHistoryStorage(key);
  expect(_useHistoryStorage(key)[0]).toBe(second.storage);

  second.dispose();
  _deleteHistoryStorage(key);
  expect(_useHistoryStorage(key)[0]).not.toBe(second.storage);
});

test('a storage held keeps being held under the key it is given', () => {
  const key = makeKey(), newKey = makeKey();
  const {storage, dispose} = hold(key);

  // * as the mirror renames it
  _changeHistoryStorageKey(key, newKey);
  _useHistoryStorage(newKey)[1]('key', newKey);

  _deleteHistoryStorage(newKey);
  update(newKey, 9);
  expect(storage.readOutboxMaxId).toBe(9);

  dispose();
  _deleteHistoryStorage(newKey);
  expect(_useHistoryStorage(newKey)[0]).not.toBe(storage);
});
