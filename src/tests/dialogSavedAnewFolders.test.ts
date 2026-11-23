import type {Dialog} from '@layer';
import {FOLDER_ID_ALL, FOLDER_ID_ARCHIVE} from '@appManagers/constants';
import makeDialogFilter from '@/tests/helpers/dialogFilter';
import {createAllChatsStorage, DIALOG_DATE} from '@/tests/helpers/dialogsStorage';

const UNREAD = 5;

// * a chat the list has comes again in an answer of the server - a page of the list, a reload of the chat - and it is
// * saved anew over the kept one: it is in the folders it fits now, and only in them, and counted as unread there only
describe('a chat saved anew', () => {
  const setup = () => {
    const chats = createAllChatsStorage();
    const {storage, order: peers} = chats;
    const folders: Record<number, ReturnType<typeof makeDialogFilter>> = {
      [FOLDER_ID_ALL]: makeDialogFilter(FOLDER_ID_ALL, FOLDER_ID_ALL),
      [FOLDER_ID_ARCHIVE]: makeDialogFilter(FOLDER_ID_ARCHIVE, FOLDER_ID_ARCHIVE),
      // * a folder of the unread chats
      2: makeDialogFilter(2, 4, {pFlags: {contacts: true, exclude_read: true}})
    };

    Object.assign((storage as any).filtersStorage, {
      getFilters: () => folders,
      getFilter: (filterId: number) => folders[filterId],
      testDialogForFilter: (dialog: Dialog.dialog, filter: typeof folders[number]) => {
        if(!filter) return true;
        if(filter.id === 2) return !dialog.folder_id && dialog.unread_count > 0;
        return (dialog.folder_id || FOLDER_ID_ALL) === filter.id;
      }
    });
    (storage as any).appMessagesManager.getDialogUnreadCount = (dialog: Dialog.dialog) => dialog.unread_count;

    const save = (userId: number, fields: Partial<Dialog.dialog>) => chats.save(userId, 1, DIALOG_DATE + userId, {fields});
    const unread = (folderId: number) => [...storage.getFolder(folderId).unreadPeerIds].map(Number);

    save(100, {unread_count: UNREAD});
    save(200, {});
    expect(peers(FOLDER_ID_ALL)).toEqual([200, 100]);
    expect(peers(2)).toEqual([100]);
    expect(unread(FOLDER_ID_ALL)).toEqual([100]);

    return {storage, save, peers, unread};
  };

  test('leaves All chats for the archive when it comes archived', () => {
    const {save, peers, unread} = setup();

    // * archived elsewhere, and the update that said so not seen here
    save(100, {unread_count: UNREAD, folder_id: FOLDER_ID_ARCHIVE});

    expect(peers(FOLDER_ID_ALL)).toEqual([200]);
    expect(peers(FOLDER_ID_ARCHIVE)).toEqual([100]);
    expect(unread(FOLDER_ID_ALL), 'All chats counts a chat it does not hold').toEqual([]);
    expect(unread(FOLDER_ID_ARCHIVE)).toEqual([100]);
  });

  test('leaves a folder of unread chats when it comes read', () => {
    const {save, peers, unread} = setup();

    save(100, {unread_count: 0});

    expect(peers(2)).toEqual([]);
    expect(unread(2)).toEqual([]);
    expect(peers(FOLDER_ID_ALL)).toEqual([200, 100]);
  });

  test('stays where it is, and is counted once, when nothing that places it changed', () => {
    const {storage, save, peers, unread} = setup();

    save(100, {unread_count: UNREAD});

    expect(peers(FOLDER_ID_ALL)).toEqual([200, 100]);
    expect(peers(2)).toEqual([100]);
    expect(unread(FOLDER_ID_ALL)).toEqual([100]);
    expect(storage.getFolderDialogs(FOLDER_ID_ALL, false)[1], 'the folder holds the chat the storage has').toBe(storage.getDialogOnly(100 as PeerId));
  });
});
