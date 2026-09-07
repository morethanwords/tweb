import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import deferredPromise from '@helpers/cancellablePromise';
import {getMiddleware} from '@helpers/middleware';
import '@helpers/peerIdPolyfill';

const mocks = vi.hoisted(() => ({
  addDialogNew: vi.fn()
}));

vi.mock('@lib/appDialogsManager', () => ({default: {addDialogNew: mocks.addDialogNew}}));
vi.mock('@components/selectorSearch', () => ({default: class {}}));
vi.mock('@components/popups/premium', () => ({default: class {}}));
vi.mock('@lib/rootScope', () => ({default: {}}));
vi.mock('@lib/apiManagerProxy', () => ({default: {}}));
vi.mock('@lib/langPack', () => ({i18n: vi.fn()}));
vi.mock('@components/emptyPlaceholder', () => ({default: vi.fn()}));
vi.mock('@helpers/dialogsPlaceholder', () => ({default: class {}}));
vi.mock('@components/wrappers/peerTitle', () => ({default: vi.fn()}));
vi.mock('@components/wrappers/getChatMembersString', () => ({default: vi.fn()}));
vi.mock('@components/wrappers/getUserStatusString', () => ({default: vi.fn()}));
vi.mock('@richTextProcessor/wrapEmojiText', () => ({default: vi.fn()}));
vi.mock('@helpers/dom/createContextMenu', () => ({default: vi.fn()}));

import AppSelectPeers from '@components/appSelectPeers';

describe('selector dialog readiness', () => {
  let selector: AppSelectPeers;
  let middlewareHelper: ReturnType<typeof getMiddleware>;
  let titles: Map<PeerId, ReturnType<typeof deferredPromise<void>>>;
  let avatars: Map<PeerId, ReturnType<typeof deferredPromise<void>>>;

  const peerId = (id: number) => id.toPeerId();
  const render = (ids: PeerId[], append?: boolean): Promise<void> => (selector as any).renderResults(ids, append);

  beforeEach(() => {
    middlewareHelper = getMiddleware();
    titles = new Map();
    avatars = new Map();
    mocks.addDialogNew.mockImplementation((options) => {
      const container = document.createElement('a');
      container.dataset.peerId = '' + options.peerId;
      const title = document.createElement('span');
      const avatar = document.createElement('span');
      const subtitle = document.createElement('span');
      container.append(title, avatar, subtitle);
      const titleReady = deferredPromise<void>();
      const avatarReady = deferredPromise<void>();
      titles.set(options.peerId, titleReady);
      avatars.set(options.peerId, avatarReady);
      options.loadPromises?.push(
        titleReady.then(() => title.textContent = 'Title'),
        avatarReady.then(() => avatar.textContent = 'Avatar')
      );
      if(options.container) {
        options.container[options.append === false ? 'prepend' : 'append'](container);
      }
      const rowMiddlewareHelper = options.wrapOptions.middleware.create();
      const dialogElement = {
        container,
        middlewareHelper: rowMiddlewareHelper,
        dom: {containerEl: container, lastMessageSpan: subtitle},
        remove: () => {
          rowMiddlewareHelper.destroy();
          container.remove();
        }
      };
      (container as any).dialogElement = dialogElement;
      return dialogElement;
    });
    selector = Object.assign(Object.create(AppSelectPeers.prototype), {
      list: document.createElement('ul'),
      peerType: ['dialogs'],
      middlewareHelperLoader: middlewareHelper,
      multiSelect: 'disabled',
      selected: new Set(),
      renderedPeerIds: new Set(),
      pendingLists: new Set(),
      wrapSubtitle: vi.fn(async() => document.createTextNode('Subtitle'))
    });
    document.body.append(selector.list);
  });

  afterEach(() => {
    middlewareHelper.destroy();
    document.body.replaceChildren();
    vi.clearAllMocks();
  });

  it('keeps rows detached until the title, avatar, subtitle and customization are ready', async() => {
    const subtitle = deferredPromise<HTMLElement>();
    const customization = deferredPromise<void>();
    Object.assign(selector, {
      getSubtitleForElement: () => subtitle,
      processElementAfter: () => customization
    });
    const rendering = render([peerId(1)]);
    let finished = false;
    rendering.then(() => finished = true);
    expect(selector.list.childElementCount).toBe(0);
    const subtitleElement = document.createElement('span');
    subtitleElement.textContent = 'Custom subtitle';
    subtitle.resolve(subtitleElement);
    customization.resolve();
    await vi.waitFor(() => expect(mocks.addDialogNew.mock.results[0].value.dom.lastMessageSpan.textContent).toBe('Custom subtitle'));
    expect(finished).toBe(false);
    expect(selector.list.childElementCount).toBe(0);
    titles.get(peerId(1)).resolve();
    await Promise.resolve();
    expect(selector.list.childElementCount).toBe(0);
    avatars.get(peerId(1)).resolve();
    await rendering;
    expect(selector.list.textContent).toBe('TitleAvatarCustom subtitle');
  });

  it.each([true, false])('preserves batch order when append is %s despite out-of-order readiness', async(append) => {
    const existing = document.createElement('a');
    existing.dataset.peerId = '9';
    selector.list.append(existing);
    const rendering = render([peerId(1), peerId(2)], append);
    titles.get(peerId(2)).resolve();
    avatars.get(peerId(2)).resolve();
    await Promise.resolve();
    expect(selector.list.children).toHaveLength(1);
    titles.get(peerId(1)).resolve();
    avatars.get(peerId(1)).resolve();
    await rendering;
    expect([...selector.list.children].map((element) => (element as HTMLElement).dataset.peerId))
    .toEqual(append ? ['9', '1', '2'] : ['2', '1', '9']);
  });

  it.each(['subtitle', 'customization'])('waits for %s even when the title and avatar are ready', async(stage) => {
    const ready = deferredPromise<void>();
    const processElementAfter = vi.fn(async() => {
      if(stage === 'customization') await ready;
    });
    Object.assign(selector, {
      getSubtitleForElement: async() => {
        if(stage === 'subtitle') await ready;
        return document.createElement('span');
      },
      processElementAfter
    });
    const rendering = render([peerId(1)]);
    titles.get(peerId(1)).resolve();
    avatars.get(peerId(1)).resolve();
    if(stage === 'customization') await vi.waitFor(() => expect(processElementAfter).toHaveBeenCalled());
    expect(selector.list.children).toHaveLength(0);
    ready.resolve();
    await rendering;
    expect(selector.list.children).toHaveLength(1);
  });

  it.each([true, false])('preserves insertion order across concurrent batches when append is %s', async(append) => {
    const first = render([peerId(1)], append);
    const second = render([peerId(2)], append);
    titles.get(peerId(2)).resolve();
    avatars.get(peerId(2)).resolve();
    await second;
    titles.get(peerId(1)).resolve();
    avatars.get(peerId(1)).resolve();
    await first;
    expect([...selector.list.children].map((element) => (element as HTMLElement).dataset.peerId))
    .toEqual(append ? ['1', '2'] : ['2', '1']);
  });

  it('uses the current selection when a pending row becomes visible', async() => {
    selector.multiSelect = 'enabled';
    selector.selected.add(peerId(1));
    const rendering = render([peerId(1), peerId(2)]);
    selector.selected.delete(peerId(1));
    selector.selected.add(peerId(2));
    for(const ready of [...titles.values(), ...avatars.values()]) ready.resolve();
    await rendering;
    expect([...selector.list.querySelectorAll('input')].map((input) => input.checked)).toEqual([false, true]);
  });

  it('does not create stale rows if a search changes during contact filtering', async() => {
    const filtered = deferredPromise<boolean>();
    Object.assign(selector, {
      peerType: ['contacts'],
      loadedWhat: {contacts: true},
      managers: {appUsersManager: {isNonContactUser: () => filtered}}
    });
    const rendering = render([peerId(1)]);
    middlewareHelper.clean();
    filtered.resolve(true);
    await rendering;
    expect(mocks.addDialogNew).not.toHaveBeenCalled();
  });

  it('does not wait for or reinsert a peer removed while its row was loading', async() => {
    const subtitle = deferredPromise<HTMLElement>();
    const processElementAfter = vi.fn();
    Object.assign(selector, {
      getSubtitleForElement: (key: PeerId) => key === peerId(1) ? subtitle : document.createElement('span'),
      processElementAfter
    });
    const rendering = render([peerId(1), peerId(2)]);
    Object.assign(selector, {promise: rendering});
    selector.deletePeerId(peerId(1));
    titles.get(peerId(2)).resolve();
    avatars.get(peerId(2)).resolve();
    await rendering;
    expect([...selector.list.children].map((element) => (element as HTMLElement).dataset.peerId)).toEqual(['2']);
    expect((selector as any).pendingLists.size).toBe(0);
    subtitle.resolve(document.createElement('span'));
    await subtitle;
    expect(processElementAfter.mock.calls.map(([key]) => key)).toEqual([peerId(2)]);
  });

  it.each(['clean', 'destroy'] as const)('discards a pending batch after middleware %s', async(action) => {
    const oldList = selector.list;
    const rendering = render([peerId(1)]);
    middlewareHelper[action]();
    selector.list = document.createElement('ul');
    document.body.append(selector.list);
    await rendering;
    expect(oldList.children).toHaveLength(0);
    expect(oldList.childNodes).toHaveLength(0);
    expect(selector.list.children).toHaveLength(0);
  });
});
