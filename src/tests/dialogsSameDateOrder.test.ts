import {FOLDER_ID_ALL} from '@appManagers/constants';
import {createAllChatsStorage} from '@/tests/helpers/dialogsStorage';

const DATE = 1770733527;

// * dialogs of one date stand in the order they took their places in: the chat list must not reorder them when
// * one is opened, read or refreshed from the server, only when one of them gets a new top message
describe('dialogs of one date', () => {
  const setup = () => {
    const chats = createAllChatsStorage();
    const save = (userId: number, topMessage: number, options?: {keepPlace?: boolean}) => {
      return chats.save(userId, topMessage, DATE, options);
    };
    const {order} = chats;

    // * a page of the list is saved from its end, so the one above comes last
    save(100, 1);
    save(200, 1);
    expect(order()).toEqual([200, 100]);

    return {...chats, save};
  };

  test('keep their order when one of them is read or opened', () => {
    const {storage, order} = setup();

    storage.processDialogForFilters(storage.getDialogOnly(100 as PeerId));

    expect(order()).toEqual([200, 100]);
  });

  test('keep their order when one of them is refreshed on its own', () => {
    const {storage, save, order} = setup();

    const dialog = save(100, 1, {keepPlace: true});

    expect(order()).toEqual([200, 100]);
    // * and the list holds the dialog as it is now
    expect(storage.getFolderDialogs(FOLDER_ID_ALL, false)[1]).toBe(dialog);
  });

  test('take the order of a page of the list', () => {
    const {save, order} = setup();

    save(100, 1);

    expect(order()).toEqual([100, 200]);
  });

  test('let the one with a new top message go first', () => {
    const {storage, dates, order} = setup();

    const dialog = storage.getDialogOnly(100 as PeerId);
    dates.set(`${100}_${2}`, DATE);
    dialog.top_message = 2;
    storage.processDialogForFilters(dialog);

    expect(order()).toEqual([100, 200]);
  });
});
