import type {MediaSearchContext} from '@components/appMediaPlaybackController';
import type {SearchSuperContext} from '@components/appSearchSuper';
import type {Message} from '@layer';
import type {MessagesStorageKey, MyMessage, RequestHistoryOptions} from '@appManagers/appMessagesManager';
import {ReadingManagers} from '@lib/managers';
import {isMessageSensitive} from '@appManagers/utils/messages/isMessageRestricted';
import apiManagerProxy from '@lib/apiManagerProxy';
import rootScope, {BroadcastEvents} from '@lib/rootScope';
import forEachReverse from '@helpers/array/forEachReverse';
import filterChatPhotosMessages from '@helpers/filterChatPhotosMessages';
import ListLoader, {ListLoaderOptions} from '@helpers/listLoader';
import getSearchType from '@appManagers/utils/messages/getSearchType';
import {bindManagersToSession} from '@lib/accounts/bindManagersToAccount';

// * the filters whose every result the media viewer shows: a document search also has files it skips
const POSITIONED_FILTERS: Set<MediaSearchContext['inputFilter']['_']> = new Set([
  'inputMessagesFilterPhotoVideo',
  'inputMessagesFilterPhotos',
  'inputMessagesFilterVideo'
]);
// * the most a request of the search returns, and how many of them the range the list was opened with
// * may take before its places are given up
const GIVEN_RANGE_PAGE = 100;
const GIVEN_RANGE_PAGES = 20;

export default class SearchListLoader<Item extends {mid: number, peerId: PeerId}> extends ListLoader<Item, Message.message> {
  public searchContext: MediaSearchContext;
  public onEmptied: () => void;

  private otherSideLoader: SearchListLoader<Item>;
  private managers: ReadingManagers;
  // * every result a chat's search returned: the items of the list, and those it left out
  private searchMids: Set<number> = new Set();
  // * the targets the list was opened with come from where it was opened (an album in a chat), not
  // * from the search: a result between them may be left out (a sensitive one), and one of them need
  // * not be a result at all - the place counting reads the search over their range instead
  private givenMids: number[] = [];
  private positionAnchor: {mid: number, position: number, count: number};
  private positionAnchorPromise: Promise<void>;
  // * bumped whenever the search changes: a place asked for before that is stale on arrival
  private positionGeneration = 0;

  constructor(options: Omit<ListLoaderOptions<Item, Message.message>, 'loadMore'> & {
    onEmptied?: () => void,
    isInner?: boolean,
    managers?: ReadingManagers
  } = {}) {
    super({
      ...options,
      loadMore: async(anchor, older, loadCount) => {
        const managers = bindManagersToSession(this.managers);
        const peerId = this.searchContext.peerId || anchor?.peerId;
        // * A search inside one peer is read back out of the storage's slices, and a window lying
        // * wholly above an id the storage does not hold cannot be cut out of it again once the request
        // * has filled it: every newer result is dropped and the loader marks itself as having read
        // * everything. So the newer side reads from the anchor itself, which the storage does hold,
        // * and the anchor - with whatever older came along when there was not enough newer to fill the
        // * window - is dropped from the results below.
        const fromAnchor = !older &&
          anchor?.mid !== undefined &&
          !(this.searchContext as RequestHistoryOptions).isCacheableSearch &&
          getSearchType({...this.searchContext, peerId}) === 'cached';
        // * the window read from the anchor holds the anchor itself, which is dropped below: one place
        // * more is asked for, or a full page of newer results comes back one short and the loader
        // * latches "read everything" with more of them still there
        const backLimit = older ? 0 : loadCount + (fromAnchor ? 1 : 0);
        let offsetId = anchor?.mid ?? this.searchContext.maxId;

        if(!older && !fromAnchor) offsetId = await managers.appMessagesIdsManager.incrementMessageId(offsetId, 1);

        return managers.appMessagesManager.getHistory({
          ...this.searchContext,
          peerId,
          offsetId,
          offsetPeerId: !peerId ? anchor?.peerId : undefined,
          limit: backLimit ? (fromAnchor ? 1 : 0) : loadCount,
          backLimit
        }).then((value) => {
          /* if(DEBUG) {
            this.log('loaded more media by maxId:', maxId, value, older, this.reverse);
          } */

          // * a cached (non-global) search returns only mids, resolve them before filtering
          if(!value.messages) {
            value.messages = value.history.map((mid) => apiManagerProxy.getMessageByPeer(peerId, mid));
          }

          // * for counting places (getPosition), the results the list leaves out too
          if(this.searchContext.peerId) {
            value.messages.forEach((message) => message && this.searchMids.add(message.mid));
          }

          if(this.searchContext.inputFilter._ === 'inputMessagesFilterChatPhotos') {
            filterChatPhotosMessages(value);
          }

          if(value.nextRate) {
            this.searchContext.nextRate = value.nextRate;
          }

          const items = fromAnchor ?
            value.messages.filter((message) => !message || message.mid > anchor.mid) :
            value.messages;

          return {count: value.count, items};
        });
      },
      processItem: async(message) => {
        const filtered = await this.filterMids([message.mid]);
        if(!filtered.length) {
          return;
        }

        return options.processItem(message);
      }
    });

    this.managers ??= rootScope.managers;
    rootScope.addEventListener('history_delete', this.onHistoryDelete);
    rootScope.addEventListener('history_multiappend', this.onHistoryMultiappend);
    rootScope.addEventListener('message_sent', this.onMessageSent);

    if(!options.isInner) {
      this.otherSideLoader = new SearchListLoader({
        ...options,
        isInner: true
      });

      // this.otherSideLoader.onLoadedMore = () => {

      // };
    }
  }

  protected async filterMids(mids: number[]) {
    const storageKey: MessagesStorageKey = `${this.searchContext.peerId}_${this.searchContext.isScheduled ? 'scheduled' : 'history'}`;
    let filtered = (await this.managers.appMessagesManager.filterMessagesByInputFilterFromStorage(this.searchContext.inputFilter._, mids, storageKey, mids.length)) as Message.message[];
    if(this.searchContext.skipSensitive) {
      filtered = filtered.filter((message) => !isMessageSensitive(message));
    }
    return filtered;
  }

  protected onHistoryDelete = ({peerId, msgs}: BroadcastEvents['history_delete']) => {
    // * a deletion in the chat may take a result the search counts, loaded or not: its places are asked again
    if(peerId === this.searchContext?.peerId) {
      msgs.forEach((mid) => this.searchMids.delete(mid));
      this.resetPositions();
    }

    const shouldBeDeleted = (item: Item) => item.peerId === peerId && msgs.has(item.mid);
    const filter = (item: Item, idx: number, arr: Item[]) => {
      if(shouldBeDeleted(item)) {
        arr.splice(idx, 1);
      }
    };

    const length = this.previous.length + this.next.length;
    forEachReverse(this.previous, filter);
    forEachReverse(this.next, filter);

    if(this.current && shouldBeDeleted(this.current)) {
      this.current = undefined;
      /* if(this.go(1)) {
        this.previous.splice(this.previous.length - 1, 1);
      } else if(this.go(-1)) {
        this.next.splice(0, 1);
      } else  */if(this.onEmptied) {
        this.onEmptied();
      }
    } else if(this.previous.length + this.next.length !== length) {
      // * what is drawn from the list (the arrows, an album's thumbnails) follows it
      this.onLoadedMore?.();
    }
  };

  protected onHistoryMultiappend = async(message: Message.message | Message.messageService) => {
    const {searchContext} = this;
    if(searchContext.folderId !== undefined) {
      return;
    }

    // because it's reversed
    if(!this.loadedAllUp || this.loadPromiseUp) {
      return;
    }

    if(message.peerId !== searchContext.peerId) {
      return;
    }

    const filtered = await this.filterMids([message.mid]);
    if(this.searchContext !== searchContext) return;
    const targets = (await Promise.all(filtered.map((message) => this.processItem(message)))).filter(Boolean);
    if(this.searchContext !== searchContext) return;
    if(!targets.length) {
      return;
    }

    // * it can be already added because of `message_sent`
    const allTargets = this.previous.concat(this.next, this.current ? [this.current] : []);
    if(allTargets.some((item) => item?.mid === message.mid)) {
      return;
    }

    if(!this.current) {
      this.previous.push(...targets);
    } else {
      this.next.push(...targets);
    }

    filtered.forEach(({mid}) => this.searchMids.add(mid));
    this.resetPositions();
    this.onLoadedMore?.();
  };

  protected onMessageSent = ({message}: {message: MyMessage}) => {
    this.onHistoryMultiappend(message);
  };

  public setSearchContext(context: SearchSuperContext) {
    this.searchContext = context;

    if(this.searchContext.folderId !== undefined) {
      this.loadedAllUp = true;

      if(this.searchContext.nextRate === undefined) {
        this.loadedAllDown = true;
      }
    }

    if(this.searchContext.inputFilter._ === 'inputMessagesFilterChatPhotos') {
      this.loadedAllUp = true;
    }

    if(this.searchContext.useSearch === false) {
      this.loadedAllDown = this.loadedAllUp = true;
    }

    if(this.otherSideLoader) {
      this.otherSideLoader.setSearchContext(context);
    }
  }

  /**
   * Where `item` stands in the whole search, 1-based in the order the list goes (`previous` first), and
   * how many the search holds: "3 of 15". Counted from the one place asked of the server
   * (`loadPosition`) over the results the search returned - the items of the list and those it left
   * out alike, as the server counts them - so paging asks nothing. Undefined until that place is known,
   * and for an item that is not a result of the search.
   */
  public getPosition(item: Item): {position: number, count: number} {
    const anchor = this.positionAnchor;
    if(!anchor || !this.searchMids.has(item.mid)) {
      return;
    }

    if(item.mid === anchor.mid) {
      return {position: anchor.position, count: anchor.count};
    }

    // * the results run in the order of their ids, and they are read without gaps from the item opened -
    // * the range the list was opened with by loadPositionAnchor, everything beyond it by the loads
    const low = Math.min(item.mid, anchor.mid), high = Math.max(item.mid, anchor.mid);
    let distance = 1;
    this.searchMids.forEach((mid) => {
      if(mid > low && mid < high) ++distance;
    });

    // * `reverse`: the list goes from older to newer
    return {
      position: anchor.position + ((item.mid > anchor.mid) === this.reverse ? distance : -distance),
      count: anchor.count
    };
  }

  /**
   * The place of `item` (`getPosition`), asking the server for it once: for the first item it is asked
   * about. Only for a chat's photos and videos, where the viewer shows nearly every result.
   */
  public loadPosition(item: Item): Promise<{position: number, count: number}> {
    const {searchContext} = this;
    if(
      !searchContext?.peerId ||
      searchContext.useSearch === false ||
      searchContext.isScheduled ||
      !POSITIONED_FILTERS.has(searchContext.inputFilter._)
    ) {
      return Promise.resolve(undefined);
    }

    this.positionAnchorPromise ??= this.loadPositionAnchor(item);
    return this.positionAnchorPromise.then(() => this.getPosition(item));
  }

  private async loadPositionAnchor(item: Item) {
    const {searchContext, reverse} = this;
    const generation = this.positionGeneration;
    const [result, rangeRead] = await Promise.all([
      // * starting at the item itself, offset_id_offset is its place counted from the newest, 1-based
      this.managers.appMessagesManager.getHistory({
        ...searchContext,
        offsetId: item.mid,
        limit: 1,
        backLimit: 1,
        needRealOffsetIdOffset: true
      }).catch((): undefined => undefined),
      this.readGivenRange(item).catch((): undefined => undefined)
    ]);

    if(generation !== this.positionGeneration || this.searchContext !== searchContext) {
      return;
    }

    const {count, offsetIdOffset} = result || {};
    if(!rangeRead || result?.history[0] !== item.mid || !count || !offsetIdOffset) {
      // * opened on what is no result of the search (a GIF among an album's photos): the next item may
      // * give the places. A request that failed is not repeated
      if(result && result.history[0] !== item.mid) {
        this.positionAnchorPromise = undefined;
      }

      return;
    }

    this.searchMids.add(item.mid);
    this.positionAnchor = {
      mid: item.mid,
      position: reverse ? count - offsetIdOffset + 1 : offsetIdOffset,
      count
    };
  }

  // * the search's results over the range of the targets the list was opened with (the loads go on from
  // * its edges), a page at a time from the newest of them down past the oldest
  private async readGivenRange(item: Item) {
    const managers = bindManagersToSession(this.managers);
    const mids = this.givenMids.concat(item.mid);
    if(mids.length < 2) {
      return true;
    }

    const oldest = Math.min(...mids);
    let offsetId = await managers.appMessagesIdsManager.incrementMessageId(Math.max(...mids), 1);
    for(let pages = 0; pages < GIVEN_RANGE_PAGES; ++pages) {
      const page = await managers.appMessagesManager.getHistory({
        ...this.searchContext,
        offsetId,
        limit: GIVEN_RANGE_PAGE
      });

      const history = page.history as number[];
      history.forEach((mid) => this.searchMids.add(mid));
      const last = history[history.length - 1];
      if(history.length < GIVEN_RANGE_PAGE || last <= oldest) {
        return true;
      }

      offsetId = last;
    }

    return false; // * a range this long goes without places
  }

  // * the search changed: its places are asked again
  private resetPositions() {
    ++this.positionGeneration;
    this.positionAnchor = this.positionAnchorPromise = undefined;
  }

  public setTargets(previous: Item[], next: Item[], reverse: boolean) {
    super.setTargets(previous, next, reverse);
    this.givenMids = previous.concat(next).map(({mid}) => mid);
  }

  public reset() {
    super.reset();
    this.searchContext = undefined;
    this.searchMids.clear();
    this.givenMids = [];
    this.resetPositions();

    if(this.otherSideLoader) {
      this.otherSideLoader.reset();
    }
  }

  public getPrevious(withOtherSide?: boolean) {
    let previous = this.previous;

    if(this.otherSideLoader && withOtherSide) {
      previous = previous.concat(this.otherSideLoader.previous);
    }

    return previous;
  }

  public getNext(withOtherSide?: boolean) {
    let next = this.next;

    if(this.otherSideLoader && withOtherSide) {
      next = next.concat(this.otherSideLoader.next);
    }

    return next;
  }

  public getCurrent() {
    return this.current || this.otherSideLoader?.current;
  }

  private goToOtherEnd(length: number) {
    if(length > 0) return this.go(-this.previous.length);
    else return this.go(this.next.length);
  }

  public goRound(length: number, dispatchJump?: boolean) {
    let ret: ReturnType<SearchListLoader<Item>['goUnsafe']>;

    if(this.otherSideLoader?.current) {
      ret = this.otherSideLoader.goUnsafe(length, dispatchJump);
      if(ret.item) {
        return ret.item;
      }

      length = ret.leftLength;
      if(!(length > 0 ? this.otherSideLoader.next : this.otherSideLoader.previous).length) {
        const loaded = length > 0 ? this.otherSideLoader.loadedAllUp : this.otherSideLoader.loadedAllDown;
        if(!loaded) { // do not reset anything until it's loaded
          return;
        }

        // if other side is loaded too will start from its begin
        if((length > 0 && (this.otherSideLoader.searchContext.maxId === 1 || this.otherSideLoader.loadedAllDown)) ||
          (length < 0 && (this.otherSideLoader.searchContext.maxId === 0 || this.otherSideLoader.loadedAllUp))) {
          return this.otherSideLoader.goToOtherEnd(length);
        }

        this.otherSideLoader.unsetCurrent(length > 0);
      }
    }

    ret = this.goUnsafe(length, dispatchJump);
    if(!ret.item) {
      if(this.loadedAllUp && this.loadedAllDown) { // just use the same loader if the list is too short
        return this.goToOtherEnd(length);
      } else if(this.otherSideLoader) {
        length = ret.leftLength;
        ret = this.otherSideLoader.goUnsafe(length, dispatchJump);

        if(ret.item) {
          this.unsetCurrent(length > 0);
        }
      }
    }

    return ret?.item;
  }

  public setCurrent(item: Item) {
    this.current = item;
  }

  protected setLoaded(down: boolean, value: boolean) {
    const changed = super.setLoaded(down, value);

    if(changed &&
      this.otherSideLoader &&
      value &&
      this.searchContext?.useSearch !== false/*  &&
      (this.reverse ? this.loadedAllUp : this.loadedAllDown) */) {
      const reverse = this.loadedAllUp;
      this.otherSideLoader.setSearchContext({
        ...this.searchContext,
        maxId: reverse ? 1 : 0
      });

      // these 'reverse' are different, not a mistake here.
      this.otherSideLoader.reverse = this.reverse;
      this.otherSideLoader.setLoaded(reverse, true);
      this.otherSideLoader.load(!reverse);
    }

    return changed;
  }

  public cleanup() {
    this.reset();
    rootScope.removeEventListener('history_delete', this.onHistoryDelete);
    rootScope.removeEventListener('history_multiappend', this.onHistoryMultiappend);
    rootScope.removeEventListener('message_sent', this.onMessageSent);
    this.onEmptied = undefined;

    if(this.otherSideLoader) {
      this.otherSideLoader.cleanup();
      this.otherSideLoader = undefined;
    }
  }
}
