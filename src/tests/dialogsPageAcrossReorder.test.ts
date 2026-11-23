import {FOLDER_ID_ALL} from '@appManagers/constants';
import makeDialogFilter from '@/tests/helpers/dialogFilter';
import {createAllChatsStorage, DIALOG_DATE as DATE} from '@/tests/helpers/dialogsStorage';

// * the folders reordered while a page of a list is on its way (the start's sync takes the server's folders, an order
// * comes from another device, Premium goes): every folder's list is built anew then, and the page is read from the
// * list as it is when it comes, not from the one there was when it was asked for
describe('a page of the chat list asked for across a change of the folders', () => {
  // * the storage with its own listeners of the folders' events, as it is made
  const setup = async() => {
    const chats = createAllChatsStorage();
    const {storage} = chats;
    const listeners = new Map<string, (payload?: any) => void>();
    Object.assign(storage as any, {
      rootScope: {addEventListener: (name: string, listener: () => void) => listeners.set(name, listener), dispatchEvent: () => {}},
      appStateManager: {getState: () => Promise.resolve({pinnedOrders: {}}), pushToState: () => {}},
      appStoragesManager: {loadStorage: () => Promise.resolve({results: [], storage: (storage as any).storage})}
    });
    await (storage as any).after();

    return {...chats, listeners};
  };

  test('has the chats the page brought, and ends where the list does', async() => {
    const {storage, save, listeners} = await setup();
    save(100, 1, DATE);
    save(200, 1, DATE + 1);

    (storage as any).appMessagesManager.getTopMessages = async() => {
      listeners.get('filter_order')([FOLDER_ID_ALL]);
      save(300, 1, DATE + 2);
      save(400, 1, DATE - 1);
      return {isEnd: true, count: 4};
    };

    const page = await storage.getDialogs({filterId: FOLDER_ID_ALL, limit: 20});

    expect(page.dialogs.map((dialog) => +dialog.peerId)).toEqual([300, 200, 100, 400]);
    expect(page.isEnd).toBe(true);
  });

  test('comes, with nothing, for a chat folder removed while it was on its way', async() => {
    const {storage, listeners} = await setup();
    const folder = makeDialogFilter(2, 4);
    const folders: Record<number, typeof folder> = {[FOLDER_ID_ALL]: makeDialogFilter(FOLDER_ID_ALL, FOLDER_ID_ALL), 2: folder};
    Object.assign((storage as any).filtersStorage, {
      getFilters: () => folders,
      getFilter: (filterId: number) => folders[filterId],
      reloadMissingPeerIds: (): undefined => undefined
    });
    (storage as any).appUsersManager.fillContacts = () => ({cached: true});

    (storage as any).appMessagesManager.getTopMessages = async() => {
      // * as the folders' storage removes one: the event, then the folder
      listeners.get('filter_delete')(folder);
      delete folders[2];
      return {isEnd: true, count: 0};
    };

    await expect(storage.getDialogs({filterId: 2, limit: 20})).resolves.toMatchObject({dialogs: []});
  });
});
