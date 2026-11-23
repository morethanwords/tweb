import {FOLDER_ID_ALL} from '@appManagers/constants';
import {createDialogsStorage} from '@/tests/helpers/dialogsStorage';

// * "Mark all as read" of a folder reads every unread chat of it, whatever one of them does
describe('marking a folder as read', () => {
  test('reads the rest of the folder past a chat that cannot be read', async() => {
    const read: PeerId[] = [];
    const storage = createDialogsStorage({
      appMessagesManager: {
        markDialogUnread: ({peerId}: {peerId: PeerId}) => {
          read.push(peerId);
          // * a chat whose dialog is gone, or one the server refuses to read
          return peerId === 200 ? Promise.reject(new Error('CHANNEL_PRIVATE')) : Promise.resolve();
        }
      }
    });

    const {unreadPeerIds} = storage.getFolder(FOLDER_ID_ALL);
    [100, 200, 300].forEach((peerId) => unreadPeerIds.add(peerId as PeerId));

    await expect(storage.markFolderAsRead(FOLDER_ID_ALL)).resolves.toBeUndefined();
    expect(read).toEqual([100, 200, 300]);
  });
});
