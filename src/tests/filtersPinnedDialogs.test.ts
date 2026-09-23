import {describe, expect, it, vi} from 'vitest';
import FiltersStorage, {MyDialogFilter} from '@lib/storages/filters';

const FILTER_ID = 2;

/**
 * A folder and the storage around it, with the request it would send in our hands - the two
 * methods under test only need those, so the manager is not built, just worn.
 */
const makeStorage = (pinnedPeerIds: PeerId[], rejects?: boolean, pinLimit = 5) => {
  const filter = {
    id: FILTER_ID,
    pinned_peers: pinnedPeerIds.map((peerId) => ({_: 'inputPeerUser', user_id: peerId})),
    pinnedPeerIds: pinnedPeerIds.slice()
  } as any as MyDialogFilter;

  const updateDialogFilter = vi.fn(() => rejects ? Promise.reject(new Error('nope')) : Promise.resolve(filter));
  const dispatchEvent = vi.fn();

  const storage: any = Object.create(FiltersStorage.prototype);
  storage.filters = {[FILTER_ID]: filter};
  storage.rootScope = {dispatchEvent};
  storage.appPeersManager = {getInputPeerById: (peerId: PeerId) => ({_: 'inputPeerUser', user_id: peerId})};
  storage.updateDialogFilter = updateDialogFilter;
  storage.apiManager = {getLimit: () => Promise.resolve(pinLimit)};

  return {storage: storage as FiltersStorage, filter, updateDialogFilter, dispatchEvent};
};

/** The peer ids of both halves the folder keeps its pins in, which have to say the same thing */
const pinsOf = (filter: MyDialogFilter) => [
  filter.pinnedPeerIds,
  filter.pinned_peers.map((peer: any) => peer.user_id)
];

describe('FiltersStorage.reorderPinnedDialogs', () => {
  it('rewrites both halves of the folder in one edit', async() => {
    const {storage, filter, updateDialogFilter, dispatchEvent} = makeStorage([1, 2, 3]);

    await storage.reorderPinnedDialogs(FILTER_ID, [3, 1, 2]);

    expect(pinsOf(filter)).toEqual([[3, 1, 2], [3, 1, 2]]);
    expect(updateDialogFilter).toHaveBeenCalledTimes(1);
    // the list re-sorts off the event, without waiting for the round trip
    expect(dispatchEvent).toHaveBeenCalledWith('filter_update', filter);
  });

  it('does not send an order that is not about this folder any more', async() => {
    const {storage, filter, updateDialogFilter} = makeStorage([1, 2, 3]);

    // 4 was pinned when the drag started, and is not any more
    await expect(storage.reorderPinnedDialogs(FILTER_ID, [4, 1, 2])).rejects.toMatchObject({type: 'PINNED_DIALOGS_CHANGED'});
    await expect(storage.reorderPinnedDialogs(FILTER_ID + 100, [1, 2, 3])).rejects.toMatchObject({type: 'PINNED_DIALOGS_CHANGED'});

    expect(pinsOf(filter)).toEqual([[1, 2, 3], [1, 2, 3]]);
    expect(updateDialogFilter).not.toHaveBeenCalled();
  });

  it('puts the pins back when the folder does not take the edit', async() => {
    const {storage, filter, dispatchEvent} = makeStorage([1, 2, 3], true);

    await expect(storage.reorderPinnedDialogs(FILTER_ID, [3, 1, 2])).rejects.toThrow();

    expect(pinsOf(filter)).toEqual([[1, 2, 3], [1, 2, 3]]);
    // the list hears about the way back too
    expect(dispatchEvent).toHaveBeenCalledTimes(2);
  });
});

describe('FiltersStorage.toggleDialogsPin', () => {
  it('pins several chats above the ones the folder has, in one edit', async() => {
    const {storage, filter, updateDialogFilter} = makeStorage([3]);

    await storage.toggleDialogsPin(FILTER_ID, [1, 2], true);

    expect(pinsOf(filter)).toEqual([[1, 2, 3], [1, 2, 3]]);
    expect(updateDialogFilter).toHaveBeenCalledTimes(1);
  });

  it('moves a chat that is pinned already instead of pinning it twice', async() => {
    const {storage, filter} = makeStorage([1, 2, 3]);

    await storage.toggleDialogsPin(FILTER_ID, [3], true);

    expect(pinsOf(filter)).toEqual([[3, 1, 2], [3, 1, 2]]);
  });

  it('unpins several chats in one edit', async() => {
    const {storage, filter, updateDialogFilter} = makeStorage([1, 2, 3]);

    await storage.toggleDialogsPin(FILTER_ID, [1, 3], false);

    expect(pinsOf(filter)).toEqual([[2], [2]]);
    expect(updateDialogFilter).toHaveBeenCalledTimes(1);
  });

  it('puts the pins back when the folder does not take the edit', async() => {
    const {storage, filter} = makeStorage([3], true);

    await expect(storage.toggleDialogsPin(FILTER_ID, [1, 2], true)).rejects.toThrow();

    expect(pinsOf(filter)).toEqual([[3], [3]]);
  });

  it('pins all of them or none, against the pins the folder would end up with', async() => {
    const {storage, filter, updateDialogFilter} = makeStorage([3, 4], false, 3);

    await expect(storage.toggleDialogsPin(FILTER_ID, [1, 2], true)).rejects.toMatchObject({type: 'PINNED_DIALOGS_TOO_MUCH'});
    expect(pinsOf(filter)).toEqual([[3, 4], [3, 4]]);
    expect(updateDialogFilter).not.toHaveBeenCalled();

    // moving a pinned chat to the top adds no pin, so a full folder still takes it
    await storage.toggleDialogsPin(FILTER_ID, [4, 1], true);
    expect(pinsOf(filter)).toEqual([[4, 1, 3], [4, 1, 3]]);
  });
});

describe('FiltersStorage.toggleDialogPin', () => {
  it('pins a chat on top and unpins it again, as the one-chat case of toggleDialogsPin', async() => {
    const {storage, filter, dispatchEvent} = makeStorage([2]);

    await storage.toggleDialogPin(1, FILTER_ID);
    expect(pinsOf(filter)).toEqual([[1, 2], [1, 2]]);

    await storage.toggleDialogPin(1, FILTER_ID);
    expect(pinsOf(filter)).toEqual([[2], [2]]);
    // the list re-sorts off the event both times, without waiting for the round trip
    expect(dispatchEvent).toHaveBeenCalledTimes(2);
  });

  it('does not pin past the limit', async() => {
    const {storage, filter} = makeStorage([2], false, 1);

    await expect(storage.toggleDialogPin(1, FILTER_ID)).rejects.toMatchObject({type: 'PINNED_DIALOGS_TOO_MUCH'});
    expect(pinsOf(filter)).toEqual([[2], [2]]);
  });
});
