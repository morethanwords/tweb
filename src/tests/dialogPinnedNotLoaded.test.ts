import {createDialogsStorage} from '@/tests/helpers/dialogsStorage';

/*
 * A chat pinned on another device that this one has not loaded yet (an old chat, past the loaded part of
 * the list) is asked for, to take its pinned place: the pin is the news of it. It used to be dropped with
 * a TypeError before the dialog was asked for, and the chat stayed out of the pinned ones until a reload.
 * For Saved Messages, the subdialog of the pinned peer is the one asked for (scheduleHandleNewDialogs with
 * its saved peer id: handleNewDialogs fetches that, not the account's own conversation).
 */

const MY_ID = 1, PEER_ID = 42;

type PinUpdate = 'updateDialogPinned' | 'updateSavedDialogPinned';

/** A storage with nothing loaded; a test that needs a dialog at hand replaces getDialogOnly / getAnyDialog */
function createStorage() {
  const scheduleHandleNewDialogs = vi.fn();
  const storage: any = createDialogsStorage({
    appMessagesManager: {scheduleHandleNewDialogs},
    appPeersManager: {peerId: MY_ID}
  });
  storage.getDialogOnly = (): any => undefined;
  storage.getAnyDialog = (): any => undefined;
  return {storage, scheduleHandleNewDialogs};
}

function pin(storage: any, _: PinUpdate, peerId: number, pinned = true) {
  return storage.onUpdateDialogPinned({
    _,
    pFlags: {pinned: pinned || undefined},
    peer: {_: 'dialogPeer', peer: {_: 'peerUser', user_id: peerId}}
  });
}

describe('a chat pinned elsewhere and not loaded here', () => {
  test('is asked for, for a pin of the chat list and for one of Saved Messages', () => {
    const {storage, scheduleHandleNewDialogs} = createStorage();

    for(const _ of ['updateDialogPinned', 'updateSavedDialogPinned'] as const) {
      expect(() => pin(storage, _, PEER_ID)).not.toThrow();
    }

    expect(scheduleHandleNewDialogs.mock.calls).toEqual([
      // * the conversation of the pinned peer
      [PEER_ID, undefined],
      // * the pinned peer's subdialog of Saved Messages
      [MY_ID, PEER_ID]
    ]);
  });

  test('takes its pin in Saved Messages\' order before it is asked for, and gives it back when unpinned', () => {
    // * the subdialog is rebuilt with the pin the order has (getSavedDialogById)
    const {storage} = createStorage();

    storage.getPinnedOrders(MY_ID).push(7);
    pin(storage, 'updateSavedDialogPinned', PEER_ID);
    expect(storage.getPinnedOrders(MY_ID)).toEqual([PEER_ID, 7]);
    pin(storage, 'updateSavedDialogPinned', PEER_ID, false);
    expect(storage.getPinnedOrders(MY_ID)).toEqual([7]);
  });

  test('keeps pins of one batch in the order they came, loaded or not', () => {
    const LOADED = 7;
    const {storage} = createStorage();
    // * a loaded dialog takes its place in the order only when it is indexed, after the batch
    const loaded = {_: 'savedDialog', peerId: MY_ID, savedPeerId: LOADED, pFlags: {}};
    storage.getAnyDialog = (_peerId: PeerId, savedPeerId: PeerId): any => savedPeerId === LOADED ? loaded : undefined;
    storage.getDialogOnly = (peerId: PeerId): any => peerId === LOADED ? {...loaded, _: 'dialog', peerId: LOADED} : undefined;
    storage.generateIndexForDialog = () => {};

    pin(storage, 'updateSavedDialogPinned', LOADED);
    pin(storage, 'updateSavedDialogPinned', PEER_ID);
    expect(storage.getPinnedOrders(MY_ID)).toEqual([PEER_ID, LOADED]);

    pin(storage, 'updateDialogPinned', PEER_ID);
    pin(storage, 'updateDialogPinned', LOADED);
    expect(storage.getPinnedOrders(0)).toEqual([LOADED, PEER_ID]);
  });
});
