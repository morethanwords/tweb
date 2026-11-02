import '@helpers/peerIdPolyfill';
import {AppMessagesManager} from '@appManagers/appMessagesManager';
import {Message} from '@layer';

// Messages deleted together from two albums: an album that loses some of its files is told what is left
// (grouped_edit), whatever happens to the other one — an album deleted whole is told nothing.

const peerId = (-77 as ChatId).toPeerId(true);

function setup(albums: {[groupedId: string]: number[]}) {
  const manager = new AppMessagesManager();
  const storage = (manager as any).createMessageStorage(peerId, 'history');
  const groupedMessagesStorage: {[groupedId: string]: any} = {};
  for(const groupedId in albums) {
    const grouped = groupedMessagesStorage[groupedId] = (manager as any).createMessageStorage(peerId, 'grouped');
    for(const mid of albums[groupedId]) {
      const message = {_: 'message', id: mid, mid, peerId, pFlags: {}, date: 0, message: '', grouped_id: groupedId} as Message.message;
      storage.set(mid, message);
      grouped.set(mid, message);
    }
  }

  const dispatchEvent = vi.fn();
  Object.assign(manager as any, {
    rootScope: {dispatchEvent},
    groupedMessagesStorage,
    deletedMessages: new Set(),
    missingMessages: new Set(),
    appTranslationsManager: {resetMessageTranslations: vi.fn()}
  });
  for(const method of [
    'forgetAnchoredEphemeralsAtMids',
    'invalidateRichMessage',
    'handleReleasingMessage',
    'updateMessageRepliesIfNeeded',
    'updateMessageContextForDeletion',
    'getThreadKey'
  ]) {
    vi.spyOn(manager as any, method).mockImplementation(() => {});
  }
  vi.spyOn(manager, 'getMessageFromStorage').mockImplementation((target: any, mid: number) => target.get(mid));
  vi.spyOn(manager, 'deleteMessageFromStorage').mockImplementation((target: any, mid: number) => target.delete(mid));

  const groupedEdits = () => dispatchEvent.mock.calls
  .filter(([name]) => name === 'grouped_edit')
  .map(([, {groupedId, deletedMids, messages}]) => ({groupedId, deletedMids, left: messages.map((message: Message.message) => message.mid)}));

  return {manager, storage, groupedEdits};
}

describe('deleting messages of albums', () => {
  test.each([
    ['the album deleted whole comes last', [11, 20, 21]],
    ['the album deleted whole comes first', [20, 21, 11]]
  ])('%s: the other album is told what is left', (_name, mids) => {
    const {manager, storage, groupedEdits} = setup({a: [10, 11, 12], b: [20, 21]});

    (manager as any).handleDeletedMessages(peerId, storage, mids);

    expect(groupedEdits()).toEqual([{groupedId: 'a', deletedMids: [11], left: [10, 12]}]);
  });
});
