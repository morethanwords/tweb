import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {render} from 'solid-js/web';
import {getMiddleware} from '@helpers/middleware';
import ListenerSetter from '@helpers/listenerSetter';
import rootScope from '@lib/rootScope';
import {simulateClickEvent} from '@helpers/dom/clickEvent';
import pause from '@helpers/schedulers/pause';
import makeStickerSet from '@/tests/mocks/stickerSet';
import {IntersectionObserverMock} from '@/tests/mocks/intersectionObserver';

const mocks = vi.hoisted(() => ({tab: undefined as any}));

vi.stubGlobal('IntersectionObserver', IntersectionObserverMock);

vi.mock('@components/solidJsTabs/superTabProvider', () => ({useSuperTab: () => [mocks.tab]}));
vi.mock('@lib/solidjs/hotReloadGuard', () => ({
  useHotReloadGuard: () => ({appImManager: {chat: {peerId: 0}}, appSidebarRight: {}})
}));
vi.mock('@components/popups/stickers', () => ({default: vi.fn()}));
vi.mock('@components/mediaPeek', () => ({default: vi.fn()}));
vi.mock('@components/wrappers/sticker', () => ({default: vi.fn()}));
vi.mock('@components/toastError', () => ({default: vi.fn()}));
vi.mock('@components/animationIntersector', () => ({default: {checkAnimations: vi.fn()}}));
vi.mock('@lib/richTextProcessor/wrapEmojiText', () => ({default: (text: string) => document.createTextNode(text)}));
vi.mock('@components/inputSearch', () => ({
  default: class InputSearch {
    public value = '';
    public container = document.createElement('div');
  }
}));

import Stickers from '@components/sidebarRight/tabs/stickers';

const stickerSet = (id: string, added?: boolean) => makeStickerSet(id, {count: 0, ...(added ? {installed_date: 100} : {})});

const flush = () => pause(0);

// * the manager runs in a worker: what the tab gets is a copy, and a change made there reaches the tab only as an event
const clone = <T, >(value: T): T => structuredClone(value);

describe('the trending sets: Add / Added', () => {
  let dispose: () => void;
  let kept: {[id: string]: any};
  let toggleStickerSet: ReturnType<typeof vi.fn>;

  beforeEach(async() => {
    kept = {'1': stickerSet('1'), '2': stickerSet('2', true)};
    // * as the manager's toggle does: the set kept there changes, and the tabs are told
    toggleStickerSet = vi.fn(async(set: any) => {
      const changed = kept[set.id];
      if(changed.installed_date) delete changed.installed_date;
      else changed.installed_date = 200;
      rootScope.dispatchEventSingle(changed.installed_date ? 'stickers_installed' : 'stickers_deleted', clone(changed));
      return true;
    });

    const container = document.createElement('div');
    const title = document.createElement('div');
    container.append(title);
    const scrollable = document.createElement('div');
    container.append(scrollable);
    mocks.tab = {
      middlewareHelper: getMiddleware(),
      listenerSetter: new ListenerSetter(),
      container,
      title,
      slider: {},
      scrollable: {
        container: scrollable,
        append: (element: HTMLElement) => scrollable.append(element),
        checkForTriggers: vi.fn()
      },
      managers: {
        appStickersManager: {
          getFeaturedStickers: async() => Object.values(kept).map((set) => ({_: 'stickerSetNoCovered', set: clone(set)})),
          getOldFeaturedStickers: async() => ({sets: [] as any[]}),
          getStickerSet: async({id}: {id: string}) => ({set: clone(kept[id]), documents: [] as any[]}),
          readFeaturedStickerSets: vi.fn(),
          toggleStickerSet
        }
      }
    };

    document.body.append(container);
    dispose = render(() => <Stickers />, document.createElement('div'));
    await flush();
  });

  afterEach(() => {
    dispose();
    mocks.tab.listenerSetter.removeAll();
    mocks.tab.container.remove();
  });

  const button = (id: string) => mocks.tab.scrollable.container.querySelector(
    `.sticker-set[data-sticker-set="${id}"] .sticker-set-button`
  ) as HTMLButtonElement;
  const isShownAdded = (id: string) => button(id).classList.contains('gray');

  it('shows a set as added once the button adds it, and a second press takes it out', async() => {
    expect(isShownAdded('1')).toBe(false);

    simulateClickEvent(button('1'));
    await flush();
    expect(toggleStickerSet).toHaveBeenCalledTimes(1);
    expect(kept['1'].installed_date).toBe(200);
    expect(isShownAdded('1')).toBe(true);

    simulateClickEvent(button('1'));
    await flush();
    expect(kept['1'].installed_date).toBeUndefined();
    expect(isShownAdded('1')).toBe(false);
  });

  it('follows a set added or taken out elsewhere - its popup, another device', async() => {
    expect(isShownAdded('2')).toBe(true);

    rootScope.dispatchEventSingle('stickers_deleted', {...stickerSet('2'), pFlags: {archived: true}, installed_date: 100});
    expect(isShownAdded('2')).toBe(false);

    rootScope.dispatchEventSingle('stickers_installed', stickerSet('1', true));
    expect(isShownAdded('1')).toBe(true);
  });
});
