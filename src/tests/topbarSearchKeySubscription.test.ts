import {vi} from 'vitest';
import '@helpers/peerIdPolyfill';
import {createRoot} from 'solid-js';
import {getMiddleware} from '@helpers/middleware';
import pause from '@helpers/schedulers/pause';
import rootScope from '@lib/rootScope';
import {createSearchLoader} from '@components/chat/topbarSearch';

vi.mock('@components/chat/chat', () => ({default: {}}));
vi.mock('@components/chat/reactions', () => ({default: {}}));
vi.mock('@components/chat/reaction', () => ({default: {}}));
vi.mock('@components/appSelectPeers', () => ({default: {}}));
vi.mock('@components/stories/openStoriesSearch', () => ({default: {}}));
vi.mock('@components/popups/datePicker', () => ({default: {}}));
vi.mock('@components/avatarNew', () => ({default: {}}));
vi.mock('@components/stackedAvatars', () => ({default: {}}));
vi.mock('@components/peerTitle', () => ({default: {}}));
vi.mock('@components/wrappers/peerTitle', () => ({default: {}}));
vi.mock('@lib/richTextProcessor/wrapEmojiText', () => ({default: {}}));
vi.mock('@components/inputSearch', () => ({default: {}}));
vi.mock('@components/scrollable2', () => ({default: {}}));
vi.mock('@components/rowTsx', () => ({default: {}}));
vi.mock('@components/buttonIconTsx', () => ({default: {}}));
vi.mock('@components/buttonCorner', () => ({default: {}}));
vi.mock('@components/a11yButton', () => ({default: {}}));
vi.mock('@components/icon', () => ({default: {}}));
vi.mock('@helpers/solid/animations', () => ({default: {}}));
vi.mock('@stores/premium', () => ({default: {}}));
vi.mock('@lib/apiManagerProxy', () => ({default: {}}));

/*
 * A search in a chat's top bar holds its found list in the worker while it is on (a hashtag looked for in my messages
 * or in public posts is kept there by its key and answered from it). The hold was taken for every page: a page loaded
 * on a scroll, with no owner to give its release to, kept the list for good - and the same hashtag looked for again
 * came back from it, without what was posted since.
 */

test('a search scrolled to more pages lets its found list go when it ends', async() => {
  const held = new Map<string, number>();
  rootScope.managers = {
    appMessagesManager: {
      toggleHistoryKeySubscription: (key: string, subscribe: boolean) => {
        held.set(key, (held.get(key) || 0) + (subscribe ? 1 : -1));
      },
      getHistory: async() => ({count: 90, history: [] as number[], messages: [] as any[], isEnd: {top: false, bottom: true, both: false}})
    }
  } as any;

  const middlewareHelper = getMiddleware();
  let loadMore: () => Promise<void>, dispose: () => void;
  createRoot((_dispose) => {
    dispose = _dispose;
    const loader = createSearchLoader({
      middleware: middlewareHelper.get(),
      rowsMiddleware: middlewareHelper.get(),
      peerId: (7).toPeerId(true),
      threadId: undefined,
      monoforumThreadId: undefined,
      query: '#tag',
      searchType: 'my'
    });
    loadMore = loader().loadMore;
    loadMore();
  });

  await pause(0);
  // * the next page, on a scroll: outside of any reactive owner
  await loadMore();
  expect([...held.values()].some(Boolean)).toBe(true);

  dispose();
  middlewareHelper.destroy();
  expect([...held.values()].every((count) => count === 0)).toBe(true);
});
