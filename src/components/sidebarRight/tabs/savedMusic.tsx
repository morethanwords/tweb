import {createSignal, onCleanup, onMount, Show} from 'solid-js';
import {render} from 'solid-js/web';
import {SliderSuperTab} from '@components/slider';
import {i18n} from '@lib/langPack';
import wrapDocument from '@components/wrappers/document';
import LazyLoadQueue from '@components/lazyLoadQueue';
import {MyDocument} from '@appManagers/appDocsManager';
import {Message, MessageMedia} from '@layer';
import {MediaItem, MediaListLoader, MediaListLoaderFactory, MediaListLoaderOptions} from '@components/appMediaPlaybackController';
import appMediaPlaybackController from '@components/appMediaPlaybackController';
import ListLoader, {ListLoaderResult} from '@helpers/listLoader';
import rootScope from '@lib/rootScope';
import type AudioElement from '@components/audio';
import Scrollable from '@components/scrollable';
import {PreloaderTsx} from '@components/putPreloader';

import styles from '@components/sidebarRight/tabs/savedMusic.module.scss';

function createFakeMessage(doc: MyDocument, peerId: PeerId): Message.message {
  return {
    _: 'message',
    id: doc.id,
    mid: doc.id,
    peerId: peerId,
    fromId: peerId,
    date: doc.date,
    message: '',
    pFlags: {},
    media: {
      _: 'messageMediaDocument',
      document: doc,
      pFlags: {}
    } as MessageMedia.messageMediaDocument
  } as any;
}

function SavedMusicContent(props: {
  peerId: PeerId,
  scrollable: Scrollable
}) {
  const [loadedFirst, setLoadedFirst] = createSignal(false);
  const [loaded, setLoaded] = createSignal(false);
  let listEl!: HTMLDivElement;
  let docCount = 0;

  const lazyLoadQueue = new LazyLoadQueue();
  onCleanup(() => lazyLoadQueue.clear());

  const savedMusicLoader = new SavedMusicListLoader(props.peerId);

  const loaderFactory: MediaListLoaderFactory = (options) => {
    savedMusicLoader.setOptions(options);
    return savedMusicLoader;
  };

  let renderPromise = Promise.resolve();
  savedMusicLoader.onNewDocs = (docs) => {
    docCount += docs.length;
    renderPromise = renderPromise.then(async() => {
      const elements = await Promise.all(docs.map(async(doc) => {
        const message = createFakeMessage(doc, props.peerId);
        const div = await wrapDocument({
          message,
          fontWeight: 400,
          voiceAsMusic: true,
          lazyLoadQueue,
          autoDownloadSize: 0,
          getSize: () => 320
        }) as AudioElement;
        div.classList.add('audio-48', 'search-super-item');
        div.listLoaderFactory = loaderFactory;
        return div;
      }));
      for(const el of elements) {
        listEl.append(el);
      }
      setLoadedFirst(true)
    });
  };

  savedMusicLoader.extraOnLoadedMore = () => {
    if(savedMusicLoader.isFullyLoaded) {
      setLoaded(true);
    }
  };

  savedMusicLoader.setOptions({
    loadCount: 50,
    loadWhenLeft: 5,
    processItem: (message: Message.message) => {
      appMediaPlaybackController.addMedia(message, false, false, true);
      return {peerId: message.peerId, mid: message.mid};
    }
  });

  onMount(() => savedMusicLoader.load(true));

  props.scrollable.onScrolledBottom = () => {
    if(loaded()) return;
    savedMusicLoader.load(true);
  };

  return (
    <div class={styles.content}>
      <Show when={loaded() && !docCount}>
        <div class={styles.empty}>
          {i18n('Chat.Search.NothingFound')}
        </div>
      </Show>
      <Show when={!loadedFirst()}>
        <PreloaderTsx />
      </Show>
      <div class={styles.list} ref={listEl} />
    </div>
  );
}

interface TailEntry {
  item: MediaItem;
  doc: MyDocument;
}

class SavedMusicListLoader extends ListLoader<MediaItem, Message.message> implements MediaListLoader {
  public onEmptied?: () => void;
  public extraOnLoadedMore?: () => void;
  public onNewDocs?: (docs: MyDocument[]) => void;
  private offset = 0;
  private peerId: PeerId;
  private loadingFromEnd = false;
  private loadingMainForward = false;
  private loadingTailPrev = false;
  private gapFillingInProgress = false; // stays true until gap is closed

  // tail: items fetched from the end when wrapping, with a gap in the middle
  private tailEntries: TailEntry[] = [];
  private tailOffset = 0;
  private tailCurrentIdx = -1; // -1 = not in tail region
  private get inTailRegion() { return this.tailCurrentIdx >= 0; }

  constructor(
    peerId: PeerId
  ) {
    super({
      loadMore: async(_anchor, older, loadCount) => {
        if(!older) {
          return {count: this.count ?? 0, items: []};
        }

        const result = await rootScope.managers.appProfileManager.getSavedMusic(peerId.toUserId(), this.offset, loadCount);
        const docs = result.documents as MyDocument[];

        this.offset += docs.length;

        this.onNewDocs?.(docs);
        const messages: Message.message[] = docs.map((doc) => createFakeMessage(doc, peerId));

        return {count: result.count, items: messages} as ListLoaderResult<Message.message>;
      }
    });

    this.peerId = peerId;

    this.setLoaded(false, true);
  }

  private itemMatches(item: MediaItem, mid: number, peerId: PeerId): boolean {
    return item.mid === mid && item.peerId === peerId;
  }

  private async loadTailChunk(offset: number, count: number): Promise<TailEntry[]> {
    const result = await rootScope.managers.appProfileManager.getSavedMusic(
      this.peerId.toUserId(),
      offset,
      count
    );
    const docs = result.documents as MyDocument[];
    const entries: TailEntry[] = [];

    for(const doc of docs) {
      const message = createFakeMessage(doc, this.peerId);
      const item = this.processItem ? await this.processItem(message) : {peerId: message.peerId, mid: message.mid};
      if(item) {
        entries.push({item: item as MediaItem, doc});
      }
    }

    return entries;
  }

  private async loadFromEnd(jumpToLast: boolean) {
    if(this.loadingFromEnd || !this.count) return;
    this.loadingFromEnd = true;

    try {
      const tailOffset = Math.max(this.offset, this.count - this.loadCount);
      const tailCount = this.count - tailOffset;

      if(tailOffset <= this.offset) {
        if(jumpToLast) {
          await this.load(true);
          const allItems = this.getMainItems();
          if(allItems.length > 0) {
            this.goToMainIndex(allItems, allItems.length - 1, true, false);
          }
        }
        return;
      }

      this.tailEntries = await this.loadTailChunk(tailOffset, tailCount);
      this.tailOffset = tailOffset;

      if(jumpToLast && this.tailEntries.length > 0) {
        this.enterTailRegion(this.tailEntries.length - 1, true);
      }
    } finally {
      this.loadingFromEnd = false;
    }
  }

  private enterTailRegion(idx: number, dispatchJump: boolean) {
    if(idx < 0 || idx >= this.tailEntries.length) return;

    if(!this.inTailRegion && this.current) {
      this.next.unshift(this.current);
    }

    this.tailCurrentIdx = idx;
    this.current = this.tailEntries[idx].item;

    dispatchJump && this.onJump?.(this.current, false);
    this.prefetchTail();
  }

  private prefetchTail() {
    if(!this.inTailRegion) return;
    const fromStart = this.tailCurrentIdx;
    if(fromStart < this.loadWhenLeft && this.tailOffset > this.offset) {
      if(!this.loadingTailPrev) {
        this.loadTailPrevious();
      }
      if(!this.gapFillingInProgress) {
        this.gapFillingInProgress = true;
        this.loadMainForward();
      }
    }
  }

  private async loadMainForward() {
    if(this.loadingMainForward) return;
    this.loadingMainForward = true;
    try {
      await this.load(true);
      this.tryMergeTail();
    } finally {
      this.loadingMainForward = false;
      this.gapFillingInProgress = false;
    }
  }

  private prefetchMain() {
    if(this.inTailRegion) return;

    const mainItems = this.getMainItems();
    const currentIdx = this.getMainCurrentIndex();
    if(currentIdx < 0) return;

    const fromStart = currentIdx;
    const fromEnd = mainItems.length - 1 - currentIdx;

    if((fromStart < this.loadWhenLeft && this.loadedAllUp) ||
       (fromEnd < this.loadWhenLeft && !this.loadedAllDown)) {
      if(!this.tailEntries.length && this.count && this.offset < this.count) {
        this.loadFromEnd(false);
      }
    }
  }

  private async loadTailPrevious(pendingNav?: {length: number; dispatchJump: boolean; round: boolean}) {
    if(this.loadingTailPrev) return;
    this.loadingTailPrev = true;

    try {
      const chunkStart = Math.max(this.offset, this.tailOffset - this.loadCount);
      const chunkCount = this.tailOffset - chunkStart;

      if(chunkCount <= 0) {
        this.tryMergeTail();
        if(pendingNav) {
          pendingNav.round ? this.goRound(pendingNav.length, pendingNav.dispatchJump) : this.go(pendingNav.length, pendingNav.dispatchJump);
        }
        return;
      }

      const newEntries = await this.loadTailChunk(chunkStart, chunkCount);

      if(this.inTailRegion) {
        this.tailCurrentIdx += newEntries.length;
      }
      this.tailEntries.unshift(...newEntries);
      this.tailOffset = chunkStart;

      this.tryMergeTail();
      this.onLoadedMore?.();

      if(pendingNav) {
        pendingNav.round ? this.goRound(pendingNav.length, pendingNav.dispatchJump) : this.go(pendingNav.length, pendingNav.dispatchJump);
      }
    } finally {
      this.loadingTailPrev = false;
    }
  }

  private tryMergeTail() {
    if(!this.tailEntries.length) return;

    if(this.offset >= this.tailOffset) {
      const wasInTail = this.inTailRegion;
      const currentTailItem = wasInTail ? this.tailEntries[this.tailCurrentIdx]?.item : undefined;

      if(wasInTail) {
        this.current = undefined;
        this.tailCurrentIdx = -1;
      }

      // build combined list: main items + tail items (deduped)
      const mainItems = this.getMainItems();
      const existingMids = new Set(mainItems.map((i) => i.mid));
      if(this.current) existingMids.add(this.current.mid);

      const newTailEntries = this.tailEntries.filter((e) => !existingMids.has(e.item.mid));
      const allItems = [...mainItems, ...newTailEntries.map((e) => e.item)];

      this.setLoaded(true, true);
      this.tailEntries = [];

      if(newTailEntries.length) {
        this.onNewDocs?.(newTailEntries.map((e) => e.doc));
      }

      // find the target current position
      const targetMid = currentTailItem?.mid ?? this.current?.mid;
      const targetIdx = targetMid !== undefined ? allItems.findIndex((i) => i.mid === targetMid) : -1;

      if(targetIdx === -1 && this.current) {
        // current not in allItems, keep as-is but update prev/next
        this.previous.length = 0;
        this.next.length = 0;
        this.next.push(...allItems);
      } else if(targetIdx !== -1) {
        this.previous.length = 0;
        this.previous.push(...allItems.slice(0, targetIdx));
        this.current = allItems[targetIdx];
        this.next.length = 0;
        this.next.push(...allItems.slice(targetIdx + 1));
      } else {
        // no current, just put everything in next
        this.previous.length = 0;
        this.next.length = 0;
        this.next.push(...allItems);
      }
    }
  }

  public setOptions(options: MediaListLoaderOptions) {
    this.processItem = options.processItem;
    this.loadCount = options.loadCount ?? 50;
    this.loadWhenLeft = options.loadWhenLeft ?? 20;
    this.onJump = options.onJump;
    this.onEmptied = options.onEmptied;

    const callerOnLoadedMore = options.onLoadedMore;
    this.onLoadedMore = () => {
      // dedup: remove any items from prev/next that duplicate current or each other
      const seenMids = new Set<number>();
      if(this.current) seenMids.add(this.current.mid);

      // filter previous
      for(let i = this.previous.length - 1; i >= 0; i--) {
        const mid = this.previous[i].mid;
        if(seenMids.has(mid)) {
          this.previous.splice(i, 1);
        } else {
          seenMids.add(mid);
        }
      }

      // filter next
      for(let i = 0; i < this.next.length; i++) {
        const mid = this.next[i].mid;
        if(seenMids.has(mid)) {
          this.next.splice(i, 1);
          i--;
        } else {
          seenMids.add(mid);
        }
      }

      this.tryMergeTail();
      callerOnLoadedMore?.();
      this.extraOnLoadedMore?.();
      this.prefetchMain();
    };
  }

  public get isFullyLoaded() {
    return this.loadedAllDown;
  }

  public override reset(loadedAll = false) {
    super.reset(loadedAll);
    this.offset = 0;
    this.tailCurrentIdx = -1;
    this.tailEntries = [];
    this.tailOffset = 0;
    this.gapFillingInProgress = false;
  }

  public cleanup() {}

  private getMainItems(): MediaItem[] {
    const items = [...this.previous];
    if(this.current && !this.inTailRegion) items.push(this.current);
    items.push(...this.next);
    return items;
  }

  private getMainCurrentIndex(): number {
    if(this.inTailRegion || !this.current) return -1;
    return this.previous.length;
  }

  private goToMainIndex(items: MediaItem[], idx: number, dispatchJump: boolean, older: boolean) {
    if(idx < 0 || idx >= items.length) return undefined;

    this.tailCurrentIdx = -1;
    this.previous.length = 0;
    this.previous.push(...items.slice(0, idx));
    this.current = items[idx];
    this.next.length = 0;
    this.next.push(...items.slice(idx + 1));

    dispatchJump && this.onJump?.(this.current, older);
    return this.current;
  }

  private syncTailRegion() {
    if(this.inTailRegion || !this.current || !this.tailEntries.length) return;

    const idx = this.tailEntries.findIndex((e) => this.itemMatches(e.item, this.current!.mid, this.current!.peerId));
    if(idx !== -1) {
      this.tailCurrentIdx = idx;
    }
  }

  public goRound(length: number, dispatchJump?: boolean): MediaItem | undefined {
    this.syncTailRegion();
    this.tryMergeTail();
    const dispatch = dispatchJump ?? true;

    if(this.inTailRegion) {
      return this.goRoundInTail(length, dispatch);
    }

    const mainItems = this.getMainItems();
    const currentIdx = this.getMainCurrentIndex();
    let targetIdx = currentIdx + length;

    if(targetIdx >= mainItems.length && !this.loadedAllDown && !this.tailEntries.length) {
      this.load(true);
      return undefined;
    }
    if(targetIdx < 0 && !this.loadedAllUp) {
      this.load(false);
      return undefined;
    }

    if(mainItems.length > 0) {
      if(targetIdx < 0 && this.loadedAllUp) {
        if(this.loadedAllDown) {
          targetIdx = mainItems.length - 1;
        } else if(this.tailEntries.length > 0) {
          this.enterTailRegion(this.tailEntries.length - 1, dispatch);
          return this.current;
        } else {
          this.loadFromEnd(true);
          return undefined;
        }
      } else if(targetIdx >= mainItems.length) {
        if(this.tailEntries.length > 0) {
          this.enterTailRegion(0, dispatch);
          return this.current;
        } else if(this.loadedAllDown) {
          targetIdx = 0;
        }
      }
    }

    if(targetIdx < 0 || targetIdx >= mainItems.length) return undefined;

    const result = this.goToMainIndex(mainItems, targetIdx, dispatch, length > 0);

    if(this.next.length < this.loadWhenLeft && !this.loadedAllDown) {
      this.load(true);
    }
    this.prefetchMain();

    return result;
  }

  private goRoundInTail(length: number, dispatchJump: boolean): MediaItem | undefined {
    const targetIdx = this.tailCurrentIdx + length;

    if(targetIdx < 0) {
      if(this.offset >= this.tailOffset) {
        this.tryMergeTail();
        return this.goRound(length, dispatchJump);
      }
      this.loadTailPrevious({length, dispatchJump, round: true});
      return undefined;
    }

    if(targetIdx >= this.tailEntries.length) {
      this.current = undefined;
      this.tailCurrentIdx = -1;
      const mainItems = this.getMainItems();
      if(mainItems.length > 0) {
        return this.goToMainIndex(mainItems, 0, dispatchJump, true);
      }
      return undefined;
    }

    this.tailCurrentIdx = targetIdx;
    this.current = this.tailEntries[targetIdx].item;
    dispatchJump && this.onJump?.(this.current, length > 0);
    this.prefetchTail();
    return this.current;
  }

  public go(length: number, dispatchJump = true): MediaItem | undefined {
    this.syncTailRegion();
    this.tryMergeTail();

    if(this.inTailRegion) {
      return this.goInTail(length, dispatchJump);
    }

    const mainItems = this.getMainItems();
    const currentIdx = this.getMainCurrentIndex();
    const targetIdx = currentIdx + length;

    if(targetIdx < 0 || targetIdx >= mainItems.length) {
      if(targetIdx >= mainItems.length && !this.loadedAllDown && !this.tailEntries.length) {
        this.load(true);
      }
      return undefined;
    }

    const result = this.goToMainIndex(mainItems, targetIdx, dispatchJump, length > 0);

    if(this.next.length < this.loadWhenLeft && !this.loadedAllDown) {
      this.load(true);
    }
    this.prefetchMain();

    return result;
  }

  private goInTail(length: number, dispatchJump: boolean): MediaItem | undefined {
    const targetIdx = this.tailCurrentIdx + length;

    if(targetIdx < 0) {
      if(this.offset >= this.tailOffset) {
        this.tryMergeTail();
        return this.go(length, dispatchJump);
      }
      this.loadTailPrevious({length, dispatchJump, round: false});
      return undefined;
    }

    if(targetIdx >= this.tailEntries.length) {
      return undefined;
    }

    this.tailCurrentIdx = targetIdx;
    this.current = this.tailEntries[targetIdx].item;
    dispatchJump && this.onJump?.(this.current, length > 0);
    this.prefetchTail();
    return this.current;
  }

  public getPrevious() {
    return this.inTailRegion ? this.tailEntries.slice(0, this.tailCurrentIdx).map((e) => e.item) : this.previous;
  }

  public getNext() {
    return this.inTailRegion ? this.tailEntries.slice(this.tailCurrentIdx + 1).map((e) => e.item) : this.next;
  }

  // move current position to a known item without resetting the loader state
  // used when user clicks on a track that's already loaded in main or tail
  public repositionTo(mid: number, peerId: PeerId): boolean {
    if(this.tailEntries.length) {
      const tailIdx = this.tailEntries.findIndex((e) => this.itemMatches(e.item, mid, peerId));
      if(tailIdx !== -1) {
        this.enterTailRegion(tailIdx, false);
        return true;
      }
    }

    const mainItems = this.getMainItems();
    const mainIdx = mainItems.findIndex((item) => this.itemMatches(item, mid, peerId));
    if(mainIdx !== -1) {
      this.goToMainIndex(mainItems, mainIdx, false, false);
      this.prefetchMain();
      return true;
    }

    return false;
  }

  public getCurrent() {
    return this.current;
  }
}

export default class AppSavedMusicTab extends SliderSuperTab {
  public peerId: PeerId;
  private dispose: VoidFunction;

  public init() {
    this.container.classList.add(styles.container);
    this.setTitle('SavedMusicTab');

    this.dispose = render(() => (
      <SavedMusicContent
        peerId={this.peerId}
        scrollable={this.scrollable}
      />
    ), this.scrollable.container);
  }

  onCloseAfterTimeout() {
    super.onCloseAfterTimeout();
    this.dispose();
  }
}
