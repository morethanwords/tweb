import {describe, expect, it} from 'vitest';
import type {Message, MessagesMessages} from '@layer';
import '@helpers/peerIdPolyfill';
import {AppMessagesManager, HistoryStorage} from '@appManagers/appMessagesManager';
import createHistoryStorage from '@appManagers/utils/messages/createHistoryStorage';
import SlicedArray, {SliceEnd} from '@helpers/slicedArray';

const CHAT_ID = 1117628569 as ChatId;
const PEER_ID = CHAT_ID.toPeerId(true);

function makeMessage(mid: number, groupedId?: string): Message.message {
  return {
    _: 'message',
    pFlags: {},
    id: mid,
    mid,
    date: mid,
    message: groupedId ? '' : 'text ' + mid,
    grouped_id: groupedId,
    peer_id: {_: 'peerChannel', channel_id: CHAT_ID},
    peerId: PEER_ID
  } as Message.message;
}

/**
 * A page of a channel's history as the server gives it (newest first, an album's items by their grouped id), loaded
 * into a history that may hold slices already (`bottomSlice`: one known to reach the newest message), as a chat's
 * bubbles ask for it (`leaveOutEdgeAlbums`) unless said otherwise: the slice the page ends up in, and the second
 * requests made for albums
 */
async function loadPage({page, slices = [], bottomSlice, offsetId = 0, addOffset = 0, offsetIdOffset, leaveOutEdgeAlbums = true}: {
  page: [mid: number, groupedId?: string][],
  leaveOutEdgeAlbums?: boolean,
  slices?: number[][],
  bottomSlice?: number[],
  offsetId?: number,
  addOffset?: number,
  offsetIdOffset?: number
}) {
  const historyStorage: HistoryStorage = createHistoryStorage({type: 'history', peerId: PEER_ID});
  historyStorage.history = new SlicedArray();
  slices.forEach((slice) => historyStorage.history.insertSlice(slice));
  if(bottomSlice) {
    historyStorage.history.insertSlice(bottomSlice).setEnd(SliceEnd.Bottom);
    historyStorage._maxId = bottomSlice[0];
  }

  const fills: {offsetId: number}[] = [];
  const manager = new AppMessagesManager() as any;
  Object.assign(manager, {
    appPeersManager: {getPeerMigratedTo: (): PeerId => undefined},
    middleware: {get: () => () => true},
    getChannelAvailableMinIdGeneration: () => 0,
    mergeReplyKeyboard: () => false,
    reloadConversation: () => {},
    getHistory: (options: {offsetId: number}) => {
      fills.push(options);
      return Promise.resolve({isEnd: {top: false, bottom: false}, history: [] as number[], messages: [] as Message.message[]});
    }
  });

  const result = {
    _: 'messages.channelMessages',
    pFlags: {},
    pts: 1,
    count: 1000,
    offset_id_offset: offsetIdOffset,
    messages: page.map(([mid, groupedId]) => makeMessage(mid, groupedId)),
    chats: [],
    users: [],
    topics: []
  } as MessagesMessages.messagesChannelMessages;
  manager.requestHistory = () => Promise.resolve(result);

  await manager.fillHistoryStorage({peerId: PEER_ID, historyStorage, offsetId, addOffset, limit: page.length, leaveOutEdgeAlbums});

  const pageMid = page.find(([mid]) => historyStorage.history.findSlice(mid))?.[0];
  return {history: pageMid ? Array.from(historyStorage.history.findSlice(pageMid).slice) : [], fills, maxId: historyStorage.maxId};
}

describe('an album a page of the history ends in', () => {
  it('is left out of the page rather than asked for whole before the page is given', async() => {
    const {history, fills} = await loadPage({
      page: [[106], [105], [104], [103, 'a'], [102, 'a'], [101, 'a']]
    });

    expect(history).toEqual([106, 105, 104]);
    expect(fills).toEqual([]);
  });

  it('is asked for whole for a reader that tells the end by a page shorter than asked for', async() => {
    // * the profile's Saved tab
    const {history, fills} = await loadPage({
      page: [[106], [105], [104], [103, 'a'], [102, 'a'], [101, 'a']],
      leaveOutEdgeAlbums: false
    });

    expect(history).toEqual([106, 105, 104, 103, 102, 101]);
    expect(fills.map(({offsetId}) => offsetId)).toEqual([101]);
  });

  it('is left out at the newer end of a page around a message, which stays', async() => {
    const {history, fills} = await loadPage({
      page: [[108, 'b'], [107, 'b'], [106], [105], [104], [103]],
      offsetId: 105,
      addOffset: -3,
      offsetIdOffset: 10
    });

    expect(history).toEqual([106, 105, 104, 103]);
    expect(fills).toEqual([]);
  });

  it('stays when the page holds as many items as an album can have', async() => {
    const album = Array.from({length: 10}, (_, i) => [110 - i, 'a'] as [number, string]);
    const {history, fills} = await loadPage({page: [[112], [111], ...album]});

    expect(history).toEqual([112, 111, ...album.map(([mid]) => mid)]);
    expect(fills).toEqual([]);
  });

  it('stays when the history already goes on past it', async() => {
    const {history, fills} = await loadPage({
      page: [[106], [105], [104], [103, 'a'], [102, 'a']],
      slices: [[102, 101, 100]]
    });

    expect(history).toEqual([106, 105, 104, 103, 102, 101, 100]);
    expect(fills).toEqual([]);
  });

  it('is asked for whole when it holds the message asked for', async() => {
    const {history, fills} = await loadPage({
      page: [[108, 'b'], [107, 'b'], [106, 'b'], [105, 'b'], [104], [103]],
      offsetId: 105,
      addOffset: -3,
      offsetIdOffset: 10
    });

    expect(history).toEqual([108, 107, 106, 105, 104, 103]);
    expect(fills.map(({offsetId}) => offsetId)).toEqual([108]);
  });

  it('is asked for whole when it is the whole page', async() => {
    const {history, fills} = await loadPage({
      page: [[108, 'b'], [107, 'b'], [106, 'b']],
      offsetId: 110,
      addOffset: -2,
      offsetIdOffset: 10
    });

    expect(history).toEqual([108, 107, 106]);
    expect(fills.map(({offsetId}) => offsetId)).toEqual([108]);
  });

  it('stays at an end of the history the slice knows, which nothing goes on past', async() => {
    // * not the bottom end by itself (offset_id_offset 5 with 4 newer), as the server answers for a basic group
    const {history, fills, maxId} = await loadPage({
      page: [[160, 'a'], [159, 'a'], [158, 'a'], [157, 'a'], [153], [152]],
      bottomSlice: [153, 152, 151],
      offsetId: 153,
      addOffset: -4,
      offsetIdOffset: 5
    });

    expect(history).toEqual([160, 159, 158, 157, 153, 152, 151]);
    expect(maxId).toBe(160);
    expect(fills).toEqual([]);
  });

  it('is asked for whole with the other edge\'s when the two are all of the page', async() => {
    // * around a message that is gone: two albums the page ends in, one at each edge
    const {history, fills} = await loadPage({
      page: [[108, 'b'], [107, 'b'], [106, 'a'], [105, 'a']],
      offsetId: 109,
      addOffset: -2,
      offsetIdOffset: 10
    });

    expect(history).toEqual([108, 107, 106, 105]);
    expect(fills.map(({offsetId}) => offsetId)).toEqual([108, 105]);
  });

  it('is asked for whole with the other edge\'s when that one holds the message asked for', async() => {
    // * the request that fills the album asked for takes in part of the other one again: it is filled too
    const {history, fills} = await loadPage({
      page: [[108, 'b'], [107, 'b'], [106], [105, 'a'], [104, 'a']],
      offsetId: 104,
      addOffset: -3,
      offsetIdOffset: 10
    });

    expect(history).toEqual([108, 107, 106, 105, 104]);
    expect(fills.map(({offsetId}) => offsetId)).toEqual([108, 104]);
  });
});
