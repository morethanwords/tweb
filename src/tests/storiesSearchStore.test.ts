vi.mock('@lib/rootScope', async() => {
  const {default: EventListenerBase} = await import('@helpers/eventListenerBase');
  const rootScope: any = new EventListenerBase();
  rootScope.managers = {
    appStoriesManager: {
      searchStories: vi.fn(),
      getStealthMode: () => Promise.resolve({_: 'storiesStealthMode'}),
      getListPositions: () => Promise.resolve({})
    }
  };
  return {default: rootScope};
});

import {createRoot} from 'solid-js';
import rootScope from '@lib/rootScope';
import {createStoriesStore, StoriesContextValue} from '@components/stories/store';

const searchStories = rootScope.managers.appStoriesManager.searchStories as unknown as ReturnType<typeof vi.fn>;

const story = (id: number, caption = '') => ({_: 'storyItem', id, date: id, caption, pFlags: {}} as any);
const found = (peerId: number, id: number) => ({peerId: peerId as PeerId, story: story(id)});

const createSearch = () => createRoot((dispose) => {
  const store: StoriesContextValue = createStoriesStore({search: {hashtag: '#tag'}, manualLoad: true});
  return {store, dispose};
});

const listed = ([state]: StoriesContextValue) => state.peers.map((peer) => `${peer.peerId}_${peer.stories[0].id}`);

describe('stories found by a search', () => {
  beforeEach(() => {
    searchStories.mockReset();
  });

  it('keeps the order found across pages, drops a repeated story and counts by the server while pages remain', async() => {
    const {store, dispose} = createSearch();
    const [state, actions] = store;

    searchStories.mockResolvedValueOnce({count: 10, nextOffset: 'a', stories: [found(1, 5), found(2, 7), found(1, 3)]});
    await actions.load();
    expect(searchStories.mock.calls[0][0]).toMatchObject({hashtag: '#tag', offset: ''});
    expect(listed(store)).toEqual(['1_5', '2_7', '1_3']);
    expect(state.foundCount).toBe(10);
    expect(state.loaded).toBe(false);

    searchStories.mockResolvedValueOnce({count: 10, nextOffset: undefined, stories: [found(1, 3), found(3, 1)]});
    await actions.load();
    expect(searchStories.mock.calls[1][0]).toMatchObject({offset: 'a'});
    expect(listed(store)).toEqual(['1_5', '2_7', '1_3', '3_1']);
    // * the last page says how many there are, whatever the count before
    expect(state.foundCount).toBe(4);
    expect(state.loaded).toBe(true);

    await actions.load();
    expect(searchStories).toHaveBeenCalledTimes(2);
    dispose();
  });

  it('ends with nothing found when the server refuses', async() => {
    const {store, dispose} = createSearch();
    searchStories.mockRejectedValueOnce({type: 'HASHTAG_INVALID'});
    await store[1].load();
    expect(store[0]).toMatchObject({ready: true, loaded: true, foundCount: 0});
    expect(listed(store)).toEqual([]);
    dispose();
  });

  it('updates and deletes the very story of a peer found more than once, and keeps what the feed would change', async() => {
    const {store, dispose} = createSearch();
    const [state, actions] = store;
    searchStories.mockResolvedValueOnce({count: 3, nextOffset: undefined, stories: [found(1, 5), found(2, 7), found(1, 3)]});
    await actions.load();

    rootScope.dispatchEvent('story_update', {peerId: 1 as PeerId, story: story(3, 'edited')});
    expect((state.peers[2].stories[0] as any).caption).toBe('edited');
    expect((state.peers[0].stories[0] as any).caption).toBe('');

    // * neither the feed's order, nor its new stories, nor a story's 24 hours touch what was found
    rootScope.dispatchEvent('stories_position', {peerId: 1 as PeerId, position: undefined});
    rootScope.dispatchEvent('story_new', {peerId: 4 as PeerId, story: story(9), cacheType: undefined, maxReadId: 0});
    rootScope.dispatchEvent('story_expired', {peerId: 1 as PeerId, id: 5});
    expect(listed(store)).toEqual(['1_5', '2_7', '1_3']);

    rootScope.dispatchEvent('story_deleted', {peerId: 1 as PeerId, id: 3});
    expect(listed(store)).toEqual(['1_5', '2_7']);
    expect(state.foundCount).toBe(2);
    dispose();
  });
});
