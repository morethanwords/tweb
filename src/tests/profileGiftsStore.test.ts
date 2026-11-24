import '@helpers/peerIdPolyfill';
import {createRoot, createSignal} from 'solid-js';
import {StarGiftCollection} from '@layer';

const mocks = vi.hoisted(() => ({
  getProfileGifts: vi.fn(),
  // * taken, unless a test answers them by hand
  toggleChatGiftNotifications: vi.fn((_peerId: PeerId, _enabled: boolean) => Promise.resolve<unknown>(true)),
  reorderCollections: vi.fn((_peerId: PeerId, _order: number[]) => Promise.resolve<unknown>(true)),
  // * what the server holds, read after a refusal
  getChatGiftNotifications: vi.fn((_peerId: PeerId) => Promise.resolve<boolean>(undefined)),
  getCollections: vi.fn((_peerId: PeerId) => Promise.resolve<StarGiftCollection[]>(undefined))
}));

vi.mock('@lib/rootScope', () => ({
  default: {
    myId: 1,
    managers: {
      appGiftsManager: {
        getProfileGifts: mocks.getProfileGifts,
        toggleChatGiftNotifications: mocks.toggleChatGiftNotifications,
        reorderCollections: mocks.reorderCollections,
        getChatGiftNotifications: mocks.getChatGiftNotifications,
        getCollections: mocks.getCollections
      }
    },
    addEventListener: vi.fn(),
    removeEventListener: vi.fn()
  }
}));
vi.mock('@components/stargifts/canManageGifts', () => ({
  getCanManagePeerGifts: () => Promise.resolve(true)
}));

import {ALL_COLLECTIONS_ID, createProfileGiftsStore} from '@components/stargifts/profileStore';
import rootScope from '@lib/rootScope';
import {attachReorder, moveInRun, ReorderBarContent, SelectionPlate} from '@components/reorderMode';
import Modes from '@config/modes';

const PEER_ID = (100 as ChatId).toPeerId(true);

const collection = (id: number): StarGiftCollection => ({
  _: 'starGiftCollection',
  collection_id: id,
  title: `${id}`,
  gifts_count: 0,
  hash: 0
} as StarGiftCollection);

function makeStore() {
  let dispose: VoidFunction;
  const onSaveFailed = vi.fn();
  const [store, actions] = createRoot((_dispose) => {
    dispose = _dispose;
    return createProfileGiftsStore({peerId: PEER_ID, onSaveFailed});
  });

  return {store, actions, onSaveFailed, dispose};
}

/** Each call of `fn` from now on, answered by the test, in the order they were made */
function answerByHand(fn: typeof mocks.reorderCollections | typeof mocks.toggleChatGiftNotifications | typeof mocks.getProfileGifts) {
  const calls: {resolve: (value: unknown) => void, reject: (err: unknown) => void}[] = [];
  fn.mockImplementation(() => new Promise((resolve, reject) => calls.push({resolve, reject})));
  return calls;
}

const flush = () => new Promise((resolve) => setTimeout(resolve));

afterEach(() => {
  vi.clearAllMocks();
  mocks.toggleChatGiftNotifications.mockReset();
  mocks.reorderCollections.mockReset();
  mocks.getChatGiftNotifications.mockReset();
  mocks.getCollections.mockReset();
});

test('takes the channel\'s gift notifications from the list, and puts them back when the server refuses a toggle', async() => {
  mocks.getProfileGifts.mockResolvedValue({next: '', gifts: [], count: 0, collections: [], chatNotificationsEnabled: false});
  const {store, actions, onSaveFailed, dispose} = makeStore();

  await actions.loadNext();
  expect(store.chatNotificationsEnabled).toBe(false);

  const calls = answerByHand(mocks.toggleChatGiftNotifications);
  actions.toggleChatNotifications(true);
  // * at once, before the server answers
  expect(store.chatNotificationsEnabled).toBe(true);
  await flush();
  expect(mocks.toggleChatGiftNotifications).toHaveBeenCalledWith(PEER_ID, true);

  // * as the server holds it, read again after the refusal
  mocks.getChatGiftNotifications.mockResolvedValueOnce(false);
  calls[0].reject({type: 'CHAT_ADMIN_REQUIRED'});
  await flush();
  expect(mocks.getChatGiftNotifications).toHaveBeenCalledExactlyOnceWith(PEER_ID);
  expect(store.chatNotificationsEnabled).toBe(false);
  expect(onSaveFailed).toHaveBeenCalledOnce();

  actions.toggleChatNotifications(true);
  await flush();
  calls[1].resolve(true);
  await flush();
  expect(store.chatNotificationsEnabled).toBe(true);

  // * not to be had either: not known, so nothing is offered to change
  actions.toggleChatNotifications(false);
  mocks.getChatGiftNotifications.mockRejectedValueOnce({type: 'NETWORK_BAD_REQUEST'});
  await flush();
  calls[2].reject({type: 'FLOOD_WAIT_X'});
  await flush();
  expect(store.chatNotificationsEnabled).toBeUndefined();
  dispose();
});

test('a toggle has the last word over a page asked for before it, and overlapping toggles end on what the server holds', async() => {
  mocks.getProfileGifts.mockResolvedValueOnce({next: '', gifts: [], count: 0, collections: [], chatNotificationsEnabled: false});
  const {store, actions, onSaveFailed, dispose} = makeStore();
  await actions.loadNext();

  // * asked for before the toggle, answered after it is saved
  let resolvePage: (page: unknown) => void;
  mocks.getProfileGifts.mockReturnValueOnce(new Promise((resolve) => resolvePage = resolve));
  const page = actions.loadNext(true);
  actions.toggleChatNotifications(true);
  await flush();
  resolvePage({next: '', gifts: [], count: 0, chatNotificationsEnabled: false});
  await page;
  expect(store.chatNotificationsEnabled).toBe(true);

  // * one asked for after it is the manager's to answer after the toggle: it is taken
  mocks.getProfileGifts.mockResolvedValueOnce({next: '', gifts: [], count: 0, chatNotificationsEnabled: false});
  await actions.loadNext(true);
  expect(store.chatNotificationsEnabled).toBe(false);

  // * on and off again before either is answered: the first is taken, the second refused
  const calls = answerByHand(mocks.toggleChatGiftNotifications);
  actions.toggleChatNotifications(true);
  actions.toggleChatNotifications(false);
  await flush();
  // * both handed to the manager at once: its queue sends them one after another
  expect(calls).toHaveLength(2);
  calls[0].resolve(true);
  await flush();
  mocks.getChatGiftNotifications.mockResolvedValueOnce(true);
  calls[1].reject({type: 'FLOOD_WAIT_X'});
  await flush();
  // * on, as the server has it
  expect(store.chatNotificationsEnabled).toBe(true);
  expect(onSaveFailed).toHaveBeenCalledOnce();
  dispose();
});

test('a plate that comes makes the one shown in the row give way, and the row stays on for it', () => {
  const mount = document.createElement('div');
  const [storiesShown, setStoriesShown] = createSignal(true);
  const [giftsShown, setGiftsShown] = createSignal(false);
  const storiesGiveWay = vi.fn(() => setStoriesShown(false));
  const dispose = createRoot((dispose) => {
    SelectionPlate({shown: storiesShown, mount, giveWay: storiesGiveWay, children: document.createElement('div')});
    SelectionPlate({shown: giftsShown, mount, giveWay: () => setGiftsShown(false), children: document.createElement('div')});
    return dispose;
  });
  expect(mount.classList.contains('is-selecting')).toBe(true);

  setGiftsShown(true);
  expect(storiesGiveWay).toHaveBeenCalledOnce();
  expect(storiesShown()).toBe(false);
  expect(mount.classList.contains('is-selecting')).toBe(true);
  expect(mount.classList.contains('forwards')).toBe(true);

  setGiftsShown(false);
  expect(mount.classList.contains('is-selecting')).toBe(false);
  dispose();
});

test('with the layer, Done taking the focus away as the reorder ends hands it to the list\'s chosen chip', () => {
  Modes.a11y = true;
  try {
    const list = document.createElement('div');
    const chips = [1, 2].map((id) => {
      const chip = document.createElement('div');
      chip.tabIndex = -1;
      chip.dataset.value = `${id}`;
      chip.setAttribute('aria-selected', `${id === 2}`);
      return chip;
    });
    list.append(...chips);
    const [active, setActive] = createSignal(true);
    let bar: HTMLElement;
    const dispose = createRoot((dispose) => {
      attachReorder({list, axis: 'x', scrollable: {container: list}, active, key: 'value', onMove: vi.fn()});
      bar = ReorderBarContent({titleKey: 'Gift2Reorder', onDone: () => setActive(false)}) as HTMLElement;
      return dispose;
    });
    const elsewhere = document.createElement('button');
    document.body.append(list, bar, elsewhere);

    bar.querySelector('button').focus();
    setActive(false);
    expect(document.activeElement).toBe(chips[1]);

    // * a focus put elsewhere stays there
    setActive(true);
    elsewhere.focus();
    setActive(false);
    expect(document.activeElement).toBe(elsewhere);
    dispose();
    document.body.replaceChildren();
  } finally {
    Modes.a11y = false;
  }
});

test('the row the lists\' bars share shows while any of them is on, and a bar waiting in it stays hidden', () => {
  const mount = document.createElement('div');
  const [storiesShown, setStoriesShown] = createSignal(false);
  const plate = (shown: () => boolean, children: HTMLElement) => createRoot((dispose) => {
    SelectionPlate({shown, mount, children});
    return dispose;
  });
  const gifts = document.createElement('div'), stories = document.createElement('div');
  const disposeGifts = plate(() => true, gifts);
  // * mounted idle while the other is on: the row stays as it is
  const disposeStories = plate(storiesShown, stories);
  expect(mount.classList.contains('is-selecting')).toBe(true);
  expect(stories.parentElement.classList.contains('search-super-selection-idle')).toBe(true);
  expect(gifts.parentElement.classList.contains('search-super-selection-idle')).toBe(false);

  setStoriesShown(true);
  expect(stories.parentElement.classList.contains('search-super-selection-idle')).toBe(false);
  disposeGifts();
  // * one is still on
  expect(mount.classList.contains('is-selecting')).toBe(true);
  setStoriesShown(false);
  expect(mount.classList.contains('is-selecting')).toBe(false);
  expect(mount.classList.contains('backwards')).toBe(true);
  disposeStories();
});

test('leaves the notifications unknown where the list does not say them', async() => {
  mocks.getProfileGifts.mockResolvedValue({next: '', gifts: [], count: 0, collections: []});
  const {store, actions, dispose} = makeStore();

  await actions.loadNext();
  expect(store.chatNotificationsEnabled).toBeUndefined();
  dispose();
});

test('puts the collections in the order they were dragged into, and back in the one the server holds when it refuses the newest', async() => {
  mocks.getProfileGifts.mockResolvedValue({next: '', gifts: [], count: 0, collections: [collection(1), collection(2), collection(3)]});
  const {store, actions, onSaveFailed, dispose} = makeStore();
  await actions.loadNext();
  const order = () => store.collections.map((it) => it.collection_id);
  const calls = answerByHand(mocks.reorderCollections);

  actions.reorderCollections([3, 1, 2]);
  expect(order()).toEqual([3, 1, 2]);
  actions.reorderCollections([1, 3, 2]);
  await flush();
  // * both handed to the manager at once, in the order dropped: its queue sends them one after another
  expect(mocks.reorderCollections.mock.calls).toEqual([[PEER_ID, [3, 1, 2]], [PEER_ID, [1, 3, 2]]]);
  calls[0].resolve(true);
  await flush();
  // * read again after the refusal: the first drop, which the server took
  mocks.getCollections.mockResolvedValueOnce([collection(3), collection(1), collection(2)]);
  calls[1].reject({type: 'FLOOD_WAIT_X'});
  await flush();
  expect(mocks.getCollections).toHaveBeenCalledExactlyOnceWith(PEER_ID);
  expect(order()).toEqual([3, 1, 2]);
  expect(onSaveFailed).toHaveBeenCalledOnce();

  // * a refusal with a newer drop behind it leaves the order to that one
  actions.reorderCollections([2, 3, 1]);
  actions.reorderCollections([2, 1, 3]);
  await flush();
  calls[2].reject({type: 'FLOOD_WAIT_X'});
  await flush();
  calls[3].resolve(true);
  await flush();
  expect(order()).toEqual([2, 1, 3]);
  expect(onSaveFailed).toHaveBeenCalledOnce();
  dispose();
});

test('the ids of a run, with the dragged one moved', () => {
  const items = [1, 2, 3, 4].map((id) => {
    const element = document.createElement('div');
    element.dataset.value = `${id}`;
    return element;
  });

  expect(moveInRun(items, 0, 2, 'value')).toEqual([2, 3, 1, 4]);
  expect(moveInRun(items, 3, 0, 'value')).toEqual([4, 1, 2, 3]);
});

test('a page that failed is asked for again by the next scroll', async() => {
  mocks.getProfileGifts.mockRejectedValueOnce({type: 'FLOOD_WAIT_120'});
  mocks.getProfileGifts.mockResolvedValue({next: '', gifts: [], count: 0, collections: []});
  const {store, actions, dispose} = makeStore();

  await actions.loadNext().catch(() => {});
  expect(store.loading).toBe(false);

  await actions.loadNext();
  expect(mocks.getProfileGifts).toHaveBeenCalledTimes(2);
  dispose();
});

const gift = (slug: string) => ({type: 'stargift', raw: {_: 'starGiftUnique', slug}} as any);
const slugs = (items: {raw: unknown}[]) => items.map((item) => (item.raw as any).slug);

/** All loaded, collection 5 among its collections; then collection 5 opened and left for All before its first page came */
async function leaveCollectionBeforeItsFirstPage() {
  const pages = answerByHand(mocks.getProfileGifts);
  const {store, actions, dispose} = makeStore();

  const all = actions.loadNext();
  pages[0].resolve({next: '', gifts: [gift('mine')], count: 1, collections: [collection(5)]});
  await all;

  actions.setFilters({chosenCollection: 5}); // * not loaded yet: asked for
  actions.setFilters({chosenCollection: ALL_COLLECTIONS_ID}); // * back to All, from what was loaded
  return {pages, store, actions, dispose};
}

test('a collection\'s page still on its way does not land in the collection switched back to', async() => {
  const {pages, store, dispose} = await leaveCollectionBeforeItsFirstPage();
  pages[1].resolve({next: '', gifts: [gift('collection')], count: 1});
  await flush();

  expect(slugs(store.items)).toEqual(['mine']);
  dispose();
});

test('a refresh of the list that failed is replaced, not added to, by the page asked for again', async() => {
  const pages = answerByHand(mocks.getProfileGifts);
  const {store, actions, dispose} = makeStore();
  const first = actions.loadNext();
  pages[0].resolve({next: 'more', gifts: [gift('old')], count: 2, collections: []});
  await first;
  await flush();

  const [, onListUpdate] = vi.mocked(rootScope.addEventListener).mock.calls.find(([name]) => name === 'star_gift_list_update');
  vi.useFakeTimers();
  try {
    (onListUpdate as (event: {peerId: PeerId}) => void)({peerId: PEER_ID}); // * a gift came: the list is asked for anew
    await vi.advanceTimersByTimeAsync(500);
    pages[1].reject({type: 'FLOOD_WAIT_120'});
    await vi.advanceTimersByTimeAsync(0);
  } finally {
    vi.useRealTimers();
  }

  const next = actions.loadNext(); // * the next scroll
  pages[2].resolve({next: '', gifts: [gift('new'), gift('old')], count: 2});
  await next;

  expect(slugs(store.items)).toEqual(['new', 'old']);
  dispose();
});

test('a collection left before its first page came is asked for again when opened again', async() => {
  const {pages, store, actions, dispose} = await leaveCollectionBeforeItsFirstPage();
  actions.setFilters({chosenCollection: 5}); // * its first page still not here
  pages[pages.length - 1].resolve({next: '', gifts: [gift('collection')], count: 1});
  await flush();

  expect(slugs(store.items)).toEqual(['collection']);
  dispose();
});

test('a collection left while its next page comes keeps the pages it had, and goes on from them', async() => {
  const pages = answerByHand(mocks.getProfileGifts);
  const {store, actions, dispose} = makeStore();
  const first = actions.loadNext();
  pages[0].resolve({next: 'more', gifts: [gift('first')], count: 2, collections: [collection(5)]});
  await first;

  actions.loadNext(); // * a scroll: the next page on its way
  actions.setFilters({chosenCollection: 5});
  actions.setFilters({chosenCollection: ALL_COLLECTIONS_ID});
  expect(slugs(store.items)).toEqual(['first']);
  const requests = mocks.getProfileGifts.mock.calls.length;

  const next = actions.loadNext();
  expect(mocks.getProfileGifts).toHaveBeenCalledTimes(requests + 1);
  expect(mocks.getProfileGifts.mock.lastCall[0]).toMatchObject({offset: 'more', collectionId: undefined});
  pages[pages.length - 1].resolve({next: '', gifts: [gift('second')], count: 2});
  await next;

  expect(slugs(store.items)).toEqual(['first', 'second']);
  dispose();
});
