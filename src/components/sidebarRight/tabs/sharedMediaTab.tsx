import {render} from 'solid-js/web';
import SidebarSlider, {SliderSuperTab} from '@components/slider';
import rootScope from '@lib/rootScope';
import AppSearchSuper, {SearchSuperMediaType} from '@components/appSearchSuper';
import SolidJSHotReloadGuardProvider from '@lib/solidjs/hotReloadGuardProvider';
import {PromiseCollector} from '@components/solidJsTabs/promiseCollector';
import {SuperTabProvider} from '@components/solidJsTabs/superTabProvider';
import type {ChatSetPeerOptions} from '@lib/appImManager';
import noop from '@helpers/noop';

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
  // * false shows my own profile rather than Saved Messages
  public isDialog = true;
  // * what a chat opened from the profile goes back to
  public openChatStack: ChatSetPeerOptions['stack'];
  public peerChanged: boolean;
  public searchSuper: AppSearchSuper;

  private _impl: SharedMediaImpl;
  private _renderPromise: Promise<void>;
  private _dispose: () => void;
  private _profilePromise: Promise<() => void>;
  private _readyPromise: Promise<void>;
  private _mediaPromise: Promise<any>;
  private _destroyed = false;
  /** the profile of the current peer is built and filled (fillProfileElements' apply): the column can show it */
  public isLoaded = false;

  private _render() {
    if(this._renderPromise) return this._renderPromise;

    const div = document.createElement('div');

    return this._renderPromise = (async() => {
      const {default: Component} = await import('./sharedMedia');
      if(this._destroyed) return;

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

      this._impl.setQuery();
      this.scrollable.append(div);

      await promiseCollectorHelper.await();
    })();
  }

  public init() {
    return this.ensureLoaded();
  }

  public async open(middleware?: () => boolean) {
    // * as the base class does with a failed init: the tab opens with what it has
    await this.ensureLoaded().catch((err) => console.error('open tab error', err));
    if(this._destroyed || (middleware && !middleware())) return;
    // * no asynchronous initialization remains for the base class: a replaced chat must not open its old tab
    this.init = null;
    return (super.open as () => Promise<void>)();
  }

  /**
   * Builds and fills the profile and its shared media once: with the chat's other parts when the column is shown, or
   * right after the chat's first frame when it is not (`Chat.prepareFinishPeerChange`)
   */
  public ensureLoaded() {
    const {peerId, threadId} = this;
    return this._readyPromise ??= this.fillProfileElements().then((apply) => {
      if(this._destroyed || this.peerId !== peerId || this.threadId !== threadId) return;
      apply();
      this._mediaPromise = this.loadSidebarMedia(true);
    });
  }

  public setPeer(peerId: PeerId, threadId?: number) {
    if(this.peerId === peerId && this.threadId === threadId) return false;

    this.peerId = peerId;
    this.threadId = threadId;
    this.noProfile ??= peerId === rootScope.myId;
    this.peerChanged = true;
    this._profilePromise = undefined;
    this._readyPromise = undefined;
    this._mediaPromise = undefined;
    this.isLoaded = false;

    this._impl?.setQuery();

    return true;
  }

  public fillProfileElements() {
    if(this._profilePromise) return this._profilePromise;
    const {peerId, threadId} = this;
    return this._profilePromise = this._render().then(async() => {
      if(this._destroyed || this.peerId !== peerId || this.threadId !== threadId) return noop;
      const apply = await this._impl?.fillProfileElements();
      let applied = false;
      return () => {
        if(applied || this._destroyed || this.peerId !== peerId || this.threadId !== threadId) return;
        applied = true;
        apply?.();
        this.isLoaded = true;
      };
    });
  }

  public loadSidebarMedia(single: boolean, justLoad?: boolean) {
    if(this._impl) return this._impl.loadSidebarMedia(single, justLoad);
    return this._render().then(() => this._impl?.loadSidebarMedia(single, justLoad));
  }

  public async setSearchTab(type: SearchSuperMediaType) {
    const {peerId, threadId} = this;
    await this.ensureLoaded();
    // * the first load chooses the default tab from its counters; a deep link takes over only after that choice
    await this._mediaPromise;
    if(this._destroyed || this.peerId !== peerId || this.threadId !== threadId) return;
    this._impl?.setSearchTab(type);
  }

  public setLoadMutex(promise: Promise<any>) {
    if(this._impl) return this._impl.setLoadMutex(promise);
    this._render().then(() => this._impl?.setLoadMutex(promise));
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
    this._destroyed = true;
    this.destroyable = true;
    this.onCloseAfterTimeout();
  }

  public static async open(
    slider: SidebarSlider,
    peerId: PeerId,
    options: Partial<Pick<AppSharedMediaTab, 'noProfile' | 'isFirst' | 'isDialog' | 'openChatStack'>> = {}
  ) {
    const tab = slider.createTab(AppSharedMediaTab, true);
    tab.isFirst = true;
    Object.assign(tab, options);
    try {
      tab.setPeer(peerId);
      (await tab.fillProfileElements())();
      await (tab._mediaPromise = tab.loadSidebarMedia(true));
      tab._readyPromise = Promise.resolve();
    } catch(err) {
      // * not opened yet, so no slider closes it: it goes by itself, its listeners with it
      tab.destroy();
      throw err;
    }

    return tab.open();
  }
}
