import {describe, expect, it, vi} from 'vitest';
import FiltersStorage, {MyDialogFilter} from '@lib/storages/filters';
import makeDialogFilter, {inputPeerUser} from '@/tests/helpers/dialogFilter';

/*
 * A folder keeps its pinned chats among the chats it includes (`include_peers` / `includePeerIds` start with
 * them), which is how its chat list finds them. What it sends to the server lists each chat once: the pinned
 * ones in `pinned_peers` only, as tdesktop's ChatFilter::tl does - and the folder kept here stays as it is
 * while the edit is on its way, and whether it is taken or not.
 */

const FILTER_ID = 2;

/** a folder with chats 1 and 2 pinned and 3 included, as saveDialogFilter keeps it */
function makeStorage(rejects?: boolean) {
  const filter: MyDialogFilter = makeDialogFilter(FILTER_ID, 2, {
    pinned_peers: [1, 2].map(inputPeerUser),
    include_peers: [1, 2, 3].map(inputPeerUser),
    pinnedPeerIds: [1, 2],
    includePeerIds: [1, 2, 3]
  });

  const invokeApi = vi.fn((_method: string, _params: any) => rejects ? Promise.reject(new Error('nope')) : Promise.resolve(true));
  const storage: any = Object.create(FiltersStorage.prototype);
  storage.filters = {[FILTER_ID]: filter};
  storage.apiManager = {invokeApi};
  // * what a taken edit goes on to: only the arrays are looked at here
  storage.onUpdateDialogFilter = vi.fn();

  return {storage: storage as FiltersStorage, filter, invokeApi};
}

const peerIdsOf = (peers: any[]) => peers.map((peer) => peer.user_id);

describe('FiltersStorage, a folder sent to the server', () => {
  it('lists its pinned chats as pinned only, not as included as well', () => {
    const {storage, filter} = makeStorage();
    const output = storage.getOutputDialogFilter(filter) as any;

    expect(peerIdsOf(output.pinned_peers)).toEqual([1, 2]);
    expect(peerIdsOf(output.include_peers)).toEqual([3]);
  });

  it('leaves the folder kept here as it is, while the edit is on its way and when it is not taken', async() => {
    const {storage, filter, invokeApi} = makeStorage(true);

    const sending = storage.updateDialogFilter(filter);
    expect(peerIdsOf(invokeApi.mock.calls[0][1].filter.include_peers)).toEqual([3]);
    expect(filter.includePeerIds).toEqual([1, 2, 3]);
    expect(peerIdsOf((filter as any).include_peers)).toEqual([1, 2, 3]);

    await expect(sending).rejects.toThrow();
    // * the pinned chats are still among the folder's, for its chat list to find them
    expect(filter.includePeerIds).toEqual([1, 2, 3]);
    expect(peerIdsOf((filter as any).include_peers)).toEqual([1, 2, 3]);
  });
});
