import '@helpers/peerIdPolyfill';
import {AppMessagesManager} from '@appManagers/appMessagesManager';
import {makeChannelIds} from '@/tests/helpers/channelIds';

// A deleted message that is not loaded here may have been one of the chat's unread ones (a bot deletes spam in a busy
// group): one above the chat's read cursor has the chat's unread count asked for again, once for the deletion, as
// tdesktop does (History::unknownMessageDeleted); one below it cannot have been unread.

const {peerId, mid} = makeChannelIds();

function setup() {
  const manager = new AppMessagesManager();
  Object.assign(manager as any, {
    deletedMessages: new Set(),
    missingMessages: new Set(),
    appTranslationsManager: {resetMessageTranslations: vi.fn()}
  });
  vi.spyOn(manager, 'getDialogOnly').mockReturnValue({_: 'dialog', peerId, read_inbox_max_id: mid(50), unread_count: 30} as any);
  vi.spyOn(manager as any, 'forgetAnchoredEphemeralsAtMids').mockImplementation(() => {});
  vi.spyOn(manager as any, 'invalidateRichMessage').mockImplementation(() => {});
  vi.spyOn(manager as any, 'fixDialogUnreadMentionsIfNoMessage').mockImplementation(() => {});
  const reloadConversation = vi.spyOn(manager, 'reloadConversation').mockReturnValue(undefined);
  const storage = (manager as any).createMessageStorage(peerId, 'history');
  const deleteUnknown = (ids: number[]) => (manager as any).handleDeletedMessages(peerId, storage, ids.map(mid));

  return {reloadConversation, deleteUnknown};
}

describe('deleted messages that are not loaded here', () => {
  test('above the read cursor have the chat asked for again, once', () => {
    const {reloadConversation, deleteUnknown} = setup();
    deleteUnknown([60, 61, 62]);
    expect(reloadConversation).toHaveBeenCalledOnce();
    expect(reloadConversation).toHaveBeenCalledWith(peerId);
  });

  test('below the read cursor leave the chat as it is', () => {
    const {reloadConversation, deleteUnknown} = setup();
    deleteUnknown([40, 50]);
    expect(reloadConversation).not.toHaveBeenCalled();
  });
});
