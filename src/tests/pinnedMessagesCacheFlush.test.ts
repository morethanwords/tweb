import {describe, expect, it, vi} from 'vitest';
import '@helpers/peerIdPolyfill';
import {AppMessagesManager} from '@appManagers/appMessagesManager';

const PEER_ID = (1523302163 as ChatId).toPeerId(true);
const OTHER_PEER_ID = (1740023931 as ChatId).toPeerId(true);
const TOPIC_ID = 42;

function makeManager() {
  const pushToState = vi.fn();
  const dispatchEvent = vi.fn();
  const manager = new AppMessagesManager();

  Object.assign(manager as any, {
    pinnedMessages: {
      [PEER_ID]: {count: 1, maxId: 100},
      [`${PEER_ID}_${TOPIC_ID}`]: {count: 3, maxId: 300},
      [OTHER_PEER_ID]: {count: 7, maxId: 700},
      [`${OTHER_PEER_ID}_${TOPIC_ID}`]: {count: 9, maxId: 900}
    },
    searchesStorage: {
      [PEER_ID]: {
        undefined: {inputMessagesFilterPinned: {}, inputMessagesFilterPhotos: {}},
        [TOPIC_ID]: {inputMessagesFilterPinned: {}}
      }
    },
    appStateManager: {
      getState: () => Promise.resolve({hiddenPinnedMessages: {[PEER_ID]: 100}}),
      pushToState
    },
    rootScope: {dispatchEvent}
  });

  return {manager, dispatchEvent};
}

describe('pinned messages cache invalidation', () => {
  // A topic's plate caches under `${peerId}_${threadId}` and `getPinnedMessage`
  // short-circuits on a cached maxId, so a pin change that dropped only the
  // peer-wide key left the topic pointing at a message that is no longer pinned.
  it('drops every key of the peer, thread-scoped ones included', async() => {
    const {manager, dispatchEvent} = makeManager();

    (manager as any).resetPinnedMessagesCache(PEER_ID, [200], true);

    expect(Object.keys((manager as any).pinnedMessages).sort()).toEqual(
      [`${OTHER_PEER_ID}`, `${OTHER_PEER_ID}_${TOPIC_ID}`].sort()
    );

    await Promise.resolve();
    await Promise.resolve();
    expect(dispatchEvent).toHaveBeenCalledWith('peer_pinned_messages', {peerId: PEER_ID, mids: [200], pinned: true});
  });

  it('drops the pinned search storage of every thread but keeps other filters', () => {
    const {manager} = makeManager();

    (manager as any).resetPinnedMessagesCache(PEER_ID, [200], false);

    const peerSearches = (manager as any).searchesStorage[PEER_ID];
    expect(peerSearches['undefined'].inputMessagesFilterPinned).toBeUndefined();
    expect(peerSearches['undefined'].inputMessagesFilterPhotos).toBeDefined();
    expect(peerSearches[TOPIC_ID].inputMessagesFilterPinned).toBeUndefined();
  });

  it('leaves the cache alone for other peers when flushing storages', () => {
    const {manager} = makeManager();

    (manager as any).flushPinnedMessagesCache(OTHER_PEER_ID);

    expect(Object.keys((manager as any).pinnedMessages).sort()).toEqual(
      [`${PEER_ID}`, `${PEER_ID}_${TOPIC_ID}`].sort()
    );
  });
});
