import {describe, expect, it} from 'vitest';
import '@helpers/peerIdPolyfill';
import {AppMessagesManager, HistoryStorage} from '@appManagers/appMessagesManager';
import createHistoryStorage from '@appManagers/utils/messages/createHistoryStorage';
import getServerMessageId from '@appManagers/utils/messageId/getServerMessageId';
import isUnreadByReadCursor from '@appManagers/utils/messages/isUnreadByReadCursor';
import {MESSAGE_ID_OFFSET} from '@appManagers/constants';

const CHAT_ID = 555 as ChatId;
const PEER_ID = CHAT_ID.toPeerId(true);
const THREAD_ID = MESSAGE_ID_OFFSET + 10;

type StorageSpec = {readMaxId?: number, maxId?: number};

type ManagerOptions = {
  chat: StorageSpec,
  thread?: StorageSpec,
  isForum?: boolean,
  isBotforum?: boolean,
  topMessageOut?: boolean
};

function makeManager(options: ManagerOptions) {
  const manager = new AppMessagesManager();

  const build = (spec: StorageSpec) => {
    const storage: HistoryStorage = createHistoryStorage({type: 'history', peerId: PEER_ID});
    storage.readMaxId = spec.readMaxId;
    storage._maxId = spec.maxId;
    return storage;
  };

  const chatStorage = build(options.chat);
  const threadStorage = options.thread ? build(options.thread) : undefined;

  Object.assign(manager as any, {
    appChatsManager: {
      isForum: () => !!options.isForum
    },
    appPeersManager: {
      isBotforum: () => !!options.isBotforum
    },
    getHistoryStorage: (_peerId: PeerId, threadId?: number) => threadId ? threadStorage : chatStorage,
    getMessageByPeer: () => options.topMessageOut === undefined ?
      undefined :
      {_: 'message', pFlags: {out: options.topMessageOut}}
  });

  return manager;
}

// The implementation as it was before getInboxReadMaxId was extracted — the reference
// getReadMaxIdIfUnread must keep matching it for every input, since the unread delimiter,
// the "jump to unread" target and the sponsored-message cursor all read its answer.
function legacyGetReadMaxIdIfUnread(manager: any, peerId: PeerId, threadId?: number) {
  const historyStorage = manager.getHistoryStorage(peerId, threadId);
  const isAnyForum = manager.appChatsManager.isForum(peerId.toChatId()) || manager.appPeersManager.isBotforum(peerId);
  if(threadId && !isAnyForum) {
    const chatHistoryStorage = manager.getHistoryStorage(peerId);
    const readMaxId = Math.max(chatHistoryStorage.readMaxId ?? 0, historyStorage.readMaxId);
    const message = manager.getMessageByPeer(peerId, historyStorage.maxId);
    return !message?.pFlags?.out && readMaxId < historyStorage.maxId ? readMaxId : 0;
  } else {
    const message = manager.getMessageByPeer(peerId, historyStorage.maxId);
    const readMaxId = historyStorage.readMaxId;
    return !message?.pFlags?.out && readMaxId < historyStorage.maxId && getServerMessageId(readMaxId) ? readMaxId : 0;
  }
}

describe('inbox read cursor', () => {
  describe('getInboxReadMaxId', () => {
    it('returns the cursor of a fully read chat instead of collapsing to 0', () => {
      const readMaxId = MESSAGE_ID_OFFSET + 40;
      const manager = makeManager({chat: {readMaxId, maxId: readMaxId}});

      // what made every bubble of a read chat look unread (dice/effects replayed on each open)
      expect(manager.getReadMaxIdIfUnread(PEER_ID)).toBe(0);
      expect(manager.getInboxReadMaxId(PEER_ID)).toBe(readMaxId);
    });

    it('keeps the cursor below the messages of a chat with unread ones', () => {
      const manager = makeManager({chat: {readMaxId: MESSAGE_ID_OFFSET + 40, maxId: MESSAGE_ID_OFFSET + 42}});
      expect(manager.getInboxReadMaxId(PEER_ID)).toBe(MESSAGE_ID_OFFSET + 40);
    });

    it('uses the topic cursor for a forum topic, without merging the parent chat', () => {
      const manager = makeManager({
        chat: {readMaxId: MESSAGE_ID_OFFSET + 90, maxId: MESSAGE_ID_OFFSET + 90},
        thread: {readMaxId: MESSAGE_ID_OFFSET + 20, maxId: MESSAGE_ID_OFFSET + 25},
        isForum: true
      });

      expect(manager.getInboxReadMaxId(PEER_ID, THREAD_ID)).toBe(MESSAGE_ID_OFFSET + 20);
    });

    it('uses the topic cursor for a botforum topic as well', () => {
      const manager = makeManager({
        chat: {readMaxId: MESSAGE_ID_OFFSET + 90, maxId: MESSAGE_ID_OFFSET + 90},
        thread: {readMaxId: MESSAGE_ID_OFFSET + 20, maxId: MESSAGE_ID_OFFSET + 25},
        isBotforum: true
      });

      expect(manager.getInboxReadMaxId(PEER_ID, THREAD_ID)).toBe(MESSAGE_ID_OFFSET + 20);
    });

    it('merges the parent cursor for a legacy reply thread in a plain channel', () => {
      const manager = makeManager({
        chat: {readMaxId: MESSAGE_ID_OFFSET + 90, maxId: MESSAGE_ID_OFFSET + 90},
        thread: {readMaxId: MESSAGE_ID_OFFSET + 20, maxId: MESSAGE_ID_OFFSET + 25}
      });

      expect(manager.getInboxReadMaxId(PEER_ID, THREAD_ID)).toBe(MESSAGE_ID_OFFSET + 90);
    });

    it('reports an unknown cursor for a peer whose dialog has not been loaded', () => {
      const manager = makeManager({chat: {maxId: MESSAGE_ID_OFFSET + 40}});
      // the renderer treats a non-number as "unknown" and keeps the message unread
      expect(manager.getInboxReadMaxId(PEER_ID) >= 0).toBe(false);
    });
  });

  describe('isUnreadByReadCursor', () => {
    const mid = MESSAGE_ID_OFFSET + 40;

    it('marks a message above the cursor as unread', () => {
      expect(isUnreadByReadCursor(MESSAGE_ID_OFFSET + 39, mid)).toBe(true);
    });

    it('marks the cursor message itself and everything below it as read', () => {
      expect(isUnreadByReadCursor(mid, mid)).toBe(false);
      expect(isUnreadByReadCursor(MESSAGE_ID_OFFSET + 41, mid)).toBe(false);
    });

    it('treats a chat where nothing has been read as fully unread', () => {
      expect(isUnreadByReadCursor(0, mid)).toBe(true);
    });

    // the read observer is the ONLY thing that marks a history as read, so an unknown
    // cursor must never answer "read" — it would leave the chat unread forever
    it('stays conservative for an unknown cursor', () => {
      expect(isUnreadByReadCursor(undefined, mid)).toBe(true);
      expect(isUnreadByReadCursor(NaN, mid)).toBe(true);
    });
  });

  describe('getReadMaxIdIfUnread stays byte-for-byte compatible', () => {
    const cursors = [
      undefined,
      0,
      MESSAGE_ID_OFFSET, // a channel that has never been read (server id 0)
      MESSAGE_ID_OFFSET + 5,
      MESSAGE_ID_OFFSET + 40,
      MESSAGE_ID_OFFSET + 100
    ];
    const maxIds = [undefined, MESSAGE_ID_OFFSET + 40];
    const topMessages: ManagerOptions['topMessageOut'][] = [undefined, false, true];
    const threadModes: {name: string, isForum?: boolean, isBotforum?: boolean}[] = [
      {name: 'legacy reply thread'},
      {name: 'forum topic', isForum: true},
      {name: 'botforum topic', isBotforum: true}
    ];

    it('matches the previous implementation without a thread', () => {
      const answers = new Set<number>();
      for(const readMaxId of cursors) {
        for(const maxId of maxIds) {
          for(const topMessageOut of topMessages) {
            const options: ManagerOptions = {chat: {readMaxId, maxId}, topMessageOut};
            const manager = makeManager(options);
            const answer = manager.getReadMaxIdIfUnread(PEER_ID);
            answers.add(answer);
            expect(
              answer,
              JSON.stringify({readMaxId, maxId, topMessageOut})
            ).toBe(legacyGetReadMaxIdIfUnread(makeManager(options), PEER_ID));
          }
        }
      }

      expect(answers.size, 'the matrix must exercise both "nothing unread" and a real cursor').toBeGreaterThan(1);
    });

    it('matches the previous implementation inside every kind of thread', () => {
      const answers = new Set<number>();
      for(const mode of threadModes) {
        for(const readMaxId of cursors) {
          for(const threadReadMaxId of cursors) {
            for(const maxId of maxIds) {
              for(const topMessageOut of topMessages) {
                const options: ManagerOptions = {
                  chat: {readMaxId, maxId},
                  thread: {readMaxId: threadReadMaxId, maxId},
                  isForum: mode.isForum,
                  isBotforum: mode.isBotforum,
                  topMessageOut
                };
                const manager = makeManager(options);
                const answer = manager.getReadMaxIdIfUnread(PEER_ID, THREAD_ID);
                answers.add(answer);
                expect(
                  answer,
                  JSON.stringify({mode: mode.name, readMaxId, threadReadMaxId, maxId, topMessageOut})
                ).toBe(legacyGetReadMaxIdIfUnread(makeManager(options), PEER_ID, THREAD_ID));
              }
            }
          }
        }
      }

      expect(answers.size, 'the matrix must exercise both "nothing unread" and a real cursor').toBeGreaterThan(1);
    });
  });
});
