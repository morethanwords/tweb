import {render} from 'solid-js/web';
import SidebarSlider, {SliderSuperTab} from '@components/slider';
import rootScope from '@lib/rootScope';
import AppSearchSuper, {SearchSuperMediaType} from '@components/appSearchSuper';
import SolidJSHotReloadGuardProvider from '@lib/solidjs/hotReloadGuardProvider';
import {PromiseCollector} from '@components/solidJsTabs/promiseCollector';
import {SuperTabProvider} from '@components/solidJsTabs/superTabProvider';

export type SharedMediaImpl = {
  setQuery: () => void;
  fillProfileElements: () => Promise<() => void>;
  loadSidebarMedia: (single: boolean, justLoad?: boolean) => Promise<any>;
  setSearchTab: (type: SearchSuperMediaType) => void;
  setLoadMutex: (promise: Promise<any>) => void;
};

/**
 * sharedMedia is a stateful per-chat controller, not a payload-rendered tab: its
 * setPeer/fillProfileElements/etc. are called (sometimes synchronously, before
 * open) by chat.ts and others. So this thin class owns the public API + state and
 * bridges to the heavy, dynamically-imported (HMR) Solid component which attaches
 * `_impl` and builds the UI. The only sync-critical op (setQuery) is deferred to
 * the first render; everything else either runs immediately once `_impl` exists
 * or awaits the render.
 */
export default class AppSharedMediaTab extends SliderSuperTab {
  public peerId: PeerId;
  public threadId: number;
  public isFirst: boolean;
  public noProfile: boolean;
  public peerChanged: boolean;
  public searchSuper: AppSearchSuper;

  private _impl: SharedMediaImpl;
  private _renderPromise: Promise<void>;
  private _dispose: () => void;

  private _render() {
    if(this._renderPromise) return this._renderPromise;

    const div = document.createElement('div');

    return this._renderPromise = (async() => {
      const {default: Component} = await import('./sharedMedia');

      const promiseCollectorHelper = PromiseCollector.createHelper();

      this._dispose = render(() => (
        <SolidJSHotReloadGuardProvider>
          <PromiseCollector onCollect={promiseCollectorHelper.onCollect}>
            <SuperTabProvider self={this}>
              <Component />
            </SuperTabProvider>
          </PromiseCollector>
        </SolidJSHotReloadGuardProvider>
      ), div);

      this.scrollable.append(div);

      await promiseCollectorHelper.await();
    })();
  }

  public init() {
    return this._render();
  }

  public setPeer(peerId: PeerId, threadId?: number) {
    if(this.peerId === peerId && this.threadId === threadId) return false;

    this.peerId = peerId;
    this.threadId = threadId;
    this.noProfile ??= peerId === rootScope.myId;
    this.peerChanged = true;

    if(this._impl) {
      this._impl.setQuery();
    } else {
      this._render().then(() => this._impl.setQuery());
    }

    return true;
  }

  public fillProfileElements() {
    if(this._impl) return this._impl.fillProfileElements();
    return this._render().then(() => this._impl.fillProfileElements());
  }

  public loadSidebarMedia(single: boolean, justLoad?: boolean) {
    if(this._impl) return this._impl.loadSidebarMedia(single, justLoad);
    return this._render().then(() => this._impl.loadSidebarMedia(single, justLoad));
  }

  public setSearchTab(type: SearchSuperMediaType) {
    if(this._impl) return this._impl.setSearchTab(type);
    this._render().then(() => this._impl.setSearchTab(type));
  }

  public setLoadMutex(promise: Promise<any>) {
    if(this._impl) return this._impl.setLoadMutex(promise);
    this._render().then(() => this._impl.setLoadMutex(promise));
  }

  onOpenAfterTimeout() {
    super.onOpenAfterTimeout();

    this.scrollable.onScroll();
  }

  onCloseAfterTimeout() {
    super.onCloseAfterTimeout();

    if(this.destroyable) {
      this.searchSuper?.destroy();
    }

    this._dispose?.();
  }

  public destroy() {
    this.destroyable = true;
    this.onCloseAfterTimeout();
  }

  public static async open(slider: SidebarSlider, peerId: PeerId, noProfile?: boolean) {
    const tab = slider.createTab(AppSharedMediaTab, true);
    tab.noProfile = noProfile;
    tab.isFirst = true;
    tab.setPeer(peerId);
    (await tab.fillProfileElements())();
    await tab.loadSidebarMedia(true);
    return tab.open();
  }
}
