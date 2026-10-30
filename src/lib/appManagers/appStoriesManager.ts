import forEachReverse from '@helpers/array/forEachReverse';
import indexOfAndSplice from '@helpers/array/indexOfAndSplice';
import insertInDescendSortedArray from '@helpers/array/insertInDescendSortedArray';
import toArray from '@helpers/array/toArray';
import putInOrder from '@helpers/array/putInOrder';
import noop from '@helpers/noop';
import filterUnique from '@helpers/array/filterUnique';
import assumeType from '@helpers/assumeType';
import callbackify from '@helpers/callbackify';
import deferredPromise, {CancellablePromise} from '@helpers/cancellablePromise';
import makeError from '@helpers/makeError';
import deepEqual from '@helpers/object/deepEqual';
import safeReplaceObject from '@helpers/object/safeReplaceObject';
import pause from '@helpers/schedulers/pause';
import tsNow from '@helpers/tsNow';
import {Reaction, ReportReason, StoriesAllStories, StoriesStories, StoryItem, Update, PeerStories, User, Chat, ChatFull, StoryView, StoryReaction, Message, MediaArea, StoryAlbum, StoriesStealthMode, InputPrivacyRule, RecentStory} from '@layer';
import getPrivacyRulesDetails from '@appManagers/utils/privacy/getPrivacyRulesDetails';
import getStoryPrivacyType from '@appManagers/utils/stories/privacyType';
import {StorySettings, StorySettingsSaveResult} from '@appManagers/utils/stories/storySettings';
import createSerializedQueue, {SerializedQueue} from '@helpers/createSerializedQueue';
import {SERVICE_PEER_ID, TEST_NO_STORIES} from '@appManagers/constants';
import {ReferenceContext} from '@lib/storages/references';
import {AppManager} from '@appManagers/manager';
import type {MyTopPeer} from '@appManagers/appUsersManager';
import reactionsEqual from '@appManagers/utils/reactions/reactionsEqual';
import StoriesCacheType from '@appManagers/utils/stories/cacheType';
import insertStory from '@appManagers/utils/stories/insertStory';
import {makeStoryLink} from '@appManagers/utils/stories/storyLink';
import canPollPeerStories, {PEER_STORIES_POLL_INTERVAL} from '@appManagers/utils/stories/canPollPeerStories';

type MyStoryItem = Exclude<StoryItem, StoryItem.storyItemDeleted>;

export type StoriesListType = 'stories' | 'archive';
export type StoryReplyMode = 'reply' | 'boost' | 'none';
export type StoriesListPosition = {type: StoriesListType, index: number};
export type StoriesSegment = {length: number, type: 'unread' | 'close' | 'read'};
export type StoriesSegments = StoriesSegment[];
// * a line of the list of who saw or reacted to a story: a view (with its reaction), a repost as a story, a forward
export type StoryInteraction = {
  _: 'view',
  peerId: PeerId,
  date: number,
  reaction?: Reaction,
  blocked?: boolean,
  blockedMyStoriesFrom?: boolean
} | {
  _: 'repost',
  peerId: PeerId,
  date: number,
  story: StoryItem.storyItem
} | {
  _: 'forward',
  peerId: PeerId,
  date: number,
  message: Message.message
};
export type StoryInteractionsList = {
  count: number,
  // * of a user's story only: how many saw it, which the list may hold fewer of
  viewsCount?: number,
  items: StoryInteraction[],
  nextOffset?: string
};
type AlbumCacheItem = {
  info: StoryAlbum,
  ids: StoryItem['id'][],
  count: number,
  loadedAll: boolean,
  /** a write to it was refused and it could not be read again: it is, from the top, when it is next loaded */
  stale?: boolean,
  /** changes whenever its list is replaced, so that a page asked for before does not land in the new one */
  generation?: number
}
type StoriesPeerCache = {
  peerId: PeerId,
  stories: StoryItem['id'][],
  pinnedStories: StoriesPeerCache['stories'],
  archiveStories: StoriesPeerCache['stories'],
  pinnedToTop: Map<number, number>,
  storiesMap: Map<MyStoryItem['id'], MyStoryItem>,
  deleted: Set<number>,
  /** the peer's active stories came whole (`getAllStories`, `getPeerStories`): until then `stories` holds only
   * what came one by one, and `maxReadId` may be known without them (`updateReadStories`) */
  loaded?: boolean,
  /** the number (`askPeerStories`) of the latest question whose answer on what the peer has in stories was taken:
   * the answer to one asked before it is older, and is not (`takePeerStoriesAnswer`) */
  answered?: number,
  maxReadId?: number,
  getStoriesPromises: Map<StoryItem['id'], CancellablePromise<StoryItem.storyItem>>,
  getStoriesPromise?: CancellablePromise<void>,
  dispatchStoriesEvent?: boolean,
  pinnedLoadedAll?: boolean,
  archiveLoadedAll?: boolean,
  position?: StoriesListPosition,
  pinnedCount?: number,
  archiveCount?: number,
  albums: Map<number, AlbumCacheItem>,
  albumsOrder?: number[],
  albumsHash?: Long,
  /** a write to the albums was refused and they could not be read again: they are, when they are next asked for */
  albumsStale?: boolean
};

type ExpiringItem = {peerId: PeerId, id: number, timestamp: number};

/** One of a peer's lists a write changes (`writeLists`) */
type WrittenList = {
  key: string,
  /** reads the list from the server, giving what puts it in place */
  reload: () => Promise<() => void>,
  /** marks the list as not to be trusted, for when it cannot be read again: it is read anew when it is next shown */
  invalidate: () => void
};

const TEST_SKIPPED = false;
const TEST_READ = false;
const TEST_EXPIRING = 0;

const PEER_STORIES_POLL_BATCH = 100;

export default class AppStoriesManager extends AppManager {
  private settingsSaveQueue: SerializedQueue;
  private cache: {[userId: UserId]: StoriesPeerCache};
  private lists: {[type in StoriesListType]: PeerId[]};
  private changelogPeerId: PeerId;
  private expiring: ExpiringItem[];
  private stealthMode: StoriesStealthMode;
  /** the writes to the lists of albums and of their stories, one after another (`writeLists`) */
  private listWrites: Map<string, {queue: Promise<unknown>, pending: number, refused: boolean}>;
  /** the links the server gave for stories (`getStoryLink`), by `${peerId}_${id}` */
  private exportedStoryLinks: Map<string, string>;
  /** the read state of every peer's stories was asked for this session (`requestReadTills`) */
  private readTillsRequested: boolean;
  /** when the server was last asked what a peer has in stories (`pollPeersStories`) */
  private peerStoriesPolledAt: Map<PeerId, number>;
  /** how many questions on what peers have in stories were asked (`askPeerStories`) */
  private peerStoriesAsked: number;

  protected after() {
    this.clear(true);

    this.changelogPeerId = SERVICE_PEER_ID;

    if(TEST_NO_STORIES) {
      return;
    }

    this.apiUpdatesManager.addMultipleEventsListeners({
      updateStory: this.onUpdateStory,

      updateReadStories: this.onUpdateReadStories,

      updateStoriesStealthMode: this.onUpdateStoriesStealthMode,

      updateNewStoryReaction: this.onUpdateNewStoryReaction
    });

    this.rootScope.addEventListener('app_config', this.setChangelogPeerIdFromAppConfig);

    this.rootScope.addEventListener('contacts_update', (userId) => {
      this.onSubscriptionUpdate(userId.toPeerId(false));
    });

    this.rootScope.addEventListener('chat_participation', ({chatId}) => {
      this.onSubscriptionUpdate(chatId.toPeerId(true));
    });

    this.rootScope.addEventListener('peer_stories_hidden', ({peerId}) => {
      const cache = this.getPeerStoriesCache(peerId, false);
      if(!cache) {
        return;
      }

      this.updateListCachePosition(cache);
      this.rootScope.dispatchEvent('stories_stories', this.convertPeerStoriesCache(cache));

      // move stories from cache to archive
      // const arrays = [cache[StoriesCacheType.Stories], cache[StoriesCacheType.Archive]];
      // if(!hidden) {
      //   arrays.reverse();
      // }

      // const [from, to] = arrays;
      // const stories = from.splice(0, from.length);
      // to.push(...stories);
    });

    this.rootScope.addEventListener('user_auth', () => {
      setTimeout(() => {
        this.getAllStories(false, undefined, true);
      }, 2e3);
    });

    setInterval(() => this.checkExpired(), 5e3);
  }

  public clear = (init?: boolean) => {
    this.cache = {};
    this.lists = {
      stories: [],
      archive: []
    };
    this.expiring = [];
    this.listWrites = new Map();
    this.exportedStoryLinks = new Map();
    this.readTillsRequested = false;
    this.peerStoriesPolledAt = new Map();
    this.peerStoriesAsked = 0;
  };

  /**
   * Numbers a question to the server on what peers have in stories (the feed, a peer's stories, a poll), as it is
   * asked: their answers can come in any order, and one is taken for a peer only if no answer to a later question
   * was (`takePeerStoriesAnswer`)
   */
  private askPeerStories() {
    return ++this.peerStoriesAsked;
  }

  /** Whether the answer to question `asked` is taken for the peer: the one to a later question was not, before it */
  private takePeerStoriesAnswer(cache: StoriesPeerCache, asked: number) {
    if(asked < (cache.answered ?? 0)) {
      return false;
    }

    cache.answered = asked;
    return true;
  }

  private onSubscriptionUpdate(peerId: PeerId) {
    const peer = this.getPeer(peerId);
    if(!peer) {
      return;
    }

    const cache = this.getPeerStoriesCache(peerId, false);
    // * one held without its stories (only how far they are read, `requestReadTills`) has them read as well
    if(!cache?.loaded && this.isSubcribedToPeer(peerId) && peer.stories_max_id !== undefined) {
      Promise.resolve(this.getPeerStories(peerId)).then((peerStories) => {
        this.rootScope.dispatchEvent('stories_stories', peerStories);
      });
      return;
    }

    if(!cache) {
      return;
    }

    const position = cache.position;
    this.updateListCachePosition(cache);
    if(!position && cache.position) { // added to list
      this.rootScope.dispatchEvent('stories_stories', this.convertPeerStoriesCache(cache));
    }
  }

  private checkExpired() {
    const now = tsNow(true);
    let item: ExpiringItem;
    while(item = this.expiring[0]) {
      if(item.timestamp > now) {
        break;
      }

      this.expiring.shift();
      const cache = this.getPeerStoriesCache(item.peerId, false);
      if(!cache) {
        continue;
      }

      const spliced = indexOfAndSplice(cache.stories, item.id);
      if(spliced !== undefined) {
        this.updateListCachePosition(cache);
        this.rootScope.dispatchEvent('story_expired', {peerId: cache.peerId, id: item.id});
      }
    }
  }

  private setChangelogPeerIdFromAppConfig = (appConfig: MTAppConfig) => {
    const userId = appConfig.stories_changelog_user_id;
    return this.changelogPeerId = userId ? userId.toPeerId(false) : SERVICE_PEER_ID;
  };

  public getChangelogPeerId(): PeerId | Promise<PeerId> {
    return this.changelogPeerId || callbackify(this.apiManager.getAppConfig(), this.setChangelogPeerIdFromAppConfig);
  }

  public generateSortIndexForCache(cache: StoriesPeerCache) {
    const cacheType = this.getCacheTypeForPeerId(cache.peerId);
    if(!cacheType) {
      return;
    }

    const lastStoryId = cache.stories[cache.stories.length - 1];
    if(!lastStoryId) {
      return;
    }

    const lastStory = cache.storiesMap.get(lastStoryId);
    const unreadType = this.getUnreadType(cache.peerId);
    const isMe = cache.peerId === this.rootScope.myId;
    const isUnread = unreadType !== 'read';
    const isChangelog = cache.peerId === this.changelogPeerId;
    const isPremium = cache.peerId.isUser() ? this.appUsersManager.isPremium(cache.peerId.toUserId()) : false;
    const index = [
      isMe,
      isUnread,
      isChangelog,
      isPremium
    ].map((boolean) => +boolean).join('') + lastStory.date;
    return +index;
  }

  public generateListCachePosition(cache: StoriesPeerCache) {
    const index = this.generateSortIndexForCache(cache);
    if(!index) {
      return;
    }

    const peer = this.appPeersManager.getPeer(cache.peerId) as User.user | Chat.channel;
    const position: StoriesListPosition = {
      type: peer.pFlags.stories_hidden ? 'archive' : 'stories',
      index
    };

    return position;
  }

  public updateListCachePosition(cache: StoriesPeerCache) {
    const previousPosition = cache.position;
    const position = this.generateListCachePosition(cache);
    if(deepEqual(previousPosition, position)) {
      return;
    }

    if(previousPosition && previousPosition.type !== position?.type) {
      const previousList = this.lists[previousPosition.type];
      indexOfAndSplice(previousList, cache.peerId);
    }

    cache.position = position;

    if(position) {
      const list = this.lists[position.type];
      insertInDescendSortedArray(list, cache.peerId, (peerId) => {
        const cache = this.getPeerStoriesCache(peerId);
        return cache.position.index;
      });
    }

    this.rootScope.dispatchEvent('stories_position', {peerId: cache.peerId, position});
  }

  /**
   * A snapshot of where every known peer sits in the lists.
   *
   * `stories_position` is only broadcast when a position CHANGES, so a tab that attached to an
   * already-running shared worker — a reload, a second tab — never hears about the positions
   * computed before it, and would sort its list by the fallback instead. This is how it catches up.
   */
  public getListPositions() {
    const positions: {[peerId: PeerId]: StoriesListPosition} = {};
    for(const peerId in this.cache) {
      const position = this.cache[peerId].position;
      if(position) {
        positions[peerId as any as PeerId] = position;
      }
    }

    return positions;
  }

  public getPeerStoriesCache(peerId: PeerId, create = true): StoriesPeerCache {
    return this.cache[peerId] ??= create ? {
      peerId,
      stories: [],
      pinnedStories: [],
      archiveStories: [],
      pinnedToTop: new Map(),
      storiesMap: new Map(),
      getStoriesPromises: new Map(),
      deleted: new Set(),
      albums: new Map()
    } : undefined;
  }

  public convertPeerStoriesCache(cache: StoriesPeerCache): PeerStories {
    return {
      _: 'peerStories',
      peer: this.appPeersManager.getOutputPeer(cache.peerId),
      stories: cache.stories.map((storyId) => cache.storiesMap.get(storyId)),
      max_read_id: cache.maxReadId
    };
  }

  private getStoryAlbums(storyItem?: StoryItem) {
    return storyItem?._ === 'storyItem' ? storyItem.albums ?? [] : [];
  }

  private syncAlbumsCacheForStory(
    cache: StoriesPeerCache,
    storyItem: StoryItem,
    oldAlbums: number[] = [],
    allowInsert = true
  ) {
    const newAlbums = new Set(this.getStoryAlbums(storyItem));
    const oldAlbumsSet = new Set(oldAlbums);

    for(const [albumId, album] of cache.albums) {
      const index = album.ids.indexOf(storyItem.id);
      const wasPresent = index !== -1 || oldAlbumsSet.has(albumId);
      const shouldBePresent = newAlbums.has(albumId);

      if(!shouldBePresent) {
        if(index !== -1) {
          album.ids.splice(index, 1);
        }

        if(wasPresent) {
          album.count = Math.max(0, album.count - 1);
        }
        continue;
      }

      if(wasPresent) {
        continue;
      }

      // * the server puts a story added to an album first
      if(allowInsert && index === -1) {
        album.ids.unshift(storyItem.id);
      }
      album.count += 1;
    }
  }

  private removeStoryFromAlbumsCache(cache: StoriesPeerCache, storyItem?: StoryItem) {
    if(!storyItem) {
      return;
    }

    const albums = new Set(this.getStoryAlbums(storyItem));
    for(const [albumId, album] of cache.albums) {
      const index = album.ids.indexOf(storyItem.id);
      const wasPresent = index !== -1 || albums.has(albumId);
      if(index !== -1) {
        album.ids.splice(index, 1);
      }

      if(wasPresent) {
        album.count = Math.max(0, album.count - 1);
      }
    }
  }

  public getPinnedStoriesCacheSnapshot(peerId: PeerId) {
    const cache = this.getPeerStoriesCache(peerId);
    return {
      stories: cache.pinnedStories.map((storyId) => cache.storiesMap.get(storyId)).filter(Boolean) as StoryItem.storyItem[],
      count: cache.pinnedCount ?? cache.pinnedStories.length,
      loaded: !!cache.pinnedLoadedAll
    };
  }

  public getAlbumStoriesCacheSnapshot(peerId: PeerId, albumId: number) {
    const cache = this.getPeerStoriesCache(peerId);
    const album = cache.albums.get(albumId);
    const stories = album ?
      album.ids.map((storyId) => cache.storiesMap.get(storyId)).filter(Boolean) as StoryItem.storyItem[] :
      [];
    return {
      stories,
      count: album?.count ?? stories.length,
      loaded: !!album?.loadedAll
    };
  }

  /** an active story leaves the list when it expires (`checkExpired`) */
  private registerExpiring(peerId: PeerId, storyItem: StoryItem.storyItem | StoryItem.storyItemSkipped) {
    if(TEST_EXPIRING) {
      storyItem.expire_date = tsNow(true) + TEST_EXPIRING;
    }

    const pos = this.expiring.findIndex((item) => item.peerId === peerId && item.id === storyItem.id);
    insertInDescendSortedArray(
      this.expiring,
      {peerId, id: storyItem.id, timestamp: storyItem.expire_date},
      (item) => 0x7FFFFFFF - (item.timestamp),
      pos
    );
  }

  public saveStoryItem(
    storyItem: StoryItem,
    cache: StoriesPeerCache,
    cacheType?: StoriesCacheType,
    syncAlbumsCache?: boolean
  ): MyStoryItem {
    if(TEST_NO_STORIES || !storyItem || storyItem._ === 'storyItemDeleted') {
      return;
    }

    const oldStoryItem = cache.storiesMap.get(storyItem.id);
    const oldStoryAlbums = this.getStoryAlbums(oldStoryItem).slice();
    const oldIsSkipped = oldStoryItem?._ === 'storyItemSkipped';
    const isSkipped = storyItem._ === 'storyItemSkipped';
    if(isSkipped && oldStoryItem && !oldIsSkipped) {
      // * held whole, it is kept so, and is still one of the list the answer is: a peer's stories read anew after
      // * what it has changed (`applyPeerRecentStory`) name those already held by id only. One held from elsewhere
      // * (one story, the profile's) leaves the list when it expires too
      if(cacheType === StoriesCacheType.Stories) {
        this.registerExpiring(cache.peerId, oldStoryItem);
      }

      if(cacheType) {
        insertStory(cache[cacheType], oldStoryItem, true, cacheType, cache.pinnedToTop);
      }

      return oldStoryItem;
    }

    if(!isSkipped) {
      const mediaContext: ReferenceContext = {
        type: 'storyItem',
        peerId: cache.peerId,
        storyId: storyItem.id
      };

      this.appMessagesManager.saveMessageMedia(storyItem, 'media', mediaContext);
      // the track the story was posted with — saved like any other document so the viewer can put
      // it in the profile playlist or forward it, file_reference refreshes included
      if(storyItem.music) {
        storyItem.music = this.appDocsManager.saveDoc(storyItem.music, mediaContext);
      }

      const mediaAreas = storyItem.media_areas;
      mediaAreas?.forEach((mediaArea) => {
        (mediaArea as MediaArea.mediaAreaChannelPost).msg_id =
          this.appMessagesIdsManager.generateMessageId(
            (mediaArea as MediaArea.mediaAreaChannelPost).msg_id,
            (mediaArea as MediaArea.mediaAreaChannelPost).channel_id
          );
      });
    }

    const pinnedToTopIndex = cache.pinnedToTop.get(storyItem.id);
    const modifiedPinnedToTop = storyItem.pinnedIndex !== pinnedToTopIndex;
    if(modifiedPinnedToTop) {
      storyItem.pinnedIndex = pinnedToTopIndex;
    }

    let modifiedPinned: boolean;
    if(cacheType !== StoriesCacheType.Pinned) {
      const wasPinned = !!(oldStoryItem as StoryItem.storyItem)?.pFlags?.pinned;
      const newPinned = !!(storyItem as StoryItem.storyItem).pFlags?.pinned;
      if(wasPinned !== newPinned) {
        if(newPinned) {
          if(cache.pinnedLoadedAll ||
            (cache.pinnedStories.length && storyItem.id > cache.pinnedStories[cache.pinnedStories.length - 1])) {
            insertStory(cache.pinnedStories, storyItem, true, StoriesCacheType.Pinned, cache.pinnedToTop);
            modifiedPinned = true;
          }
        } else if(indexOfAndSplice(cache.pinnedStories, storyItem.id)) {
          modifiedPinned = true;
        }

        if(modifiedPinned && cache.pinnedCount !== undefined) {
          cache.pinnedCount = Math.max(0, cache.pinnedCount + (newPinned ? 1 : -1));
        }
      }
    }

    let modifiedArchive: boolean;
    if(cacheType !== StoriesCacheType.Archive && cache.peerId === this.appPeersManager.peerId) {
      if(!cache.archiveStories.includes(storyItem.id) && (cache.archiveLoadedAll ||
        (cache.archiveStories.length && storyItem.id > cache.archiveStories[cache.archiveStories.length - 1]))) {
        insertStory(cache.archiveStories, storyItem, true, StoriesCacheType.Archive);
        modifiedArchive = true;
        if(cache.archiveCount !== undefined) {
          ++cache.archiveCount;
        }
      }
    }

    if(cacheType === StoriesCacheType.Stories) {
      this.registerExpiring(cache.peerId, storyItem);
    }

    if(cacheType) {
      const array = cache[cacheType];
      insertStory(array, storyItem, true, cacheType, cache.pinnedToTop);
    }

    if(!oldStoryItem) {
      cache.storiesMap.set(storyItem.id, storyItem);
    } else {
      if(!oldIsSkipped && !isSkipped && storyItem.pFlags.min) {
        const preserve: (keyof StoryItem.storyItem)[] = ['privacy', 'views'];
        for(const key of preserve) {
          // @ts-ignore
          storyItem[key] = oldStoryItem[key];
        }
      }

      if(!oldIsSkipped && !isSkipped && storyItem.pFlags.min) {
        const preserveFlags: (keyof StoryItem.storyItem['pFlags'])[] = ['out' as any];
        for(const key of preserveFlags) {
          // @ts-ignore
          storyItem.pFlags[key] = oldStoryItem.pFlags[key];
        }
      }

      safeReplaceObject(oldStoryItem, storyItem);
    }

    if(syncAlbumsCache && typeof(cacheType) !== 'object') {
      this.syncAlbumsCacheForStory(cache, oldStoryItem || storyItem, oldStoryAlbums, true);
    }

    if(oldStoryItem || modifiedPinned || modifiedArchive || modifiedPinnedToTop) {
      this.rootScope.dispatchEvent('story_update', {
        peerId: cache.peerId,
        story: oldStoryItem || storyItem,
        modifiedPinned,
        modifiedArchive,
        modifiedPinnedToTop
      });
    }

    return oldStoryItem || storyItem;
  }

  public saveStoryItems(
    storyItems: StoryItem[],
    cache: StoriesPeerCache,
    cacheType?: StoriesCacheType,
    syncAlbumsCache?: boolean
  ) {
    // if((storyItems as any).saved) return storyItems;
    // (storyItems as any).saved = true;
    const indexesToDelete: number[] = [];
    const newStoryItems = storyItems.map((storyItem, idx) => {
      storyItem = this.saveStoryItem(storyItem, cache, cacheType, syncAlbumsCache);
      if(!storyItem) {
        indexesToDelete.push(idx);
      }

      return storyItem;
    });

    forEachReverse(indexesToDelete, (idx) => {
      newStoryItems.splice(idx, 1);
    });

    if(cache.stories.length && cacheType === StoriesCacheType.Stories) { // * fix peer missing flag
      const peer = this.getPeer(cache.peerId);
      if(!peer.stories_max_id) {
        const storyItem = cache.storiesMap.get(cache.stories[cache.stories.length - 1]);
        const newPeer: typeof peer = {
          ...peer,
          stories_max_id: {
            _: 'recentStory',
            pFlags: {
              live: (storyItem as StoryItem.storyItemSkipped).pFlags.live
            },
            max_id: storyItem.id
          }
        };

        if(cache.peerId.isUser()) this.appUsersManager.saveApiUsers([newPeer as User.user]);
        else this.appChatsManager.saveApiChats([newPeer as Chat.channel]);
      }
    }

    this.updateListCachePosition(cache);

    return newStoryItems;
  }

  public getPeer(peerId: PeerId) {
    return this.appPeersManager.getPeer(peerId) as User.user | Chat.channel;
  }

  public saveApiPeerStories<T extends User.user | Chat.channel>(peer: T, oldPeer?: T) {
    if(peer._ !== 'channel' && peer._ !== 'user') {
      return;
    }

    const wasStories = oldPeer.stories_max_id ? true : (oldPeer.pFlags.stories_unavailable ? false : undefined);
    let newStories = peer.stories_max_id ? true : (peer.pFlags.stories_unavailable ? false : undefined);
    if(wasStories !== newStories) {
      if(newStories === undefined) {
        if(wasStories) {
          peer.stories_max_id = oldPeer.stories_max_id;
        }

        newStories = wasStories;
      }/*  else {
        if(!newStories) {
          delete peer.pFlags.stories_unavailable;
        }
      } */
    }

    const wasStoriesHidden = oldPeer.pFlags.stories_hidden;
    const newStoriesHidden = peer.pFlags.stories_hidden;

    return () => {
      if(TEST_NO_STORIES) {
        return;
      }

      const peerId = peer.id.toPeerId(peer._ !== 'user');
      if(wasStories !== newStories && newStories !== undefined) {
        this.rootScope.dispatchEvent('peer_stories', {peerId, available: newStories});
      }

      if(wasStoriesHidden !== newStoriesHidden) {
        this.rootScope.dispatchEvent('peer_stories_hidden', {peerId, hidden: newStoriesHidden});
      }
    };
  }

  public saveStoriesStories(
    storiesStories: StoriesStories,
    cache: StoriesPeerCache,
    cacheType?: StoriesCacheType,
    syncAlbumsCache?: boolean
  ) {
    this.appPeersManager.saveApiPeers(storiesStories);
    const storyItems = this.saveStoryItems(storiesStories.stories, cache, cacheType, syncAlbumsCache) as StoryItem.storyItem[];

    if(TEST_NO_STORIES) {
      storyItems.splice(0, Infinity);
    }

    return storyItems;
  }

  /** `asked`: the question it answers (`askPeerStories`), when it is not taken yet: what came of the peer since is newer */
  public savePeerStories(peerStories: PeerStories, asked?: number) {
    const peerId = this.appPeersManager.getPeerId(peerStories.peer);
    const cache = this.getPeerStoriesCache(peerId);
    if(asked !== undefined && !this.takePeerStoriesAnswer(cache, asked)) {
      return this.convertPeerStoriesCache(cache);
    }

    if(TEST_NO_STORIES) {
      peerStories.stories = [];
    }

    if(TEST_SKIPPED) {
      peerStories.stories = peerStories.stories.map((storyItem) => {
        return {
          _: 'storyItemSkipped',
          id: storyItem.id,
          date: (storyItem as StoryItem.storyItem).date,
          expire_date: (Date.now() / 1000 | 0) + 86400,
          pFlags: {}
        };
      });
    }

    const cacheType = this.getCacheTypeForPeerId(peerId, true);
    // * the read state only grows: one already known from an update can be newer than this answer
    peerStories.max_read_id = cache.maxReadId = Math.max(cache.maxReadId ?? 0, peerStories.max_read_id ?? 0);
    cache.loaded = true;
    peerStories.stories = this.saveStoryItems(peerStories.stories, cache, cacheType, true);

    if(cache.dispatchStoriesEvent) {
      delete cache.dispatchStoriesEvent;
      this.rootScope.dispatchEvent('peer_stories', {
        peerId,
        available: cache.stories.length > 0
      });
    }

    return peerStories;
  }

  public getUnreadType(peerId: PeerId, storyId?: number, cache = this.getPeerStoriesCache(peerId)): StoriesSegment['type'] {
    storyId ??= cache.stories[cache.stories.length - 1];
    if(!storyId && !cache.dispatchStoriesEvent) {
      cache.dispatchStoriesEvent = true;
      this.getPeerStories(peerId);
    }

    if(!storyId) {
      return;
    }

    // * the read state can be known before the story itself (`requestReadTills`)
    return storyId > cache.maxReadId ? (cache.storiesMap.get(storyId)?.pFlags.close_friends ? 'close' : 'unread') : 'read';
  }

  public getPeerStoriesSegments(peerId: PeerId): StoriesSegments | Promise<StoriesSegments> {
    const cache = this.getPeerStoriesCache(peerId);
    if(!cache.loaded) {
      return callbackify(this.getPeerStories(peerId), () => this.getPeerStoriesSegments(peerId));
    }

    if(!cache.stories.length) {
      return;
    }

    const segments: StoriesSegments = [];
    let lastSegment: StoriesSegment;
    cache.stories.forEach((storyId) => {
      const type = this.getUnreadType(peerId, storyId, cache);
      if(lastSegment?.type !== type) {
        lastSegment = {
          length: 1,
          type
        };

        segments.push(lastSegment);
      } else {
        ++lastSegment.length;
      }
    });

    return segments;
  }

  public getPeersStoriesSegments(peerIds: PeerId[]) {
    return Promise.all(peerIds.map(async(peerId) => ({
      peerId,
      segments: await this.getPeerStoriesSegments(peerId)
    })));
  }

  public deleteStories(peerId: PeerId, ids: StoryItem['id'][]) {
    const cache = this.getPeerStoriesCache(peerId);
    const savedItems: MyStoryItem[] = [];
    for(const id of ids) {
      const item = cache.storiesMap.get(id);
      if(item) savedItems.push(item);
      this.handleDeletedStory(cache, id);
    }

    const promise = this.apiManager.invokeApi('stories.deleteStories', {
      peer: this.appPeersManager.getInputPeerById(peerId),
      id: ids
    });

    promise.catch(() => {
      for(const item of savedItems) {
        cache.deleted.delete(item.id);
        this.apiUpdatesManager.processLocalUpdate({
          _: 'updateStory',
          peer: this.appPeersManager.getOutputPeer(peerId),
          story: item
        });
      }
    });

    return promise;
  }

  public async getStorySettings(peerId: PeerId, id: number): Promise<StorySettings> {
    this.assertStorySettingsRights(peerId, id);
    const personal = peerId.isUser();
    const [result, closeFriends, hideFrom] = await Promise.all([
      this.apiManager.invokeApiSingle('stories.getStoriesByID', {
        peer: this.appPeersManager.getInputPeerById(peerId),
        id: [id]
      }),
      personal ? this.appUsersManager.getCloseFriends() : [],
      personal ? this.appUsersManager.getStoryBlockedPeerIds() : []
    ]);
    const items = this.saveStoriesStories(result, this.getPeerStoriesCache(peerId), undefined, true);
    const story = items.find((story) => story.id === id);
    if(!story || (personal && !story.privacy)) throw new Error('STORY_ID_INVALID');
    this.assertStorySettingsRights(peerId, id);
    const privacyType = personal ? getStoryPrivacyType(story) || 'selected' : 'public';
    const {allowPeers, disallowPeers} = getPrivacyRulesDetails(personal ? story.privacy : []);
    const toPeerIds = (peers: typeof allowPeers) => peers.users.map((id) => id.toPeerId())
    .concat(peers.chats.map((id) => id.toPeerId(true)));
    const excluded = toPeerIds(disallowPeers);
    return {
      ...(!personal ? {peerType: this.appChatsManager.isMegagroup(peerId.toChatId()) ? 'group' as const : 'channel' as const} : {}),
      privacyType,
      everyoneExcept: privacyType === 'public' ? excluded : [],
      contactsExcept: privacyType === 'contacts' ? excluded : [],
      selectedContacts: toPeerIds(allowPeers),
      closeFriends,
      hideFrom,
      allowScreenshots: !story.pFlags.noforwards,
      keepOnPage: !!story.pFlags.pinned
    };
  }

  public canEditStorySettings(peerId: PeerId, id: number) {
    if(peerId.isUser()) return peerId === this.appPeersManager.peerId;
    return this.appChatsManager.getChat(peerId.toChatId())?._ === 'channel' && this.hasRights(peerId, id, 'pin');
  }

  private assertStorySettingsRights(peerId: PeerId, id: number) {
    if(!this.canEditStorySettings(peerId, id)) throw new Error('STORY_EDIT_FORBIDDEN');
  }

  public saveStorySettings(peerId: PeerId, id: number, settings: StorySettings, previous: StorySettings) {
    // Account lists are shared by all stories and tabs. Serialize their read/modify/write cycle.
    return (this.settingsSaveQueue ??= createSerializedQueue()).enqueue(() => this.saveStorySettingsInternal(peerId, id, settings, previous));
  }

  private async saveStorySettingsInternal(peerId: PeerId, id: number, settings: StorySettings, previous: StorySettings): Promise<StorySettingsSaveResult> {
    this.assertStorySettingsRights(peerId, id);
    if(!peerId.isUser()) {
      if(settings.keepOnPage !== previous.keepOnPage) {
        await this.togglePinned(peerId, id, settings.keepOnPage);
      }
      return {saved: true, applied: {keepOnPage: settings.keepOnPage}};
    }
    const privacyList = (value: StorySettings) => value.privacyType === 'public' ? value.everyoneExcept :
      value.privacyType === 'contacts' ? value.contactsExcept : value.privacyType === 'selected' ? value.selectedContacts : [];
    const privacyChanged = settings.privacyType !== previous.privacyType ||
      !deepEqual([...privacyList(settings)].sort(), [...privacyList(previous)].sort());
    const rules: InputPrivacyRule[] = [];
    const list = privacyList(settings);
    const users = list.filter((peerId) => peerId.isUser()).map((peerId) => this.appUsersManager.getUserInput(peerId.toUserId()));
    const chats = list.filter((peerId) => peerId.isAnyChat()).map((peerId) => peerId.toChatId());
    // Exceptions must precede the catch-all audience rule.
    if(users.length || settings.privacyType === 'selected') rules.push({_: settings.privacyType === 'selected' ? 'inputPrivacyValueAllowUsers' : 'inputPrivacyValueDisallowUsers', users});
    if(chats.length) rules.push({_: settings.privacyType === 'selected' ? 'inputPrivacyValueAllowChatParticipants' : 'inputPrivacyValueDisallowChatParticipants', chats});
    switch(settings.privacyType) {
      case 'public': rules.push({_: 'inputPrivacyValueAllowAll'}); break;
      case 'contacts': rules.push({_: 'inputPrivacyValueAllowContacts'}); break;
      case 'close': rules.push({_: 'inputPrivacyValueAllowCloseFriends'}); break;
      case 'selected': break;
      default: throw new Error('PRIVACY_VALUE_INVALID');
    }

    const added = (key: 'closeFriends' | 'hideFrom') => settings[key].filter((peerId) => !previous[key].includes(peerId));
    const removed = (key: 'closeFriends' | 'hideFrom') => previous[key].filter((peerId) => !settings[key].includes(peerId));
    const applied: Partial<StorySettings> = {};
    try {
      await this.appUsersManager.updateCloseFriends(added('closeFriends'), removed('closeFriends'));
      applied.closeFriends = [...settings.closeFriends];
      await this.appUsersManager.updateStoryBlockedPeers(added('hideFrom'), removed('hideFrom'));
      applied.hideFrom = [...settings.hideFrom];
      if(privacyChanged) {
        try {
          const updates = await this.apiManager.invokeApi('stories.editStory', {
            peer: this.appPeersManager.getInputPeerById(peerId),
            id,
            privacy_rules: rules
          });
          this.apiUpdatesManager.processUpdateMessage(updates);
        } catch(error) {
          if((error as ApiError).type !== 'STORY_NOT_MODIFIED') throw error;
        }
      }
      return {saved: true, applied: {...settings}};
    } catch{
      return {saved: false, applied};
    }
  }

  public togglePinned(peerId: PeerId, storyId: StoryItem['id'] | StoryItem['id'][], pinned: boolean) {
    storyId = toArray(storyId);
    return this.apiManager.invokeApiSingleProcess({
      method: 'stories.togglePinned',
      params: {
        peer: this.appPeersManager.getInputPeerById(peerId),
        id: storyId,
        pinned
      },
      processResult: (result) => {
        if(!result.length) {
          return;
        }

        const cache = this.getPeerStoriesCache(peerId);
        const newStories: StoryItem.storyItem[] = result.map((storyId) => {
          const story = cache.storiesMap.get(storyId);
          if(story?._ !== 'storyItem') {
            return;
          }

          // if(pinned) story.pFlags.pinned = true;
          // else delete story.pFlags.pinned;
          return {
            ...story,
            pFlags: {
              ...story.pFlags,
              pinned: pinned || undefined
            }
          };
        });

        this.saveStoryItems(newStories, cache, undefined, true);
      }
    });
  }

  /**
   * Puts the stories pinned to the top in `ids`' order, the ones left out unpinned, each at an index
   * of its own. Several of them move at once, so they all leave the list first and go back one by one
   * into what is still sorted.
   */
  private applyPinnedToTop(cache: StoriesPeerCache, ids: StoryItem['id'][]) {
    const changed = new Set([...cache.pinnedToTop.keys(), ...ids]);
    cache.pinnedToTop = new Map(ids.map((id, idx) => [id, idx]));
    changed.forEach((storyId) => indexOfAndSplice(cache.pinnedStories, storyId));
    changed.forEach((storyId) => {
      const storyItem = cache.storiesMap.get(storyId);
      if(storyItem) {
        this.saveStoryItem(storyItem, cache, StoriesCacheType.Pinned);
      }
    });
  }

  public async togglePinnedToTop(peerId: PeerId, storyIds: StoryItem['id'][], pin: boolean) {
    const oldPins = [...this.getPeerStoriesCache(peerId).pinnedToTop.entries()].sort((a, b) => a[1] - b[1]).map(([id]) => id);
    const newPins = pin ? oldPins.concat(storyIds) : oldPins.filter((id) => !storyIds.includes(id));
    const appConfig = await this.apiManager.getAppConfig();
    const limit = appConfig.stories_pinned_to_top_count_max ?? 3;
    if(newPins.length > limit) {
      const error = makeError('STORY_ID_TOO_MANY', '' + limit);
      throw error;
    }

    return this.apiManager.invokeApiSingleProcess({
      method: 'stories.togglePinnedToTop',
      params: {
        peer: this.appPeersManager.getInputPeerById(peerId),
        id: newPins
      },
      processResult: () => {
        this.applyPinnedToTop(this.getPeerStoriesCache(peerId), newPins);
      }
    });
  }

  public hasArchive() {
    return this.lists.archive.length > 0;
  }

  public getAllStories(next?: boolean, state?: string, hidden?: boolean) {
    const asked = this.askPeerStories();
    return this.apiManager.invokeApiSingleProcess({
      method: 'stories.getAllStories',
      params: {
        next,
        state,
        hidden
      },
      processResult: (storiesAllStories) => {
        assumeType<StoriesAllStories.storiesAllStories>(storiesAllStories);
        this.appPeersManager.saveApiPeers(storiesAllStories);

        storiesAllStories.peer_stories = storiesAllStories.peer_stories
        .map((peerStories) => this.savePeerStories(peerStories, asked))
        .filter((peerStories) => peerStories.stories.length);

        this.onUpdateStoriesStealthMode({
          _: 'updateStoriesStealthMode',
          stealth_mode: storiesAllStories.stealth_mode
        });

        this.requestReadTills();

        return storiesAllStories;
      }
    });
  }

  /**
   * How far the stories of every peer are read, asked once a session, once the feed has come (tdesktop
   * `Stories::requestReadTills`): the feed carries the read state of its own peers only, and this, a batch of
   * `updateReadStories`, that of everyone else - a peer seen elsewhere, whose stories were read on another device
   */
  private requestReadTills() {
    if(this.readTillsRequested) {
      return;
    }

    this.readTillsRequested = true;
    this.apiManager.invokeApiSingleProcess({
      method: 'stories.getAllReadPeerStories',
      processResult: (updates) => {
        // * applied at once, as tdesktop applies an answer without seq: a difference running then would drop it,
        // * and it is not asked again; a read mark only grows, so one the difference brings after does no harm
        this.apiUpdatesManager.processUpdateMessage(updates, {ignoreSyncLoading: true});
      }
    }).catch(() => {
      // * asked again with the next feed
      this.readTillsRequested = false;
    });
  }

  public getPeerStories(peerId: PeerId): MaybePromise<PeerStories> {
    const cache = this.getPeerStoriesCache(peerId);
    if(cache.loaded) {
      return this.convertPeerStoriesCache(cache);
    }

    const answered = cache.answered;
    const asked = this.askPeerStories();
    return this.apiManager.invokeApiSingleProcess({
      method: 'stories.getPeerStories',
      params: {
        peer: this.appPeersManager.getInputPeerById(peerId)
      },
      // * a request is joined only while nothing newer has come of the peer: one asked anew would otherwise join the
      // * very request it replaces, which waits on it
      options: {cacheKey: `${peerId}_${answered}`},
      processResult: (storiesPeerStories): MaybePromise<PeerStories> => {
        // * the answer to a later question came first (a poll that found them changed): they are asked for anew
        if(!this.takePeerStoriesAnswer(cache, asked)) {
          return this.getPeerStories(peerId);
        }

        this.appPeersManager.saveApiPeers(storiesPeerStories);
        return this.savePeerStories(storiesPeerStories.stories);
      }
    });
  }

  /**
   * Asks again what the peers on screen that the feed does not follow (`canPollPeerStories`) have in
   * stories, each at most once an interval and up to 100 a request, as the other apps do (iOS
   * `AccountViewTracker.refreshStoryStatsForPeerIds`, Android `UserListPoller`, Web A `usePeerStoriesPolling`)
   */
  public pollPeersStories(peerIds: PeerId[]) {
    const now = Date.now();
    const due = filterUnique(peerIds).filter((peerId) => {
      const polledAt = this.peerStoriesPolledAt.get(peerId);
      if((polledAt && now - polledAt < PEER_STORIES_POLL_INTERVAL) || !canPollPeerStories(this.getPeer(peerId))) {
        return false;
      }

      this.peerStoriesPolledAt.set(peerId, now);
      return true;
    });

    const promises: Promise<void>[] = [];
    for(let i = 0; i < due.length; i += PEER_STORIES_POLL_BATCH) {
      const slice = due.slice(i, i + PEER_STORIES_POLL_BATCH);
      const asked = this.askPeerStories();
      promises.push(this.apiManager.invokeApi('stories.getPeerMaxIDs', {
        id: slice.map((peerId) => this.appPeersManager.getInputPeerById(peerId))
      }).then((recentStories) => {
        recentStories.forEach((recentStory, index) => this.applyPeerRecentStory(slice[index], recentStory, asked));
      }, noop));
    }

    return Promise.all(promises).then(noop);
  }

  /**
   * What `stories.getPeerMaxIDs` says a peer has in stories, to question `asked` (`askPeerStories`): the peer takes
   * it, telling the avatars when it gains or loses them, and its stories held here, no longer the ones it has, are read
   * again when asked for - unless what came of the peer meanwhile (its stories, another poll) is newer
   */
  private applyPeerRecentStory(peerId: PeerId, recentStory: RecentStory, asked: number) {
    const peer = this.getPeer(peerId);
    const cache = this.getPeerStoriesCache(peerId, false);
    if(!peer || (cache && !this.takePeerStoriesAnswer(cache, asked))) {
      return;
    }

    // * a summary without max_id: the peer has no active stories
    const maxId = recentStory?.max_id;
    const live = !!recentStory?.pFlags?.live;
    const previous = peer.stories_max_id;
    const peerChanged = previous ? previous.max_id !== maxId || !!previous.pFlags?.live !== live : !!maxId;
    // * the stories held whole end at the newest: the peer may have been told of a newer one elsewhere (a profile, a
    // * message's author) while they were not read again
    const cacheBehind = !!cache?.loaded && cache.stories[cache.stories.length - 1] !== maxId;
    if(!peerChanged && !cacheBehind) {
      return;
    }

    // * the stories on their way, asked for before (`getPeerStories`), are not taken either
    if(cacheBehind) {
      // * with none left there is nothing to read again
      const held = cache.stories.splice(0);
      cache.loaded = !maxId;
      this.updateListCachePosition(cache);

      // * the stores and an open viewer follow: those no longer there leave as expired ones do (`checkExpired`, which
      // * will not find them now), and those there are now - read at once, as the avatars read them - are told
      const expire = (ids: StoryItem['id'][]) => ids.forEach((id) => this.rootScope.dispatchEvent('story_expired', {peerId, id}));
      if(!maxId) {
        expire(held);
      } else {
        Promise.resolve(this.getPeerStories(peerId)).then((peerStories) => {
          const ids = new Set(peerStories.stories.map(({id}) => id));
          expire(held.filter((id) => !ids.has(id)));
          this.rootScope.dispatchEvent('stories_stories', peerStories);
        }, noop);
      }
    }

    if(peerChanged) {
      // * a peer without `stories_max_id` says nothing of its stories (saveApiPeerStories): having none takes the flag
      const pFlags = {...peer.pFlags};
      const newPeer = {...peer, pFlags} as typeof peer;
      if(maxId) {
        newPeer.stories_max_id = recentStory;
        delete pFlags.stories_unavailable;
      } else {
        delete newPeer.stories_max_id;
        pFlags.stories_unavailable = true;
      }

      if(peerId.isUser()) this.appUsersManager.saveApiUsers([newPeer as User.user]);
      else this.appChatsManager.saveApiChats([newPeer as Chat.channel]);
    }

    // * gaining or losing them is told by saving the peer; new ones beside the old, or old ones held, are told here
    if(previous && maxId) {
      this.rootScope.dispatchEvent('peer_stories', {peerId, available: true});
    }
  }

  /**
   * The link to a story, as tdesktop gives it (`ApiWrap::exportDirectStoryLink`): the one the server exported
   * for it before; else the one by its peer's username at once, while the server is asked for its own for the
   * next time; a peer without a username has only the server's (`stories_export_nopublic_link`)
   */
  public getStoryLink(peerId: PeerId, id: StoryItem['id']): MaybePromise<string> {
    const username = this.appPeersManager.getPeerUsername(peerId);
    // * by the username it was exported under, which the link names: a peer that changed it is asked again
    const key = `${peerId}_${id}_${username}`;
    const exported = this.exportedStoryLinks.get(key);
    if(exported) {
      return exported;
    }

    const promise = this.apiManager.invokeApiSingleProcess({
      method: 'stories.exportStoryLink',
      params: {
        peer: this.appPeersManager.getInputPeerById(peerId),
        id
      },
      options: {cacheKey: key},
      processResult: ({link}) => {
        this.exportedStoryLinks.set(key, link);
        return link;
      }
    });

    if(!username) {
      return promise;
    }

    promise.catch(noop);
    return makeStoryLink(username, id);
  }

  private getCachedStories(cache: StoriesPeerCache, pinned: boolean, limit: number, offsetId: number) {
    let array = pinned ? cache.pinnedStories : cache.archiveStories;

    if(pinned && cache.pinnedToTop?.size && offsetId) {
      array = array.slice(cache.pinnedToTop.size);
    }

    const index = offsetId ? array.findIndex((storyId) => storyId < offsetId) : 0;
    if(index !== -1) {
      const sliced = array.slice(index, index + limit);
      if(sliced.length === limit || (pinned ? cache.pinnedLoadedAll : cache.archiveLoadedAll)) {
        return sliced.map((storyId) => cache.storiesMap.get(storyId)) as StoryItem.storyItem[];
      }
    }
  }

  private processLoadedStoriesStories(
    cache: StoriesPeerCache,
    pinned: boolean,
    limit: number,
    storiesStories: StoriesStories
  ) {
    if(pinned) {
      cache.pinnedToTop = new Map((storiesStories.pinned_to_top || []).map((storyId, idx) => [storyId, idx]));
    }

    const length = storiesStories.stories.length;
    const storyItems = this.saveStoriesStories(
      storiesStories,
      cache,
      pinned ? StoriesCacheType.Pinned : StoriesCacheType.Archive
    );
    if(pinned) {
      cache.pinnedCount = storiesStories.count;
    } else {
      cache.archiveCount = storiesStories.count;
    }
    const array = pinned ? cache.pinnedStories : cache.archiveStories;
    if(array.length === storiesStories.count || length < limit) {
      if(pinned) cache.pinnedLoadedAll = true;
      else cache.archiveLoadedAll = true;
    }

    return {count: storiesStories.count, stories: storyItems, pinnedToTop: pinned ? cache.pinnedToTop : undefined};
  }

  private getCachedAlbumsList(peerId: PeerId): StoryAlbum[] {
    const cache = this.getPeerStoriesCache(peerId);
    return cache.albumsOrder?.map((albumId) => cache.albums.get(albumId).info) ?? [];
  }

  public getAlbums(peerId: PeerId, revalidate = false): MaybePromise<StoryAlbum[]> {
    const cache = this.getPeerStoriesCache(peerId);
    if(!revalidate && cache.albumsOrder && !cache.albumsStale) {
      return cache.albumsOrder.map((albumId) => cache.albums.get(albumId).info);
    }

    return this.apiManager.invokeApiSingleProcess({
      method: 'stories.getAlbums',
      params: {
        peer: this.appPeersManager.getInputPeerById(peerId),
        // * no hash before the first answer: `hash` is not optional, and an undefined one is logged as a missing param
        hash: cache.albumsHash ?? 0
      },
      processResult: (response) => {
        if(response._ === 'stories.albumsNotModified') {
          return cache.albumsOrder.map((albumId) => cache.albums.get(albumId).info);
        }

        this.saveAlbums(cache, response.albums);
        cache.albumsHash = response.hash;
        return response.albums;
      }
    });
  }

  /** Takes the albums as the server lists them; what was loaded of an album that stays is kept */
  private saveAlbums(cache: StoriesPeerCache, albums: StoryAlbum[]) {
    cache.albumsOrder = albums.map((album) => album.album_id);
    cache.albumsStale = false;
    for(const album of albums) {
      if(album.icon_photo) this.appPhotosManager.savePhoto(album.icon_photo);
      if(album.icon_video) this.appDocsManager.saveDoc(album.icon_video);
      const cachedAlbum = cache.albums.get(album.album_id);
      if(cachedAlbum) {
        cachedAlbum.info = album;
      } else {
        cache.albums.set(album.album_id, {info: album, ids: [], count: 0, loadedAll: false});
      }
    }

    for(const albumId of cache.albums.keys()) {
      if(!cache.albumsOrder.includes(albumId)) {
        cache.albums.delete(albumId);
      }
    }
  }

  public getPinnedStories(
    peerId: PeerId,
    limit: number,
    offsetId: number = 0
  ): MaybePromise<{count: number, stories: StoryItem.storyItem[], pinnedToTop: StoriesPeerCache['pinnedToTop']}> {
    const cache = this.getPeerStoriesCache(peerId);
    const slice = this.getCachedStories(cache, true, limit, offsetId);
    if(slice) {
      return {count: cache.pinnedCount ?? cache.pinnedStories.length, stories: slice, pinnedToTop: cache.pinnedToTop};
    }

    return this.apiManager.invokeApiSingleProcess({
      method: 'stories.getPinnedStories',
      params: {
        peer: this.appPeersManager.getInputPeerById(peerId),
        limit,
        offset_id: offsetId
      },
      processResult: (response) => { // * response list can have same story if it's pinned to top
        this.processLoadedStoriesStories(cache, true, limit, response);
        return this.getPinnedStories(peerId, limit, offsetId);
      }
    });
  }

  public getAlbumStories(
    peerId: PeerId,
    albumId: number,
    limit: number,
    offsetId: number = 0
  ): MaybePromise<{count: number, stories: StoryItem.storyItem[]}> {
    const cache = this.getPeerStoriesCache(peerId);
    let cachedAlbum = cache.albums.get(albumId);
    if(!cachedAlbum) {
      const result = this.getAlbums(peerId);
      const after = () => {
        cachedAlbum = cache.albums.get(albumId);
        if(!cachedAlbum) return {count: 0 as number, stories: [] as StoryItem.storyItem[]};
        return this.getAlbumStories(peerId, albumId, limit, offsetId);
      };
      return result instanceof Promise ? result.then(after) : after();
    }

    // * an album that could not be read again after a refused write is read anew from its top
    if(cachedAlbum.stale && !offsetId) {
      cachedAlbum.ids = [];
      cachedAlbum.loadedAll = false;
      cachedAlbum.stale = false;
      cachedAlbum.generation = (cachedAlbum.generation ?? 0) + 1;
    }

    let slice: StoryItem.storyItem[] | undefined;
    // * an album keeps the order its owner gave it, not the stories' own: the next page starts right
    // * after the story it is asked from, by date only once that one has left the album
    let index = 0;
    if(offsetId) {
      index = cachedAlbum.ids.indexOf(offsetId);
      index = index === -1 ? cachedAlbum.ids.findIndex((storyId) => storyId < offsetId) : index + 1;
    }

    if(index !== -1) {
      const sliced = cachedAlbum.ids.slice(index, index + limit);
      if(sliced.length === limit || cachedAlbum.loadedAll) {
        slice = sliced.map((storyId) => cache.storiesMap.get(storyId)) as StoryItem.storyItem[];
      }
    }

    if(slice) {
      return {count: cachedAlbum.count, stories: slice};
    }

    // * a page is a place in the album, not what one request brings: the stories after the last of those the asker
    // * has, where they stand once it has come - the album can be rearranged, added to on top, or loaded further by
    // * another read meanwhile
    const had = new Set(index === -1 ? cachedAlbum.ids : cachedAlbum.ids.slice(0, index));
    const getPageIds = () => {
      const ids = cachedAlbum.ids;
      let start = ids.length;
      while(start && !had.has(ids[start - 1])) {
        --start;
      }

      return ids.slice(start, start + limit);
    };
    const generation = cachedAlbum.generation;
    const fetchPage = (offset: number): Promise<{count: number, stories: StoryItem.storyItem[]}> => this.apiManager.invokeApiSingleProcess({
      method: 'stories.getAlbumStories',
      params: {
        peer: this.appPeersManager.getInputPeerById(peerId),
        album_id: albumId,
        limit,
        offset
      },
      // * a request is joined only within the list it was asked of: the page asked anew of a replaced list would
      // * otherwise join the very request that asks for it, which waits on it
      options: {cacheKey: `${peerId}_${albumId}_${limit}_${offset}_${generation}`},
      processResult: (response) => {
        this.saveStoriesStories(response, cache);
        // * the list was replaced while the page loaded (read again from the server): the page is asked of it anew
        if(cachedAlbum.generation !== generation) {
          return this.getAlbumStories(peerId, albumId, limit, offsetId);
        }

        const fetched: number[] = [];
        for(const story of response.stories) {
          if(story._ !== 'storyItemDeleted' && !cachedAlbum.ids.includes(story.id)) {
            cachedAlbum.ids.push(story.id);
            fetched.push(story.id);
          }
        }
        cachedAlbum.count = response.count;
        cachedAlbum.loadedAll = cachedAlbum.ids.length === response.count;

        const ids = getPageIds();
        const page = {count: cachedAlbum.count, stories: ids.map((storyId) => cache.storiesMap.get(storyId)) as StoryItem.storyItem[]};
        // * a short page means the end of the album
        if(ids.length < limit && !cachedAlbum.loadedAll) {
          // * stories added meanwhile shift the server's pages down, which then repeat what is had. One of nothing
          // * but those says they shifted by its length at least: the next new one is further on
          if(!fetched.length && response.stories.length) {
            return fetchPage(offset + response.stories.length);
          }

          // * one that repeats a part is filled up
          if(fetched.length) {
            return callbackify(
              this.getAlbumStories(peerId, albumId, limit - ids.length, ids[ids.length - 1]),
              (more) => ({count: more.count, stories: page.stories.concat(more.stories)})
            );
          }
        }

        return page;
      }
    });

    return fetchPage(cachedAlbum.ids.length);
  }

  public async createAlbum(peerId: PeerId, title: string, storyIds?: number[]) {
    const album = await this.writeAlbums(peerId, () => this.apiManager.invokeApi('stories.createAlbum', {
      peer: this.appPeersManager.getInputPeerById(peerId),
      title,
      stories: storyIds ?? []
    }));

    const cache = this.getPeerStoriesCache(peerId);
    cache.albums.set(album.album_id, {
      info: album,
      // * each story goes first as it is added, the last one ending up at the top
      ids: storyIds?.slice().reverse() ?? [],
      count: storyIds?.length ?? 0,
      loadedAll: true
    });
    if(!cache.albumsOrder) cache.albumsOrder = [];
    cache.albumsOrder.push(album.album_id);
    cache.albumsHash = undefined;

    // * the stories it was made with are in it now, as updateAlbum puts them
    storyIds?.forEach((id) => {
      const story = this.getStoryByIdCached(peerId, id);
      if(story?._ === 'storyItem' && !story.albums?.includes(album.album_id)) {
        (story.albums ??= []).push(album.album_id);
      }
    });

    this.rootScope.dispatchEvent('story_album_created', {
      peerId,
      albumId: album.album_id,
      albums: this.getCachedAlbumsList(peerId)
    });
    return album;
  }

  public async updateAlbum(
    peerId: PeerId,
    albumId: number,
    opts: {
      title?: string,
      addStories?: number[],
      deleteStories?: number[]
    }) {
    const cache = this.getPeerStoriesCache(peerId);
    const cachedAlbum = cache.albums.get(albumId);
    // snapshot
    const oldStoryAlbums = new Map<number, number[] | undefined>();

    // optimistically update cache and dispatch
    if(opts.addStories) {
      for(const id of opts.addStories) {
        const s = this.getStoryByIdCached(peerId, id);
        if(s?._ === 'storyItem') {
          oldStoryAlbums.set(id, s.albums?.slice());
          s.albums ??= [];
          if(!s.albums.includes(albumId)) s.albums.push(albumId);
        }
      }
    }

    if(opts.deleteStories) {
      for(const id of opts.deleteStories) {
        const s = this.getStoryByIdCached(peerId, id);
        if(s?._ === 'storyItem') {
          oldStoryAlbums.set(id, s.albums?.slice());
          if(s.albums) s.albums = s.albums.filter((a) => a !== albumId);
        }
      }
    }

    if(cachedAlbum) {
      if(opts.addStories) {
        let addedCount = 0;
        for(const id of opts.addStories) {
          const hadId = cachedAlbum.ids.includes(id);
          const hadAlbum = hadId || oldStoryAlbums.get(id)?.includes(albumId);
          // * the server puts each one first, the last one ending up at the top
          if(!hadId) cachedAlbum.ids.unshift(id);
          if(!hadAlbum) ++addedCount;
        }
        cachedAlbum.count += addedCount;
      }
      if(opts.deleteStories) {
        let deletedCount = 0;
        const deleteSet = new Set(opts.deleteStories);
        for(const id of deleteSet) {
          if(cachedAlbum.ids.includes(id) || oldStoryAlbums.get(id)?.includes(albumId)) {
            ++deletedCount;
          }
        }
        cachedAlbum.ids = cachedAlbum.ids.filter((id) => !opts.deleteStories.includes(id));
        cachedAlbum.count = Math.max(0, cachedAlbum.count - deletedCount);
      }
      if(opts.title) {
        cachedAlbum.info.title = opts.title;
      }
    }
    cache.albumsHash = undefined;

    const addedItems = opts.addStories?.map((id) => this.getStoryByIdCached(peerId, id)).filter((s): s is StoryItem.storyItem => !!s && s._ === 'storyItem');
    this.rootScope.dispatchEvent('story_album_updated', {
      peerId,
      albumId,
      addStories: addedItems?.length ? addedItems : undefined,
      deleteStories: opts.deleteStories,
      albums: this.getCachedAlbumsList(peerId)
    });

    const send = () => this.apiManager.invokeApi('stories.updateAlbum', {
      peer: this.appPeersManager.getInputPeerById(peerId),
      album_id: albumId,
      title: opts.title,
      add_stories: opts.addStories,
      delete_stories: opts.deleteStories
    });

    // * a title is the albums' own, the stories the album's list (when it is kept): a refused write has them read again
    const lists: WrittenList[] = [];
    if(opts.title) lists.push(this.albumsList(peerId));
    if(cachedAlbum && (opts.addStories || opts.deleteStories)) lists.push(this.albumList(peerId, albumId));

    try {
      const album = await this.writeLists(lists, send);
      if(cachedAlbum) {
        cachedAlbum.info = album;
        // * the title as the server keeps it
        if(opts.title) {
          this.rootScope.dispatchEvent('story_albums_updated', {peerId, albums: this.getCachedAlbumsList(peerId)});
        }
      }

      return album;
    } catch(err) {
      // revert caches and dispatch
      for(const [id, oldAlbums] of oldStoryAlbums) {
        const s = this.getStoryByIdCached(peerId, id);
        if(s?._ === 'storyItem') s.albums = oldAlbums;
      }

      cache.albumsHash = undefined;

      this.rootScope.dispatchEvent('story_album_updated', {
        peerId,
        albumId,
        albums: this.getCachedAlbumsList(peerId)
      });

      throw err;
    }
  }

  /**
   * The writes to a peer's lists - the albums, or an album's stories: their order, what comes in or goes out -
   * reach the server one after another, each already shown. A write waits for, and counts in, every list it
   * changes. A refused one is not guessed back: once the last write of a list has settled, the list is read again
   * from the server and shown as the server has it, unless a write came while it was read, after which it is read
   * again.
   */
  private writeLists<T>(lists: WrittenList[], send: () => Promise<T>): Promise<T> {
    const states = lists.map(({key}) => {
      let list = this.listWrites.get(key);
      if(!list) {
        this.listWrites.set(key, list = {queue: Promise.resolve(), pending: 0, refused: false});
      }

      ++list.pending;
      return list;
    });

    const promise = Promise.all(states.map((list) => list.queue)).then(send);
    lists.forEach(({reload, invalidate}, idx) => {
      const list = states[idx];
      list.queue = promise.then(noop, () => {
        list.refused = true;
      }).then(async() => {
        if(--list.pending || !list.refused) {
          return;
        }

        let apply: () => void;
        try {
          apply = await reload();
        } catch(err) {
          // * still to be read: with the list's next write, or when it is shown next
          invalidate();
          return;
        }

        if(!list.pending) {
          list.refused = false;
          apply();
        }
      });
    });

    return promise;
  }

  /** The albums themselves: their order, titles, which there are */
  private albumsList(peerId: PeerId): WrittenList {
    const cache = this.getPeerStoriesCache(peerId);
    return {
      key: `albums_${peerId}`,
      reload: () => this.reloadAlbums(peerId),
      invalidate: () => {
        cache.albumsStale = true;
      }
    };
  }

  /** An album's stories: their order, which there are */
  private albumList(peerId: PeerId, albumId: number): WrittenList {
    const cache = this.getPeerStoriesCache(peerId);
    return {
      key: `album_${peerId}_${albumId}`,
      reload: () => this.reloadAlbumStories(peerId, albumId),
      invalidate: () => {
        const cachedAlbum = cache.albums.get(albumId);
        if(cachedAlbum) cachedAlbum.stale = true;
      }
    };
  }

  private writeAlbums<T>(peerId: PeerId, send: () => Promise<T>) {
    return this.writeLists([this.albumsList(peerId)], send);
  }

  private writeAlbum<T>(peerId: PeerId, albumId: number, send: () => Promise<T>) {
    return this.writeLists([this.albumList(peerId, albumId)], send);
  }

  private reloadAlbums(peerId: PeerId) {
    const cache = this.getPeerStoriesCache(peerId);
    return this.apiManager.invokeApi('stories.getAlbums', {
      peer: this.appPeersManager.getInputPeerById(peerId),
      hash: 0
    }).then((response) => () => {
      if(response._ === 'stories.albumsNotModified') {
        return;
      }

      this.saveAlbums(cache, response.albums);
      cache.albumsHash = response.hash;
      this.rootScope.dispatchEvent('story_albums_updated', {peerId, albums: this.getCachedAlbumsList(peerId)});
    });
  }

  /** Reads an album's first stories again, as many as it had loaded, the rest to be loaded anew as they are paged to */
  private async reloadAlbumStories(peerId: PeerId, albumId: number) {
    const cache = this.getPeerStoriesCache(peerId);
    // * as far as it was loaded, a page of the server's at most at a time
    const loaded = Math.max(30, cache.albums.get(albumId)?.ids.length ?? 0);
    const stories: StoryItem[] = [];
    let response: StoriesStories;
    do {
      response = await this.apiManager.invokeApi('stories.getAlbumStories', {
        peer: this.appPeersManager.getInputPeerById(peerId),
        album_id: albumId,
        offset: stories.length,
        limit: Math.min(100, loaded - stories.length)
      });
      stories.push(...response.stories);
    } while(response.stories.length && stories.length < loaded && stories.length < response.count);

    return () => {
      const cachedAlbum = cache.albums.get(albumId);
      if(!cachedAlbum) {
        return;
      }

      this.saveStoriesStories({...response, stories}, cache);
      cachedAlbum.ids = filterUnique(stories.filter((story) => story._ !== 'storyItemDeleted').map((story) => story.id));
      cachedAlbum.count = response.count;
      cachedAlbum.loadedAll = cachedAlbum.ids.length === response.count;
      cachedAlbum.stale = false;
      cachedAlbum.generation = (cachedAlbum.generation ?? 0) + 1;
      cache.albumsHash = undefined;
      this.rootScope.dispatchEvent('story_album_updated', {peerId, albumId, albums: this.getCachedAlbumsList(peerId)});
    };
  }

  /** Gives the albums a new order, as the chips have already been rearranged */
  public reorderAlbums(peerId: PeerId, order: number[]) {
    const cache = this.getPeerStoriesCache(peerId);
    if(!cache.albumsOrder) {
      return;
    }

    // * sent as it is now: the list itself may change before the request goes
    order = putInOrder(cache.albumsOrder, order);
    cache.albumsOrder = order.slice();
    cache.albumsHash = undefined;
    this.rootScope.dispatchEvent('story_albums_updated', {peerId, albums: this.getCachedAlbumsList(peerId)});
    return this.writeAlbums(peerId, () => this.apiManager.invokeApi('stories.reorderAlbums', {
      peer: this.appPeersManager.getInputPeerById(peerId),
      order
    }));
  }

  /**
   * Gives an album's stories a new order, as its tiles have already been rearranged; the ones it leaves out go
   * after the others, as the server puts them
   */
  public reorderAlbumStories(peerId: PeerId, albumId: number, order: number[]) {
    const cache = this.getPeerStoriesCache(peerId);
    const cachedAlbum = cache.albums.get(albumId);
    if(!cachedAlbum) {
      return;
    }

    // * sent as it is now: the list itself may change before the request goes
    order = putInOrder(cachedAlbum.ids, order);
    cachedAlbum.ids = order.slice();
    cache.albumsHash = undefined;
    this.rootScope.dispatchEvent('story_album_updated', {peerId, albumId, albums: this.getCachedAlbumsList(peerId)});
    return this.writeAlbum(peerId, albumId, () => this.apiManager.invokeApi('stories.updateAlbum', {
      peer: this.appPeersManager.getInputPeerById(peerId),
      album_id: albumId,
      order
    }));
  }

  public async deleteAlbum(peerId: PeerId, albumId: number) {
    await this.writeAlbums(peerId, () => this.apiManager.invokeApi('stories.deleteAlbum', {
      peer: this.appPeersManager.getInputPeerById(peerId),
      album_id: albumId
    }));

    const cache = this.getPeerStoriesCache(peerId);
    cache.albums.delete(albumId);
    if(cache.albumsOrder) {
      cache.albumsOrder = cache.albumsOrder.filter((id) => id !== albumId);
    }
    cache.albumsHash = undefined;
    this.rootScope.dispatchEvent('story_album_deleted', {peerId, albumId, albums: this.getCachedAlbumsList(peerId)});
  }

  public getStoriesArchive(peerId: PeerId, limit: number, offsetId: number = 0): ReturnType<AppStoriesManager['getPinnedStories']> {
    const cache = this.getPeerStoriesCache(peerId);
    const slice = this.getCachedStories(cache, false, limit, offsetId);
    if(slice) {
      return {count: cache.archiveCount ?? cache.archiveStories.length, stories: slice, pinnedToTop: undefined};
    }

    return this.apiManager.invokeApiSingleProcess({
      method: 'stories.getStoriesArchive',
      params: {
        peer: this.appPeersManager.getInputPeerById(peerId),
        limit,
        offset_id: offsetId
      },
      processResult: this.processLoadedStoriesStories.bind(this, cache, false, limit)
    });
  }

  /**
   * Public stories with a hashtag (`#tag` or `$tag`; only one peer's with `peerId`), or posted from a place —
   * `area` is the location area of a story, as it came. `offset` is the previous page's `nextOffset`, and a
   * page without one is the last
   */
  public searchStories({hashtag, area, peerId, offset, limit}: {
    hashtag?: string,
    area?: MediaArea,
    peerId?: PeerId,
    offset: string,
    limit: number
  }) {
    return this.apiManager.invokeApiSingleProcess({
      method: 'stories.searchPosts',
      params: {
        hashtag: hashtag?.replace(/^#/, ''),
        area,
        peer: peerId ? this.appPeersManager.getInputPeerById(peerId) : undefined,
        offset,
        limit
      },
      processResult: (foundStories) => {
        this.appPeersManager.saveApiPeers(foundStories);
        const stories: {peerId: PeerId, story: StoryItem.storyItem}[] = [];
        for(const foundStory of foundStories.stories) {
          const peerId = this.appPeersManager.getPeerId(foundStory.peer);
          const story = this.saveStoryItem(foundStory.story, this.getPeerStoriesCache(peerId), undefined, true);
          if(story?._ === 'storyItem' && story.media) {
            stories.push({peerId, story});
          }
        }

        return {count: foundStories.count, nextOffset: foundStories.next_offset, stories};
      }
    });
  }

  public fetchSingleStories(cache: StoriesPeerCache) {
    return cache.getStoriesPromise ??= pause(0).then(() => {
      const ids = [...cache.getStoriesPromises.keys()];

      const promise = this.apiManager.invokeApi('stories.getStoriesByID', {
        peer: this.appPeersManager.getInputPeerById(cache.peerId),
        id: ids
      }, {floodMaxTimeout: Infinity});

      const resolve = (storyItems: StoryItem.storyItem[]) => {
        const map: Map<typeof storyItems[0]['id'], typeof storyItems[0]> = new Map(
          storyItems.map((storyItem) => [storyItem.id, storyItem])
        );

        for(const id of ids) {
          const storyItem = map.get(id);
          if(!storyItem) {
            this.handleDeletedStory(cache, id);
          }

          const promise = cache.getStoriesPromises.get(id);
          cache.getStoriesPromises.delete(id);
          promise.resolve(storyItem);
        }
      };

      promise.then((storiesStories) => {
        const storyItems = this.saveStoriesStories(storiesStories, cache, undefined, true);
        resolve(storyItems);
      }, () => {
        resolve([]);
      }).then(() => {
        cache.getStoriesPromise = undefined;
        if(cache.getStoriesPromises.size) {
          this.fetchSingleStories(cache);
        }

        this.rootScope.dispatchEvent('stories_downloaded', {peerId: cache.peerId, ids});
      });
    });
  }

  public getStoryByIdCached(peerId: PeerId, id: StoryItem['id']): MyStoryItem {
    const cache = this.getPeerStoriesCache(peerId);
    return cache.storiesMap.get(id);
  }

  public getStoryById(peerId: PeerId, id: StoryItem['id'], overwrite?: boolean): MaybePromise<StoryItem.storyItem> {
    const cache = this.getPeerStoriesCache(peerId);
    const storyItem = cache.storiesMap.get(id);
    if(cache.deleted.has(id)) {
      return undefined;
    } else if(storyItem?._ === 'storyItem' && !overwrite) {
      return storyItem;
    } else {
      let promise = cache.getStoriesPromises.get(id);
      if(promise) {
        return promise;
      }

      cache.getStoriesPromises.set(id, promise = deferredPromise());
      this.fetchSingleStories(cache);
      return promise;
    }
  }

  public getStoriesById(peerId: PeerId, ids: StoryItem['id'][], overwrite?: boolean): MaybePromise<StoryItem.storyItem[]> {
    const arr = ids.map((id) => {
      return this.getStoryById(peerId, id, overwrite);
    });

    const hasPromise = arr.some((item) => item instanceof Promise);
    return hasPromise ? Promise.all(arr) : arr as StoryItem.storyItem[];
  }

  public readStories(peerId: PeerId, maxId: StoryItem['id']) {
    const cache = this.getPeerStoriesCache(peerId);
    if(cache.maxReadId !== undefined && cache.maxReadId >= maxId) {
      return;
    }

    this.apiUpdatesManager.processLocalUpdate({
      _: 'updateReadStories',
      peer: this.appPeersManager.getOutputPeer(peerId),
      max_id: maxId
    });

    if(TEST_READ) {
      return;
    }

    return this.apiManager.invokeApiSingleProcess({
      method: 'stories.readStories',
      params: {
        peer: this.appPeersManager.getInputPeerById(peerId),
        max_id: maxId
      }
    });
  }

  public incrementStoryViews(peerId: PeerId, ids: StoryItem['id'][]) {
    return this.apiManager.invokeApiSingleProcess({
      method: 'stories.incrementStoryViews',
      params: {
        peer: this.appPeersManager.getInputPeerById(peerId),
        id: ids
      }
    });
  }

  // * who saw one's own story, reacted to it, reposted it as a story of their own or forwarded it to a public
  // * chat (iOS, Android)
  public getStoryViewsList(peerId: PeerId, id: number, options: {
    limit: number,
    offset?: string,
    q?: string,
    justContacts?: boolean,
    reactionsFirst?: boolean
  }) {
    return this.apiManager.invokeApiSingleProcess({
      method: 'stories.getStoryViewsList',
      params: {
        peer: this.appPeersManager.getInputPeerById(peerId),
        id,
        limit: options.limit,
        offset: options.offset || '',
        q: options.q || undefined,
        just_contacts: options.justContacts || undefined,
        reactions_first: options.reactionsFirst || undefined
      },
      processResult: (storiesStoryViews): StoryInteractionsList => {
        this.appPeersManager.saveApiPeers(storiesStoryViews);
        return {
          count: storiesStoryViews.count,
          viewsCount: storiesStoryViews.views_count,
          items: storiesStoryViews.views.map((storyView) => {
            if(storyView._ === 'storyView') {
              return {
                _: 'view',
                peerId: storyView.user_id.toPeerId(false),
                date: storyView.date,
                reaction: storyView.reaction,
                blocked: !!storyView.pFlags.blocked,
                blockedMyStoriesFrom: !!storyView.pFlags.blocked_my_stories_from
              };
            }

            return this.saveStoryInteractionShare(storyView);
          }).filter((item): item is StoryInteraction => !!item),
          nextOffset: storiesStoryViews.next_offset
        };
      }
    });
  }

  // * the same for a channel's or a group's story, to those of its admins who edit its stories: who reacted to
  // * it, reposted or forwarded it (Android, iOS)
  public getStoryReactionsList(peerId: PeerId, id: number, options: {
    limit: number,
    offset?: string,
    forwardsFirst?: boolean
  }) {
    return this.apiManager.invokeApiSingleProcess({
      method: 'stories.getStoryReactionsList',
      params: {
        peer: this.appPeersManager.getInputPeerById(peerId),
        id,
        limit: options.limit,
        offset: options.offset || undefined,
        forwards_first: options.forwardsFirst || undefined
      },
      processResult: (storiesStoryReactions): StoryInteractionsList => {
        this.appPeersManager.saveApiPeers(storiesStoryReactions);
        return {
          count: storiesStoryReactions.count,
          items: storiesStoryReactions.reactions.map((storyReaction) => {
            if(storyReaction._ === 'storyReaction') {
              return {
                _: 'view',
                peerId: this.appPeersManager.getPeerId(storyReaction.peer_id),
                date: storyReaction.date,
                reaction: storyReaction.reaction
              };
            }

            return this.saveStoryInteractionShare(storyReaction);
          }).filter((item): item is StoryInteraction => !!item),
          nextOffset: storiesStoryReactions.next_offset
        };
      }
    });
  }

  private saveStoryInteractionShare(
    share: StoryView.storyViewPublicRepost | StoryView.storyViewPublicForward | StoryReaction.storyReactionPublicRepost | StoryReaction.storyReactionPublicForward
  ): StoryInteraction | undefined {
    if(share._ === 'storyViewPublicForward' || share._ === 'storyReactionPublicForward') {
      const message = this.appMessagesManager.saveMessage(share.message) as Message.message;
      if(message?._ !== 'message') {
        return;
      }

      return {
        _: 'forward',
        peerId: message.peerId,
        date: message.date,
        message
      };
    }

    const peerId = this.appPeersManager.getPeerId(share.peer_id);
    const story = this.saveStoryItem(share.story, this.getPeerStoriesCache(peerId));
    if(story?._ !== 'storyItem') {
      return;
    }

    return {
      _: 'repost',
      peerId,
      date: story.date,
      story
    };
  }

  // * the views of one's own stories, and the reactions to a channel's or a group's ones its stories' editors see
  // * (Android's viewsAllowed)
  public canViewStoryInteractions(peerId: PeerId) {
    if(peerId.isUser()) {
      return peerId === this.appPeersManager.peerId;
    }

    return this.appChatsManager.hasRights(peerId.toChatId(), 'edit_stories');
  }

  public getStoriesViews(peerId: PeerId, ids: number[]) {
    return this.apiManager.invokeApiSingleProcess({
      method: 'stories.getStoriesViews',
      params: {
        peer: this.appPeersManager.getInputPeerById(peerId),
        id: ids
      },
      processResult: (storiesStoryViews) => {
        this.appPeersManager.saveApiPeers(storiesStoryViews);

        const cache = this.getPeerStoriesCache(this.appPeersManager.peerId);
        storiesStoryViews.views.forEach((views, idx) => {
          const id = ids[idx];
          const storyItem = cache.storiesMap.get(id);
          if(!storyItem) {
            return;
          }

          this.saveStoryItems([{
            ...(storyItem as StoryItem.storyItem),
            views
          }], cache);
        });

        return storiesStoryViews.views;
      }
    });
  }

  public report(peerId: PeerId, id: number[], option: Uint8Array, message?: string) {
    return this.apiManager.invokeApiSingleProcess({
      method: 'stories.report',
      params: {
        peer: this.appPeersManager.getInputPeerById(peerId),
        id,
        option,
        message
      }
    });
  }

  public sendReaction(peerId: PeerId, id: number, reaction: Reaction) {
    reaction ??= {_: 'reactionEmpty'};
    const story = this.getStoryByIdCached(peerId, id) as StoryItem.storyItem;
    const views = story.views;
    const newSentReaction: Reaction = reaction._ === 'reactionEmpty' ? undefined : reaction;

    if(views) {
      const unsetPreviousReaction = () => {
        const reactionCount = views.reactions?.find((reactionCount) => reactionsEqual(reactionCount.reaction, story.sent_reaction));
        if(reactionCount) {
          --reactionCount.count;
          if(!reactionCount.count) {
            indexOfAndSplice(views.reactions, reactionCount);
          }
        }
      };

      views.reactions_count ??= 0;
      if(!story.sent_reaction && newSentReaction) {
        ++views.reactions_count;
      } else if(story.sent_reaction && !newSentReaction) {
        --views.reactions_count;
      }

      unsetPreviousReaction();
      if(newSentReaction) {
        let reactionCount = views.reactions?.find((reactionCount) => reactionsEqual(reactionCount.reaction, newSentReaction));
        if(!reactionCount) {
          views.reactions ??= [];
          views.reactions.push(reactionCount = {
            _: 'reactionCount',
            reaction: newSentReaction,
            count: 0
          });
        }

        ++reactionCount.count;
      }
    }

    this.saveStoryItems([{
      ...story,
      sent_reaction: newSentReaction
    }], this.getPeerStoriesCache(peerId));
    return this.apiManager.invokeApiSingleProcess({
      method: 'stories.sendReaction',
      params: {
        peer: this.appPeersManager.getInputPeerById(peerId),
        reaction,
        story_id: id
      },
      processResult: (updates) => {
        this.apiUpdatesManager.processUpdateMessage(updates);
      }
    });
  }

  protected handleDeletedStory(cache: StoriesPeerCache, id: StoryItem['id']) {
    cache.deleted.add(id);
    const storyItem = cache.storiesMap.get(id);
    const hadPinned = cache.pinnedStories.includes(id);
    const hadArchive = cache.archiveStories.includes(id);
    if(!cache.storiesMap.delete(id)) {
      return;
    }

    [
      cache.stories,
      cache.pinnedStories,
      cache.archiveStories
    ].forEach((array) => {
      indexOfAndSplice(array, id);
    });

    if(hadPinned && cache.pinnedCount !== undefined) {
      cache.pinnedCount = Math.max(0, cache.pinnedCount - 1);
    }

    if(hadArchive && cache.archiveCount !== undefined) {
      cache.archiveCount = Math.max(0, cache.archiveCount - 1);
    }

    this.removeStoryFromAlbumsCache(cache, storyItem);

    this.updateListCachePosition(cache);
    this.rootScope.dispatchEvent('story_deleted', {peerId: cache.peerId, id});
  }

  public isSubcribedToPeer(peerId: PeerId) {
    if(peerId.isUser()) {
      return this.appUsersManager.isContact(peerId.toUserId());
    } else {
      const chatId = peerId.toChatId();
      return (this.appChatsManager.isBroadcast(chatId) || this.appChatsManager.isMegagroup(chatId)) &&
        this.appChatsManager.isInChat(chatId);
    }
  }

  public getCacheTypeForPeerId(peerId: PeerId, ignoreNoSubscription?: boolean) {
    if(
      !this.isSubcribedToPeer(peerId) &&
      peerId !== this.changelogPeerId &&
      !ignoreNoSubscription
    ) {
      return;
    }

    return StoriesCacheType.Stories;
    // return user.pFlags.stories_hidden && this.appPeersManager.peerId === peerId ?
    //   StoriesCacheType.Archive :
    //   StoriesCacheType.Stories;
  }

  public isStoryExpired(story: StoryItem.storyItemSkipped | StoryItem.storyItem) {
    return story.expire_date <= tsNow(true);
  }

  public hasRights(peerId: PeerId, storyId: number, right: 'send' | 'edit' | 'delete' | 'archive' | 'pin') {
    if(peerId.isUser()) {
      return this.appPeersManager.peerId === peerId;
    }

    const chatId = peerId.toChatId();
    const story = this.getStoryByIdCached(peerId, storyId) as StoryItem.storyItem;
    const isMyStory = !!story?.pFlags.out;

    const canEdit = this.appChatsManager.hasRights(chatId, 'edit_stories');
    const canPost = this.appChatsManager.hasRights(chatId, 'post_stories');
    const canDelete = this.appChatsManager.hasRights(chatId, 'delete_stories');
    switch(right) {
      case 'send': {
        return canPost;
      }

      case 'edit': {
        return !isMyStory ? canEdit : canPost;
      }

      case 'delete': {
        return !isMyStory ? canDelete : canPost;
      }

      case 'archive': {
        return canEdit;
      }

      case 'pin': {
        return canEdit;
      }

      default: {
        return false;
      }
    }
  }

  /**
   * How a story of the peer is answered, as iOS and Android decide it: a user's privately, a group's in the
   * group when the member can write there. A member the group's own restrictions hold back has the field locked
   * until the group is boosted, where boosting lifts them (`boostsNeeded` more); a channel's story, or a member
   * banned in person, has no field
   */
  public async getReplyMode(peerId: PeerId): Promise<{mode: StoryReplyMode, boostsNeeded?: number}> {
    if(peerId.isUser()) {
      return {mode: peerId === this.appPeersManager.peerId ? 'none' : 'reply'};
    }

    const chatId = peerId.toChatId();
    if(this.appPeersManager.isBroadcast(peerId)) {
      return {mode: 'none'};
    }

    // * the boosts the member has given are on the full chat, and the rights below read them from it
    const chatFull = await this.appProfileManager.getChatFull(chatId) as ChatFull.channelFull;
    const [canSend, canSendPlain] = await Promise.all([
      this.appMessagesManager.canSendToPeer(peerId, undefined, 'send_messages'),
      this.appMessagesManager.canSendToPeer(peerId, undefined, 'send_plain')
    ]);
    if(canSend && canSendPlain) {
      return {mode: 'reply'};
    }

    // * boosting lifts the group's own restrictions only, and only where they are all that holds the member back:
    // * boosts can lift them there (not a broadcast group, not a ban in person), they are not enough yet, not a
    // * restricted peer or a frozen account
    const chat = this.appChatsManager.getChat(chatId) as Chat.channel;
    const bannedByDefault = chat?.default_banned_rights?.pFlags;
    const [isRestricted, appConfig] = await Promise.all([
      this.appPeersManager.isPeerRestricted(peerId),
      this.apiManager.getAppConfig()
    ]);
    if(
      !(bannedByDefault?.send_messages || bannedByDefault?.send_plain) ||
      !this.appChatsManager.canBoostsLiftRestriction(chatId, 'send_messages') ||
      !this.appChatsManager.canBoostsLiftRestriction(chatId, 'send_plain') ||
      this.appChatsManager.isRestrictionLiftedByBoosts(chatId, 'send_plain') ||
      isRestricted ||
      appConfig.freeze_since_date
    ) {
      return {mode: 'none'};
    }

    return {mode: 'boost', boostsNeeded: Math.max(1, chatFull.boosts_unrestrict - (chatFull.boosts_applied || 0))};
  }

  public hasRightsMany(peerId: PeerId, storyIds: number[], right: 'send' | 'edit' | 'delete' | 'archive' | 'pin') {
    return storyIds.every((storyId) => this.hasRights(peerId, storyId, right));
  }

  public cantPinDeleteStories(peerId: PeerId, storyIds: number[]) {
    let cantPin = !storyIds.length, cantDelete = !storyIds.length;
    for(const storyId of storyIds) {
      if(!cantPin) {
        cantPin = !this.hasRights(peerId, storyId, 'pin');
      }

      if(!cantDelete) {
        cantDelete = !this.hasRights(peerId, storyId, 'delete');
      }

      if(cantPin && cantDelete) break;
    }

    return {cantPin, cantDelete};
  }

  public toggleStoriesHidden(peerId: PeerId, hidden: boolean) {
    return this.apiManager.invokeApiSingleProcess({
      method: 'stories.togglePeerStoriesHidden',
      params: {
        peer: this.appPeersManager.getInputPeerById(peerId),
        hidden
      },
      processResult: () => {
        const peer = this.getPeer(peerId);
        const pFlags = {...peer.pFlags};
        if(hidden) pFlags.stories_hidden = true;
        else delete pFlags.stories_hidden;
        const newPeer: typeof peer = {
          ...peer,
          pFlags
        };
        if(peerId.isUser()) this.appUsersManager.saveApiUsers([newPeer as User.user]);
        else this.appChatsManager.saveApiChats([newPeer as Chat.channel]);
        this.appNotificationsManager.toggleStoriesMute(peerId, hidden || undefined, true);
      }
    });
  }

  /**
   * A user who is not a contact is in the feed only as a top correspondent: the server will not hide
   * their stories to the archive, dropping the rating takes them out instead (as Android does)
   */
  public removeTopPeerFromStories(peerId: PeerId) {
    return this.appUsersManager.resetTopPeerRating(peerId).then(() => {
      const cache = this.getPeerStoriesCache(peerId, false);
      if(cache?.position) {
        indexOfAndSplice(this.lists[cache.position.type], peerId);
        cache.position = undefined;
      }

      this.rootScope.dispatchEvent('stories_position', {peerId, position: undefined});
    });
  }

  /**
   * How a peer's stories leave the feed: a top correspondent who is not a contact is removed from it
   * (Android shows it only then), everyone else is hidden to the archive
   */
  public async getPeerStoriesRemoval(peerId: PeerId): Promise<'hide' | 'remove'> {
    if(!peerId.isUser() || peerId === this.changelogPeerId || this.appUsersManager.isContact(peerId.toUserId())) {
      return 'hide';
    }

    // * the top correspondents may not be had (a flood wait): taken as not being one of them, as a menu
    // * asking this must open all the same
    const topPeers = await this.appUsersManager.getTopPeers('correspondents').catch((): MyTopPeer[] => []);
    return topPeers.some((topPeer) => topPeer.id === peerId) ? 'remove' : 'hide';
  }

  public activateStealthMode() {
    // this.apiUpdatesManager.processLocalUpdate({
    //   _: 'updateStoriesStealthMode',
    //   stealth_mode: {
    //     _: 'storiesStealthMode',
    //     active_until_date: tsNow(true) + 1000 * 60 * 60 * 24 * 30,
    //     cooldown_until_date: tsNow(true) + 1000 * 60 * 60 * 24 * 30
    //   }
    // });
    // return;
    return this.apiManager.invokeApiSingleProcess({
      method: 'stories.activateStealthMode',
      params: {
        past: true,
        future: true
      },
      processResult: (updates) => {
        this.apiUpdatesManager.processUpdateMessage(updates);
      }
    });
  }

  public getStealthMode() {
    return this.stealthMode || this.getAllStories().then(() => this.stealthMode);
  }

  protected onUpdateStory = (update: Update.updateStory) => {
    const peerId = this.appPeersManager.getPeerId(update.peer);
    const cache = this.getPeerStoriesCache(peerId);
    let {story} = update;
    // * capture it here: the notification can be routed after an await, by which time the
    // * first difference is already over
    const isInitialSync = this.apiUpdatesManager.isInitialSync();

    if(story._ === 'storyItemDeleted') {
      this.handleDeletedStory(cache, story.id);
      return;
    }

    if(!cache.loaded) {
      Promise.resolve(this.getPeerStories(peerId)).then((userStories) => {
        this.rootScope.dispatchEvent('stories_stories', userStories);
        // * the peer's stories weren't cached yet (e.g. their very first story), so the
        // * normal path below was skipped — notify now that maxReadId is known. The guard
        // * inside notifyAboutStory drops it if it turns out to be already read.
        if(
          story._ === 'storyItem' &&
          !this.isStoryExpired(story) &&
          this.getCacheTypeForPeerId(peerId)
        ) {
          this.notifyAboutStory(peerId, story, cache.maxReadId, isInitialSync);
        }
      });
      return;
    }

    const cacheType: StoriesCacheType = this.isStoryExpired(story) ? undefined : this.getCacheTypeForPeerId(peerId);
    const hadStoryBefore = cache.storiesMap.has(story.id);
    story = this.saveStoryItems([update.story], cache, cacheType, true)[0];
    if(!hadStoryBefore && cacheType) {
      this.rootScope.dispatchEvent('story_new', {peerId, story, cacheType, maxReadId: cache.maxReadId});
      this.notifyAboutStory(peerId, story as StoryItem.storyItem, cache.maxReadId, isInitialSync);
    }
  };

  private async notifyAboutStory(peerId: PeerId, story: StoryItem.storyItem, maxReadId: number, isInitialSync?: boolean) {
    // * don't notify about our own stories
    if(peerId === this.appPeersManager.peerId || story.pFlags?.out) {
      return;
    }

    // * a story at or below maxReadId is already seen (e.g. replayed on reconnect)
    if(maxReadId && story.id <= maxReadId) {
      return;
    }

    // * hold it back while a difference is being applied: the updateReadStories that makes this
    // * story already-seen (opened on another device) can still be in it
    await this.apiUpdatesManager.waitForSync(peerId);

    // * ...so re-read the mark, it may have moved while we were waiting
    const maxReadIdNow = this.getPeerStoriesCache(peerId, false)?.maxReadId;
    if(maxReadIdNow && story.id <= maxReadIdNow) {
      return;
    }

    if(await this.appNotificationsManager.isPeerStoriesMuted(peerId)) {
      return;
    }

    return this.appNotificationsManager.routeNotification(peerId, {
      story: {peerId, storyId: story.id}
    }, isInitialSync);
  }

  protected onUpdateNewStoryReaction = (update: Update.updateNewStoryReaction) => {
    this.notifyAboutStoryReaction(update, this.apiUpdatesManager.isInitialSync());
  };

  // * someone reacted to one of our own stories — unlike a new story, this is gated by the
  // * global reactions settings (account.getReactionsNotifySettings), not by the peer's mute
  private async notifyAboutStoryReaction(update: Update.updateNewStoryReaction, isInitialSync?: boolean) {
    const {reaction, story_id: storyId} = update;
    if(reaction._ === 'reactionEmpty') { // * the reaction was removed
      return;
    }

    const peerId = this.appPeersManager.getPeerId(update.peer);
    if(peerId === this.appPeersManager.peerId) {
      return;
    }

    // * let a running difference finish first, so the settings below are read after whatever
    // * it carries (a mute, a settings change) has been applied
    await this.apiUpdatesManager.waitForSync(peerId);

    const notifySettings = await this.appNotificationsManager.getStoryReactionNotifySettings(peerId);
    if(!notifySettings) {
      return;
    }

    return this.appNotificationsManager.routeNotification(peerId, {
      storyReaction: {peerId, storyId, reaction, showPreview: notifySettings.showPreview}
    }, isInitialSync);
  }

  protected onUpdateReadStories = (update: Update.updateReadStories) => {
    const peerId = this.appPeersManager.getPeerId(update.peer);
    const cache = this.getPeerStoriesCache(peerId);
    // * the read state only grows (stories.readStories), and a batch of them (`requestReadTills`) can come
    // * after a newer one
    const maxReadId = Math.max(cache.maxReadId ?? 0, update.max_id);
    if(maxReadId === cache.maxReadId) {
      return;
    }

    cache.maxReadId = maxReadId;
    // * of a peer none of whose stories are held nothing on screen shows it: saying so would make every
    // * avatar of the peer read its stories, for each peer of the batch
    if(!cache.loaded && !cache.storiesMap.size) {
      return;
    }

    this.updateListCachePosition(cache);
    this.rootScope.dispatchEvent('stories_read', {peerId, maxReadId: cache.maxReadId});
  };

  protected onUpdateStoriesStealthMode = (update: Update.updateStoriesStealthMode) => {
    const hadBefore = this.stealthMode !== undefined;
    this.stealthMode = update.stealth_mode;
    if(hadBefore) {
      this.rootScope.dispatchEvent('stories_stealth_mode', update.stealth_mode);
    }
  };
}
