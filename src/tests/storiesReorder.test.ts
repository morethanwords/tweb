import {describe, expect, it, vi} from 'vitest';
import AppStoriesManager from '@appManagers/appStoriesManager';
import ApiManagerMethods from '@appManagers/apiManagerMethods';
import {getSortableGridSlot, getSortableGridTarget} from '@helpers/dom/sortable';
import putInOrder from '@helpers/array/putInOrder';
import {StoryAlbum, StoryItem} from '@layer';
import '@helpers/peerIdPolyfill';

const self = (1 as UserId).toPeerId();

describe('getSortableGridTarget', () => {
  // * a grid of three columns of 100x100 cells, two rows
  const slots = [0, 1, 2, 3, 4, 5].map((idx) => ({left: (idx % 3) * 100, top: Math.floor(idx / 3) * 100, width: 100, height: 100}));

  it('lands on the cell under the middle of what is held', () => {
    expect(getSortableGridTarget(slots, {x: 50, y: 50})).toBe(0);
    expect(getSortableGridTarget(slots, {x: 160, y: 140})).toBe(4);
  });

  it('lands on the nearest cell when held past the edge of the grid', () => {
    expect(getSortableGridTarget(slots, {x: 500, y: 20})).toBe(2);
    expect(getSortableGridTarget(slots, {x: -80, y: 400})).toBe(3);
  });

  it('follows the cells wherever they stand, right to left as well', () => {
    const rtl = slots.map((slot) => ({...slot, left: 200 - slot.left}));
    expect(getSortableGridTarget(rtl, {x: 250, y: 50})).toBe(0);
    expect(getSortableGridTarget(rtl, {x: 50, y: 150})).toBe(5);
  });
});

describe('getSortableGridSlot', () => {
  it('steps the cells in between back towards the place the held one left', () => {
    expect([0, 1, 2, 3, 4].map((idx) => getSortableGridSlot(idx, 1, 3))).toEqual([0, 3, 1, 2, 4]);
  });

  it('steps them forward when it is held over an earlier one', () => {
    expect([0, 1, 2, 3, 4].map((idx) => getSortableGridSlot(idx, 3, 0))).toEqual([1, 2, 3, 0, 4]);
  });

  it('leaves everything where it is while it is held over its own place', () => {
    expect([0, 1, 2].map((idx) => getSortableGridSlot(idx, 1, 1))).toEqual([0, 1, 2]);
  });
});

describe('putInOrder', () => {
  it('puts what the order names first and the rest after, in their own order', () => {
    expect(putInOrder([1, 2, 3, 4, 5], [4, 2])).toEqual([4, 2, 1, 3, 5]);
  });

  it('passes over what it does not hold, and what the order names twice', () => {
    expect(putInOrder([1, 2, 3], [3, 9, 3, 1])).toEqual([3, 1, 2]);
  });

  it('orders objects by a key', () => {
    const items = [{id: 1}, {id: 2}, {id: 3}];
    expect(putInOrder(items, [3, 1], (item) => item.id)).toEqual([items[2], items[0], items[1]]);
  });
});

const story = (id: number, extra: Partial<StoryItem.storyItem> = {}): StoryItem.storyItem => ({
  _: 'storyItem',
  id,
  date: id,
  expire_date: id + 86400,
  pFlags: {pinned: true},
  media: {_: 'messageMediaEmpty'},
  ...extra
} as StoryItem.storyItem);

const album = (album_id: number): StoryAlbum => ({_: 'storyAlbum', album_id, title: 'album ' + album_id} as StoryAlbum);

type Request = {method: string, params: any};

/**
 * The manager with a server of albums behind it: the server takes what it is sent the way the real one does
 * (an added story goes first, an order leaves what it does not name after the rest, each story names its albums),
 * refuses what `refuse` says, and answers while `hold` is off - else each request waits for `answer()`, in the
 * order they came, or is read by the server at `answerLate()` and comes back when told. The manager is the real
 * one, but for the managers and the network around it.
 */
function withServer(server: {albums: number[], stories: {[albumId: number]: number[]}}) {
  const dispatchEvent = vi.fn();
  const sent: Request[] = [];
  // * each answers its request on the server, giving what brings the answer back
  const held: Array<() => () => void> = [];
  const control = {
    hold: false,
    refuse: (request: Request) => false as boolean,
    sent,
    /** answers a held request, the oldest unless told which */
    answer: (idx = 0) => held.splice(idx, 1)[0]()(),
    /** has the server answer a held request now, the answer coming back when the returned function is called */
    answerLate: (idx = 0) => held.splice(idx, 1)[0]()
  };

  const titles: {[albumId: number]: string} = {};
  const albumOf = (albumId: number) => titles[albumId] ? {...album(albumId), title: titles[albumId]} : album(albumId);
  const storyOf = (id: number) => story(id, {albums: server.albums.filter((albumId) => server.stories[albumId].includes(id))});
  const answer = ({method, params}: Request) => {
    if(control.refuse({method, params})) {
      throw {code: 400, type: 'STORY_ID_INVALID'};
    }

    switch(method) {
      case 'stories.getAlbums':
        return {_: 'stories.albums', albums: server.albums.map(albumOf), hash: 1};
      case 'stories.getAlbumStories': {
        const ids = server.stories[params.album_id];
        const page = ids.slice(params.offset, params.offset + params.limit);
        return {_: 'stories.stories', count: ids.length, stories: page.map(storyOf), chats: [] as any[], users: [] as any[]};
      }
      case 'stories.reorderAlbums':
        server.albums = putInOrder(server.albums, params.order);
        return true;
      case 'stories.createAlbum': {
        const albumId = Math.max(...server.albums) + 1;
        server.albums.push(albumId);
        server.stories[albumId] = params.stories.slice().reverse();
        return album(albumId);
      }
      case 'stories.updateAlbum': {
        let ids = server.stories[params.album_id];
        params.add_stories?.forEach((id: number) => !ids.includes(id) && ids.unshift(id));
        if(params.delete_stories) ids = ids.filter((id) => !params.delete_stories.includes(id));
        if(params.order) ids = putInOrder(ids, params.order);
        if(params.title) titles[params.album_id] = params.title;
        server.stories[params.album_id] = ids;
        return albumOf(params.album_id);
      }
    }
  };

  const apiManager = {
    invokeApi: vi.fn((method: string, params: any) => {
      const request = {method, params};
      sent.push(request);
      if(!control.hold) {
        return Promise.resolve().then(() => answer(request));
      }

      return new Promise((resolve, reject) => held.push(() => {
        try {
          const result = answer(request);
          return () => resolve(result);
        } catch(err) {
          return () => reject(err);
        }
      }));
    }),
    // * the real one: a request asked for again while it is on its way joins it
    apiPromisesSingleProcess: {},
    invokeApiSingleProcess: ApiManagerMethods.prototype.invokeApiSingleProcess,
    getAppConfig: vi.fn().mockResolvedValue({stories_pinned_to_top_count_max: 3})
  };

  const manager = new AppStoriesManager();
  manager.clear(true);
  Object.assign(manager, {
    apiManager,
    rootScope: {dispatchEvent},
    appPeersManager: {peerId: self, getInputPeerById: () => ({_: 'inputPeerSelf'}), saveApiPeers: vi.fn()},
    appUsersManager: {isContact: () => true},
    appMessagesManager: {saveMessageMedia: vi.fn()},
    appDocsManager: {saveDoc: (doc: any) => doc},
    appPhotosManager: {savePhoto: (photo: any) => photo},
    appMessagesIdsManager: {generateMessageId: (id: number) => id}
  });

  // * the manager has loaded what the server has
  const cache = manager.getPeerStoriesCache(self);
  cache.albumsOrder = server.albums.slice();
  for(const albumId of server.albums) {
    const ids = server.stories[albumId];
    ids.forEach((id) => cache.storiesMap.set(id, storyOf(id)));
    cache.albums.set(albumId, {info: album(albumId), ids: ids.slice(), count: ids.length, loadedAll: true});
  }

  return {manager, cache, control, dispatchEvent};
}

/** Waits until every write of the lists has settled, the lists read again included */
const settled = (manager: AppStoriesManager) => vi.waitFor(async() => {
  for(const list of (manager as any).listWrites.values()) {
    await list.queue;
    expect(list.pending).toBe(0);
  }
});

describe('the order of an album', () => {
  it('takes the stories in their new order at once, the ones left out after them, and sends it whole', async() => {
    const {manager, cache, control} = withServer({albums: [1], stories: {1: [5, 4, 3, 2, 1]}});
    const promise = manager.reorderAlbumStories(self, 1, [2, 5]);
    expect(cache.albums.get(1).ids).toEqual([2, 5, 4, 3, 1]);
    await promise;
    expect(control.sent).toEqual([{method: 'stories.updateAlbum', params: {peer: {_: 'inputPeerSelf'}, album_id: 1, order: [2, 5, 4, 3, 1]}}]);
  });

  it('is read again from the server once a refused order has settled', async() => {
    const {manager, cache, control} = withServer({albums: [1], stories: {1: [3, 2, 1]}});
    control.refuse = ({params}) => !!params.order;
    await expect(manager.reorderAlbumStories(self, 1, [1, 2, 3])).rejects.toBeTruthy();
    await settled(manager);
    expect(control.sent.map((request) => request.method)).toEqual(['stories.updateAlbum', 'stories.getAlbumStories']);
    expect(cache.albums.get(1).ids).toEqual([3, 2, 1]);
  });

  it('sends its writes one after another', async() => {
    const {manager, control} = withServer({albums: [1], stories: {1: [3, 2, 1]}});
    control.hold = true;
    const first = manager.reorderAlbumStories(self, 1, [1, 2, 3]);
    const second = manager.reorderAlbumStories(self, 1, [2, 1, 3]);
    await vi.waitFor(() => expect(control.sent).toHaveLength(1));
    control.answer();
    await first;
    await vi.waitFor(() => expect(control.sent).toHaveLength(2));
    control.answer();
    await second;
    expect(control.sent.map((request) => request.params.order)).toEqual([[1, 2, 3], [2, 1, 3]]);
  });

  it('keeps a story added during a refused order where the server put it', async() => {
    const {manager, cache, control} = withServer({albums: [1], stories: {1: [3, 2, 1]}});
    cache.storiesMap.set(4, story(4));
    control.hold = true;
    control.refuse = ({params}) => !!params.order;
    const reordered = manager.reorderAlbumStories(self, 1, [1, 2, 3]);
    const added = manager.updateAlbum(self, 1, {addStories: [4]});
    expect(cache.albums.get(1).ids).toEqual([4, 1, 2, 3]);
    await vi.waitFor(() => expect(control.sent).toHaveLength(1));
    control.answer();
    await expect(reordered).rejects.toBeTruthy();
    // * the addition goes only now, and the album is read once it is in
    await vi.waitFor(() => expect(control.sent).toHaveLength(2));
    control.answer();
    await added;
    await vi.waitFor(() => expect(control.sent).toHaveLength(3));
    expect(control.sent[2].method).toBe('stories.getAlbumStories');
    control.answer();
    await settled(manager);
    expect(cache.albums.get(1).ids).toEqual([4, 3, 2, 1]);
  });

  it('reads the album again after a write that came while it was being read', async() => {
    const {manager, cache, control} = withServer({albums: [1], stories: {1: [3, 2, 1]}});
    control.hold = true;
    control.refuse = ({params}) => params.order?.[0] === 1;
    const refused = manager.reorderAlbumStories(self, 1, [1, 2, 3]);
    await vi.waitFor(() => expect(control.sent).toHaveLength(1));
    control.answer();
    await expect(refused).rejects.toBeTruthy();
    await vi.waitFor(() => expect(control.sent).toHaveLength(2));
    // * the album is being read when the next order comes: what is read is behind it
    const taken = manager.reorderAlbumStories(self, 1, [2, 3, 1]);
    control.answer();
    await vi.waitFor(() => expect(control.sent).toHaveLength(3));
    expect(cache.albums.get(1).ids).toEqual([2, 3, 1]);
    control.answer();
    await taken;
    await vi.waitFor(() => expect(control.sent).toHaveLength(4));
    control.answer();
    await settled(manager);
    expect(control.sent.map((request) => request.method)).toEqual([
      'stories.updateAlbum', 'stories.getAlbumStories', 'stories.updateAlbum', 'stories.getAlbumStories'
    ]);
    expect(cache.albums.get(1).ids).toEqual([2, 3, 1]);
  });

  it('is read with the next write, or anew from its top, when it could not be read again', async() => {
    const {manager, cache, control} = withServer({albums: [1], stories: {1: [3, 2, 1]}});
    control.refuse = ({method, params}) => !!params.order || method === 'stories.getAlbumStories';
    await expect(manager.reorderAlbumStories(self, 1, [1, 2, 3])).rejects.toBeTruthy();
    await settled(manager);
    expect(cache.albums.get(1).stale).toBe(true);
    // * the next write that goes through has it read again
    control.refuse = ({params}) => !!params.order;
    cache.storiesMap.set(4, story(4));
    await manager.updateAlbum(self, 1, {addStories: [4]});
    await settled(manager);
    expect(cache.albums.get(1)).toMatchObject({ids: [4, 3, 2, 1], stale: false});
    // * and failing that, loading it from the top does
    control.refuse = ({method, params}) => !!params.order || method === 'stories.getAlbumStories';
    await expect(manager.reorderAlbumStories(self, 1, [1, 2, 3, 4])).rejects.toBeTruthy();
    await settled(manager);
    control.refuse = () => false;
    const page = await manager.getAlbumStories(self, 1, 30);
    expect(page.stories.map((story) => story.id)).toEqual([4, 3, 2, 1]);
  });

  it('puts the stories added to it first, the last one at the top, as the server does', async() => {
    const {manager, cache} = withServer({albums: [1], stories: {1: [3, 2]}});
    [10, 12, 11].forEach((id) => cache.storiesMap.set(id, story(id)));
    await manager.updateAlbum(self, 1, {addStories: [10, 12, 11]});
    expect(cache.albums.get(1).ids).toEqual([11, 12, 10, 3, 2]);
  });

  it('gives the page it was asked for even when the album is rearranged while it loads', async() => {
    const {manager, cache, control} = withServer({albums: [1], stories: {1: [4, 3, 2, 1]}});
    Object.assign(cache.albums.get(1), {ids: [4, 3], loadedAll: false});
    control.hold = true;
    const page = manager.getAlbumStories(self, 1, 2, 3) as Promise<{stories: StoryItem.storyItem[]}>;
    await vi.waitFor(() => expect(control.sent).toHaveLength(1));
    const reordered = manager.reorderAlbumStories(self, 1, [3, 4]);
    control.answer();
    expect((await page).stories.map((story) => story.id)).toEqual([2, 1]);
    await vi.waitFor(() => expect(control.sent).toHaveLength(2));
    control.answer();
    await reordered;
  });

  it('keeps a story added to it in the first page that was loading meanwhile', async() => {
    const {manager, cache, control} = withServer({albums: [1], stories: {1: []}});
    Object.assign(cache.albums.get(1), {loadedAll: false});
    cache.storiesMap.set(9, story(9));
    control.hold = true;
    const page = manager.getAlbumStories(self, 1, 30) as Promise<{stories: StoryItem.storyItem[]}>;
    await vi.waitFor(() => expect(control.sent).toHaveLength(1));
    const added = manager.updateAlbum(self, 1, {addStories: [9]});
    await vi.waitFor(() => expect(control.sent).toHaveLength(2));
    // * the server adds it before it reads the page
    control.answer(1);
    await added;
    control.answer();
    expect((await page).stories.map((story) => story.id)).toEqual([9]);
    expect(cache.albums.get(1).ids).toEqual([9]);
  });

  it('gives the page it was asked for when another read has loaded those stories meanwhile', async() => {
    const stories = Array.from({length: 60}, (_, idx) => 60 - idx);
    const {manager, cache, control} = withServer({albums: [1], stories: {1: stories.slice()}});
    Object.assign(cache.albums.get(1), {ids: stories.slice(0, 30), loadedAll: false});
    control.hold = true;
    const longer = manager.getAlbumStories(self, 1, 30, stories[29]) as Promise<{stories: StoryItem.storyItem[]}>;
    const shorter = manager.getAlbumStories(self, 1, 1, stories[29]) as Promise<{stories: StoryItem.storyItem[]}>;
    await vi.waitFor(() => expect(control.sent).toHaveLength(2));
    control.answer();
    expect((await longer).stories.map((story) => story.id)).toEqual(stories.slice(30));
    control.answer();
    expect((await shorter).stories.map((story) => story.id)).toEqual([stories[30]]);
  });

  it('fills up a page that the server cut short by repeating a story added meanwhile', async() => {
    const server = {albums: [1], stories: {1: [5, 4, 3, 2, 1]}};
    const {manager, cache, control} = withServer(server);
    Object.assign(cache.albums.get(1), {ids: [5, 4], loadedAll: false});
    control.hold = true;
    const page = manager.getAlbumStories(self, 1, 2, 4) as Promise<{stories: StoryItem.storyItem[]}>;
    await vi.waitFor(() => expect(control.sent).toHaveLength(1));
    // * a story goes to the top of the album before the page is answered: the server's pages shift by one
    server.stories[1].unshift(6);
    cache.albums.get(1).ids.unshift(6);
    control.answer();
    await vi.waitFor(() => expect(control.sent).toHaveLength(2));
    control.answer();
    expect((await page).stories.map((story) => story.id)).toEqual([3, 2]);
  });

  it('goes on past a page of nothing but stories it has, when stories were added on top meanwhile', async() => {
    const server = {albums: [1], stories: {1: [6, 5, 4, 3, 2, 1]}};
    const {manager, cache, control} = withServer(server);
    Object.assign(cache.albums.get(1), {ids: [6, 5, 4, 3], loadedAll: false});
    control.hold = true;
    const page = manager.getAlbumStories(self, 1, 2, 3) as Promise<{stories: StoryItem.storyItem[]}>;
    await vi.waitFor(() => expect(control.sent).toHaveLength(1));
    server.stories[1].unshift(7, 8);
    cache.albums.get(1).ids.unshift(7, 8);
    control.answer();
    await vi.waitFor(() => expect(control.sent).toHaveLength(2));
    control.answer();
    expect((await page).stories.map((story) => story.id)).toEqual([2, 1]);
  });

  it('pages on after the story it is asked from, not by date', () => {
    const {manager} = withServer({albums: [1], stories: {1: [2, 9, 1, 7, 5]}});
    const page = manager.getAlbumStories(self, 1, 2, 1) as {stories: StoryItem.storyItem[]};
    expect(page.stories.map((story) => story.id)).toEqual([7, 5]);
  });
});

describe('the order of the albums', () => {
  it('is shown at once and sent whole', async() => {
    const {manager, cache, control, dispatchEvent} = withServer({albums: [1, 2, 3], stories: {1: [], 2: [], 3: []}});
    const promise = manager.reorderAlbums(self, [3, 1]);
    expect(cache.albumsOrder).toEqual([3, 1, 2]);
    expect(dispatchEvent).toHaveBeenCalledWith('story_albums_updated', {peerId: self, albums: [album(3), album(1), album(2)]});
    await promise;
    expect(control.sent).toEqual([{method: 'stories.reorderAlbums', params: {peer: {_: 'inputPeerSelf'}, order: [3, 1, 2]}}]);
  });

  it('puts an album made between refused orders where the server did, and keeps what was loaded of the albums', async() => {
    const {manager, cache, control} = withServer({albums: [1, 2], stories: {1: [5], 2: []}});
    control.refuse = ({method}) => method === 'stories.reorderAlbums';
    const first = manager.reorderAlbums(self, [2, 1]);
    const created = manager.createAlbum(self, 'album 3');
    const second = manager.reorderAlbums(self, [3, 2, 1]);
    await expect(first).rejects.toBeTruthy();
    await created;
    await expect(second).rejects.toBeTruthy();
    await settled(manager);
    expect(cache.albumsOrder).toEqual([1, 2, 3]);
    expect(cache.albums.get(1).ids).toEqual([5]);
  });
});

describe('an album read again', () => {
  it('reads as much of it as was loaded, and the pages asked for before land in the new list', async() => {
    const stories = Array.from({length: 160}, (_, idx) => 160 - idx);
    const {manager, cache, control} = withServer({albums: [1], stories: {1: stories.slice()}});
    Object.assign(cache.albums.get(1), {ids: stories.slice(0, 150), loadedAll: false});
    control.hold = true;
    control.refuse = ({params}) => !!params.order;
    // * the page after the 150th is on its way when a refused order has the album read again
    const page = manager.getAlbumStories(self, 1, 30, stories[149]) as Promise<{stories: StoryItem.storyItem[]}>;
    await vi.waitFor(() => expect(control.sent).toHaveLength(1));
    const refused = manager.reorderAlbumStories(self, 1, [1]);
    await vi.waitFor(() => expect(control.sent).toHaveLength(2));
    // * the page stays held first in line; what comes after it is answered
    control.answer(1); // the order, refused
    await expect(refused).rejects.toBeTruthy();
    await vi.waitFor(() => expect(control.sent).toHaveLength(3));
    control.answer(1); // the album, first hundred
    await vi.waitFor(() => expect(control.sent).toHaveLength(4));
    control.answer(1); // the album, the next fifty
    await settled(manager);
    expect(cache.albums.get(1).ids).toEqual(stories.slice(0, 150));
    control.hold = false;
    control.answer(); // the page asked for before
    expect((await page).stories.map((story) => story.id)).toEqual(stories.slice(150));
    expect(cache.albums.get(1).ids).toEqual(stories);
  });
});

describe('the albums read again', () => {
  const renameWhileRead = async(readComesBackAfterRename: boolean) => {
    const {manager, cache, control, dispatchEvent} = withServer({albums: [1, 2], stories: {1: [], 2: []}});
    control.hold = true;
    control.refuse = ({method}) => method === 'stories.reorderAlbums';
    const refused = manager.reorderAlbums(self, [2, 1]);
    await vi.waitFor(() => expect(control.sent).toHaveLength(1));
    control.answer();
    await expect(refused).rejects.toBeTruthy();
    // * the albums are being read, and the server reads them before the album is renamed
    await vi.waitFor(() => expect(control.sent).toHaveLength(2));
    const read = control.answerLate();
    control.hold = false;
    const renamed = manager.updateAlbum(self, 1, {title: 'renamed'});
    if(readComesBackAfterRename) {
      // * whatever of the rename could reach the server and come back has
      await new Promise((resolve) => setTimeout(resolve, 0));
    }

    read();
    await renamed;
    await settled(manager);
    expect(cache.albums.get(1).info.title).toBe('renamed');
    const updates = dispatchEvent.mock.calls.filter(([name]) => name === 'story_albums_updated');
    expect(updates[updates.length - 1][1].albums.map((album: StoryAlbum) => album.title)).toEqual(['renamed', 'album 2']);
  };

  it('give way to a rename that lands after them', () => renameWhileRead(false));

  it('do not bring back the title from before a rename that landed while they were read', () => renameWhileRead(true));
});

describe('the stories pinned to the top', () => {
  it('each keep an index of their own when one is unpinned and another pinned', async() => {
    const {manager, cache} = withServer({albums: [], stories: {}});
    [4, 3, 2, 1].forEach((id) => cache.storiesMap.set(id, story(id)));
    cache.pinnedToTop = new Map([[3, 0], [2, 1], [1, 2]]);
    cache.pinnedStories = [3, 2, 1, 4];
    await manager.togglePinnedToTop(self, [3], false);
    await manager.togglePinnedToTop(self, [4], true);
    expect([...cache.pinnedToTop.entries()]).toEqual([[2, 0], [1, 1], [4, 2]]);
    expect(cache.pinnedStories).toEqual([2, 1, 4, 3]);
  });
});
