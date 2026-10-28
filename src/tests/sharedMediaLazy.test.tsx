import {beforeEach, describe, expect, it, vi} from 'vitest';
import '@helpers/peerIdPolyfill';
import AppSharedMediaTab from '@components/sidebarRight/tabs/sharedMediaTab';

const mocks = vi.hoisted(() => ({
  tab: undefined as AppSharedMediaTab,
  render: vi.fn(),
  setQuery: vi.fn(),
  applyProfile: vi.fn(),
  fillProfileElements: vi.fn(),
  loadSidebarMedia: vi.fn(),
  setSearchTab: vi.fn(),
  open: vi.fn()
}));

vi.mock('@components/slider', () => ({
  default: class {},
  SliderSuperTab: class {
    public scrollable = {append: vi.fn(), onScroll: vi.fn()};
    public searchSuper = {destroy: vi.fn()};
    open() {
      mocks.open();
    }
    onCloseAfterTimeout() {}
  }
}));

vi.mock('@lib/rootScope', () => ({default: {myId: 1}}));
vi.mock('@lib/solidjs/hotReloadGuardProvider', () => ({
  default: (props: {children: unknown}) => props.children
}));
vi.mock('@components/solidJsTabs/promiseCollector', () => ({
  PromiseCollector: Object.assign((props: {children: unknown}) => props.children, {
    createHelper: () => ({onCollect: vi.fn(), await: () => Promise.resolve()})
  })
}));
vi.mock('@components/solidJsTabs/superTabProvider', () => ({
  SuperTabProvider: (props: {self: AppSharedMediaTab, children: unknown}) => {
    mocks.tab = props.self;
    return props.children;
  }
}));
vi.mock('@components/sidebarRight/tabs/sharedMedia', () => ({
  default: (): null => {
    mocks.render();
    (mocks.tab as any)._impl = {
      setQuery: mocks.setQuery,
      fillProfileElements: mocks.fillProfileElements,
      loadSidebarMedia: mocks.loadSidebarMedia,
      setSearchTab: mocks.setSearchTab
    };
    return null;
  }
}));

function createTab() {
  const tab = new AppSharedMediaTab(undefined);
  tab.setPeer(2 as PeerId);
  return tab;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.fillProfileElements.mockResolvedValue(mocks.applyProfile);
  // A slow media request must not hold back the profile.
  mocks.loadSidebarMedia.mockReturnValue(new Promise(() => {}));
});

describe('shared media is loaded when it becomes visible', () => {
  it('does not construct a profile or request media when a hidden chat changes', async() => {
    const tab = createTab();
    tab.setPeer(3 as PeerId);
    await Promise.resolve();

    expect(mocks.render).not.toHaveBeenCalled();
    expect(mocks.fillProfileElements).not.toHaveBeenCalled();
    expect(mocks.loadSidebarMedia).not.toHaveBeenCalled();
    tab.destroy();
  });

  it('initializes the profile once when opened and starts media without waiting for the network', async() => {
    const tab = createTab();
    await Promise.all([tab.init(), tab.ensureLoaded()]);
    await tab.ensureLoaded();

    expect(mocks.render).toHaveBeenCalledOnce();
    expect(mocks.setQuery).toHaveBeenCalledOnce();
    expect(mocks.fillProfileElements).toHaveBeenCalledOnce();
    expect(mocks.applyProfile).toHaveBeenCalledOnce();
    expect(mocks.loadSidebarMedia).toHaveBeenCalledExactlyOnceWith(true, undefined);
    tab.destroy();
  });

  it('applies an already prepared visible profile once when the chat installs it', async() => {
    const tab = createTab();
    const apply = await tab.fillProfileElements();
    expect(mocks.applyProfile).not.toHaveBeenCalled();
    apply();
    await tab.ensureLoaded();

    expect(mocks.fillProfileElements).toHaveBeenCalledOnce();
    expect(mocks.applyProfile).toHaveBeenCalledOnce();
    expect(mocks.loadSidebarMedia).toHaveBeenCalledOnce();
    tab.destroy();
  });

  it('selects a deep-link media tab after the initial load has selected its default tab', async() => {
    const tab = createTab();
    let finishInitialLoad: () => void;
    let selected = '';
    mocks.loadSidebarMedia.mockReturnValue(new Promise<void>((resolve) => {
      finishInitialLoad = () => {
        selected = 'media';
        resolve();
      };
    }));
    mocks.setSearchTab.mockImplementation((type) => selected = type);
    const selectedTab = tab.setSearchTab('gifts');
    await tab.ensureLoaded();
    expect(mocks.setSearchTab).not.toHaveBeenCalled();
    finishInitialLoad();
    await selectedTab;

    expect(mocks.render).toHaveBeenCalledOnce();
    expect(mocks.applyProfile).toHaveBeenCalledOnce();
    expect(mocks.setSearchTab).toHaveBeenCalledExactlyOnceWith('gifts');
    expect(selected).toBe('gifts');
    tab.destroy();
  });

  it('does not mount a hidden profile after its chat was destroyed', async() => {
    const tab = createTab();
    const ready = tab.ensureLoaded();
    tab.destroy();
    await ready;

    expect(mocks.render).not.toHaveBeenCalled();
    expect(mocks.applyProfile).not.toHaveBeenCalled();
    expect(mocks.loadSidebarMedia).not.toHaveBeenCalled();
  });

  it('does not navigate back to a discarded chat when its profile finishes opening', async() => {
    const tab = createTab();
    const opened = tab.open();
    tab.destroy();
    await opened;

    expect(mocks.open).not.toHaveBeenCalled();
  });

  it('does not reopen a sidebar that was hidden while its profile was loading', async() => {
    const tab = createTab();
    let shown = true;
    const opened = tab.open(() => shown);
    shown = false;
    await opened;

    expect(mocks.open).not.toHaveBeenCalled();
    await tab.open();
    expect(mocks.open).toHaveBeenCalledOnce();
    tab.destroy();
  });

  it('does not apply a deep-link tab after its chat was destroyed during the first media load', async() => {
    const tab = createTab();
    let finishInitialLoad: () => void;
    mocks.loadSidebarMedia.mockReturnValue(new Promise<void>((resolve) => finishInitialLoad = resolve));
    const selectedTab = tab.setSearchTab('stories');
    await tab.ensureLoaded();
    tab.destroy();
    finishInitialLoad();
    await selectedTab;

    expect(mocks.setSearchTab).not.toHaveBeenCalled();
  });

  it('drops a prepared callback when its tab has switched to another peer', async() => {
    const tab = createTab();
    const apply = await tab.fillProfileElements();
    tab.setPeer(3 as PeerId);
    apply();
    expect(mocks.applyProfile).not.toHaveBeenCalled();

    await tab.ensureLoaded();
    expect(mocks.fillProfileElements).toHaveBeenCalledTimes(2);
    expect(mocks.applyProfile).toHaveBeenCalledOnce();
    expect(mocks.loadSidebarMedia).toHaveBeenCalledOnce();
    tab.destroy();
  });
});
