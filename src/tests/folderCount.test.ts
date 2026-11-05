import {FOLDER_ID_ALL} from '@appManagers/constants';
import {createAllChatsStorage} from '@/tests/helpers/dialogsStorage';

const DATE = 1770733527;

// * a folder's count is how many chats it holds, the ones not loaded yet too (the server's total, kept up locally):
// * a chat that only moves within it (a new message puts it higher) is still one of them, and only a chat coming in
// * or going out changes it
describe('a folder\'s count', () => {
  const setup = () => {
    const chats = createAllChatsStorage();
    const {storage, dates, save, order} = chats;
    // * a new message on top of a chat the list has
    const receive = (userId: number, topMessage: number, date: number) => {
      dates.set(`${userId}_${topMessage}`, date);
      const dialog = storage.getDialogOnly(userId as PeerId);
      dialog.top_message = topMessage;
      storage.processDialogForFilters(dialog);
    };
    const folder = storage.getFolder(FOLDER_ID_ALL);

    // * the first page of a list of 10 chats, as the server counts them
    save(100, 1, DATE);
    save(200, 1, DATE + 1);
    folder.count = 10;
    expect(order()).toEqual([200, 100]);

    return {...chats, folder, receive};
  };

  test('stays as it is when a chat moves within the folder', () => {
    const {folder, receive, order} = setup();

    receive(100, 2, DATE + 2);
    expect(order()).toEqual([100, 200]);
    receive(200, 2, DATE + 3);
    receive(100, 3, DATE + 4);
    expect(order()).toEqual([100, 200]);

    expect(folder.count).toBe(10);
  });

  test('changes when a chat comes in or goes out', () => {
    const {storage, folder, save, receive, order} = setup();

    save(300, 1, DATE + 2);
    expect(order()).toEqual([300, 200, 100]);
    expect(folder.count).toBe(11);

    // * archived: out of All Chats
    const dialog = storage.getDialogOnly(200 as PeerId);
    dialog.folder_id = 1;
    storage.processDialogForFilters(dialog);
    expect(order()).toEqual([300, 100]);
    expect(folder.count).toBe(10);

    receive(100, 2, DATE + 3);
    expect(order()).toEqual([100, 300]);
    expect(folder.count).toBe(10);
  });
});
