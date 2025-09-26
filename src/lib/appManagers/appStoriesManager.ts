/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import forEachReverse from '../../helpers/array/forEachReverse';
import indexOfAndSplice from '../../helpers/array/indexOfAndSplice';
import insertInDescendSortedArray from '../../helpers/array/insertInDescendSortedArray';
import toArray from '../../helpers/array/toArray';
import assumeType from '../../helpers/assumeType';
import callbackify from '../../helpers/callbackify';
import deferredPromise, {CancellablePromise} from '../../helpers/cancellablePromise';
import makeError from '../../helpers/makeError';
import deepEqual from '../../helpers/object/deepEqual';
import safeReplaceObject from '../../helpers/object/safeReplaceObject';
import pause from '../../helpers/schedulers/pause';
import tsNow from '../../helpers/tsNow';
import {Reaction, ReportReason, StoriesAllStories, StoriesStories, StoryItem, Update, PeerStories, User, Chat, StoryView, MediaArea, StoryAlbum} from '../../layer';
import {MTAppConfig} from '../mtproto/appConfig';
import {SERVICE_PEER_ID, TEST_NO_STORIES} from '../mtproto/mtproto_config';
import {ReferenceContext} from '../mtproto/referenceDatabase';
import {AppManager} from './manager';
import reactionsEqual from './utils/reactions/reactionsEqual';
import StoriesCacheType from './utils/stories/cacheType';
import insertStory from './utils/stories/insertStory';

type MyStoryItem = Exclude<StoryItem, StoryItem.storyItemDeleted>;

export type StoriesListType = 'stories' | 'archive';
export type StoriesListPosition = {type: StoriesListType, index: number};
export type StoriesSegment = {length: number, type: 'unread' | 'close' | 'read'};
export type StoriesSegments = StoriesSegment[];
type AlbumCacheItem = {
  info: StoryAlbum,
  ids: StoryItem['id'][],
  count: number,
  loadedAll: boolean,
}
type StoriesPeerCache = {
  peerId: PeerId,
  stories: StoryItem['id'][],
  pinnedStories: StoriesPeerCache['stories'],
  archiveStories: StoriesPeerCache['stories'],
  pinnedToTop: Map<number, number>,
  storiesMap: Map<MyStoryItem['id'], MyStoryItem>,
  deleted: Set<number>,
  maxReadId?: number,
  getStoriesPromises: Map<StoryItem['id'], CancellablePromise<StoryItem.storyItem>>,
  getStoriesPromise?: CancellablePromise<void>,
  dispatchStoriesEvent?: boolean,
  pinnedLoadedAll?: boolean,
  archiveLoadedAll?: boolean,
  position?: StoriesListPosition,
  count?: number,
  albums: Map<number, AlbumCacheItem>,
  albumsOrder?: number[],
  albumsHash?: Long
};

type ExpiringItem = {peerId: PeerId, id: number, timestamp: number};

const TEST_SKIPPED = false;
const TEST_READ = false;
const TEST_EXPIRING = 0;

export default class AppStoriesManager extends AppManager {
  private cache: {[userId: UserId]: StoriesPeerCache};
  private lists: {[type in StoriesListType]: PeerId[]};
  private changelogPeerId: PeerId;
  private expiring: ExpiringItem[];

  protected after() {
    this.clear(true);

    this.changelogPeerId = SERVICE_PEER_ID;

    if(TEST_NO_STORIES) {
      return;
    }

    this.apiUpdatesManager.addMultipleEventsListeners({
      updateStory: this.onUpdateStory,

      updateReadStories: this.onUpdateReadStories
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
  };

  private onSubscriptionUpdate(peerId: PeerId) {
    const peer = this.getPeer(peerId);
    if(!peer) {
      return;
    }

    const cache = this.getPeerStoriesCache(peerId, false);
    if(!cache) {
      const isSubscribed = this.isSubcribedToPeer(peerId);
      const hasStories = peer.stories_max_id !== undefined;
      if(isSubscribed && hasStories) {
        Promise.resolve(this.getPeerStories(peerId)).then((peerStories) => {
          this.rootScope.dispatchEvent('stories_stories', peerStories);
        });
      }

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

  public saveStoryItem(storyItem: StoryItem, cache: StoriesPeerCache, cacheType?: StoriesCacheType | { albumId: number }): MyStoryItem {
    if(TEST_NO_STORIES || !storyItem || storyItem._ === 'storyItemDeleted') {
      return;
    }

    const oldStoryItem = cache.storiesMap.get(storyItem.id);
    const oldIsSkipped = oldStoryItem?._ === 'storyItemSkipped';
    const isSkipped = storyItem._ === 'storyItemSkipped';
    if(isSkipped && oldStoryItem && !oldIsSkipped) {
      return oldStoryItem;
    }

    if(!isSkipped) {
      const mediaContext: ReferenceContext = {
        type: 'storyItem',
        peerId: cache.peerId,
        storyId: storyItem.id
      };

      this.appMessagesManager.saveMessageMedia(storyItem, mediaContext);
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
      }
    }

    let modifiedArchive: boolean;
    if(cacheType !== StoriesCacheType.Archive && cache.peerId === this.appPeersManager.peerId) {
      if(!cache.archiveStories.includes(storyItem.id) && (cache.archiveLoadedAll ||
        (cache.archiveStories.length && storyItem.id > cache.archiveStories[cache.archiveStories.length - 1]))) {
        insertStory(cache.archiveStories, storyItem, true, StoriesCacheType.Archive);
        modifiedArchive = true;
      }
    }

    if(cacheType === StoriesCacheType.Stories) {
      if(TEST_EXPIRING) {
        storyItem.expire_date = tsNow(true) + TEST_EXPIRING;
      }

      const pos = this.expiring.findIndex((item) => item.peerId === cache.peerId && item.id === storyItem.id);
      insertInDescendSortedArray(
        this.expiring,
        {peerId: cache.peerId, id: storyItem.id, timestamp: storyItem.expire_date},
        (item) => 0x7FFFFFFF - (item.timestamp),
        pos
      );
    }

    if(typeof cacheType === 'object' && 'albumId' in cacheType) {
      const item = cache.albums.get(cacheType.albumId);
      if(item) {
        insertStory(item.ids, storyItem, true, StoriesCacheType.Pinned, cache.pinnedToTop);
      }
    } else if(cacheType) {
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

  public saveStoryItems(storyItems: StoryItem[], cache: StoriesPeerCache, cacheType?: StoriesCacheType | { albumId: number }) {
    // if((storyItems as any).saved) return storyItems;
    // (storyItems as any).saved = true;
    const indexesToDelete: number[] = [];
    const newStoryItems = storyItems.map((storyItem, idx) => {
      storyItem = this.saveStoryItem(storyItem, cache, cacheType);
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
        const newPeer: typeof peer = {
          ...peer,
          stories_max_id: cache.storiesMap.get(cache.stories[cache.stories.length - 1]).id
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

  public saveStoriesStories(storiesStories: StoriesStories, cache: StoriesPeerCache, cacheType?: StoriesCacheType | { albumId: number }) {
    this.appPeersManager.saveApiPeers(storiesStories);
    const storyItems = this.saveStoryItems(storiesStories.stories, cache, cacheType) as StoryItem.storyItem[];

    if(TEST_NO_STORIES) {
      storyItems.splice(0, Infinity);
    }

    return storyItems;
  }

  public savePeerStories(peerStories: PeerStories) {
    const peerId = this.appPeersManager.getPeerId(peerStories.peer);
    const cache = this.getPeerStoriesCache(peerId);

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
    cache.maxReadId = peerStories.max_read_id ?? 0;
    peerStories.stories = this.saveStoryItems(peerStories.stories, cache, cacheType);

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

    return storyId > cache.maxReadId ? (cache.storiesMap.get(storyId).pFlags.close_friends ? 'close' : 'unread') : 'read';
  }

  public getPeerStoriesSegments(peerId: PeerId): StoriesSegments | Promise<StoriesSegments> {
    const cache = this.getPeerStoriesCache(peerId);
    if(cache.maxReadId === undefined) {
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

  public deleteStories(peerId: PeerId, ids: StoryItem['id'][]) {
    return this.apiManager.invokeApiSingleProcess({
      method: 'stories.deleteStories',
      params: {
        peer: this.appPeersManager.getInputPeerById(peerId),
        id: ids
      },
      processResult: (ids) => {
        ids.forEach((id) => {
          this.apiUpdatesManager.processLocalUpdate({
            _: 'updateStory',
            peer: this.appPeersManager.getOutputPeer(peerId),
            story: {
              _: 'storyItemDeleted',
              id
            }
          });
        });
      }
    });
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

        const cache = this.getPeerStoriesCache(this.rootScope.myId);
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

        this.saveStoryItems(newStories, cache);
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
        const cache = this.getPeerStoriesCache(peerId);
        const pinnedToTop = cache.pinnedToTop;
        storyIds.forEach((storyId) => {
          const storyItem = this.getStoryByIdCached(peerId, storyId);
          if(pin) pinnedToTop.set(storyId, pinnedToTop.size);
          else pinnedToTop.delete(storyId);
          this.saveStoryItem(storyItem, cache, StoriesCacheType.Pinned);
        });
      }
    });
  }

  public hasArchive() {
    return this.lists.archive.length > 0;
  }

  public getAllStories(next?: boolean, state?: string, hidden?: boolean) {
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
        .map((peerStories) => this.savePeerStories(peerStories))
        .filter((peerStories) => peerStories.stories.length);
        return storiesAllStories;
      }
    });
  }

  public getPeerStories(peerId: PeerId) {
    const cache = this.getPeerStoriesCache(peerId);
    if(cache.maxReadId !== undefined) {
      return this.convertPeerStoriesCache(cache);
    }

    return this.apiManager.invokeApiSingleProcess({
      method: 'stories.getPeerStories',
      params: {
        peer: this.appPeersManager.getInputPeerById(peerId)
      },
      processResult: (storiesPeerStories) => {
        this.appPeersManager.saveApiPeers(storiesPeerStories);
        return this.savePeerStories(storiesPeerStories.stories);
      }
    });
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
    cache.count = storiesStories.count;
    const array = pinned ? cache.pinnedStories : cache.archiveStories;
    if(array.length === storiesStories.count || length < limit) {
      if(pinned) cache.pinnedLoadedAll = true;
      else cache.archiveLoadedAll = true;
    }

    return {count: storiesStories.count, stories: storyItems, pinnedToTop: pinned ? cache.pinnedToTop : undefined};
  }

  public getAlbums(peerId: PeerId, revalidate = false): MaybePromise<StoryAlbum[]> {
    const cache = this.getPeerStoriesCache(peerId);
    if(!revalidate && cache.albumsOrder) {
      return cache.albumsOrder.map((albumId) => cache.albums.get(albumId).info);
    }

    return this.apiManager.invokeApiSingleProcess({
      method: 'stories.getAlbums',
      params: {
        peer: this.appPeersManager.getInputPeerById(peerId),
        hash: cache.albumsHash
      },
      processResult: (response) => {
        if(response._ === 'stories.albumsNotModified') {
          return cache.albumsOrder.map((albumId) => cache.albums.get(albumId).info);
        }

        cache.albumsOrder = []
        for(const album of response.albums) {
          if(album.icon_photo) this.appPhotosManager.savePhoto(album.icon_photo);
          if(album.icon_video) this.appDocsManager.saveDoc(album.icon_video);
          cache.albumsOrder.push(album.album_id);
          cache.albums.set(album.album_id, {
            info: album,
            ids: [],
            count: 0,
            loadedAll: false
          });
        }

        cache.albumsHash = response.hash;
        return response.albums;
      }
    });
  }

  public getPinnedStories(peerId: PeerId, limit: number, offsetId: number = 0): MaybePromise<{count: number, stories: StoryItem.storyItem[], pinnedToTop: StoriesPeerCache['pinnedToTop']}> {
    const cache = this.getPeerStoriesCache(peerId);
    const slice = this.getCachedStories(cache, true, limit, offsetId);
    if(slice) {
      return {count: cache.count, stories: slice, pinnedToTop: cache.pinnedToTop};
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

  public getAlbumStories(peerId: PeerId, albumId: number, limit: number, offsetId: number = 0): MaybePromise<{count: number, stories: StoryItem.storyItem[]}> {
    const cache = this.getPeerStoriesCache(peerId);
    const cachedAlbum = cache.albums.get(albumId);
    if(!cachedAlbum) {
      return {count: 0, stories: []};
    }

    let slice: StoryItem.storyItem[] | undefined;
    const index = offsetId ? cachedAlbum.ids.findIndex((storyId) => storyId < offsetId) : 0;
    if(index !== -1) {
      const sliced = cachedAlbum.ids.slice(index, index + limit);
      if(sliced.length === limit || cachedAlbum.loadedAll) {
        slice = sliced.map((storyId) => cache.storiesMap.get(storyId)) as StoryItem.storyItem[];
      }
    }

    if(slice) {
      return {count: cache.count, stories: slice};
    }

    return this.apiManager.invokeApiSingleProcess({
      method: 'stories.getAlbumStories',
      params: {
        peer: this.appPeersManager.getInputPeerById(peerId),
        album_id: albumId,
        limit,
        offset: cachedAlbum?.ids.length ?? 0
      },
      processResult: (response) => {
        this.saveStoriesStories(
          response,
          cache,
          {albumId}
        );
        cachedAlbum.count = response.count;
        cachedAlbum.loadedAll = cachedAlbum.ids.length === response.count;
        return this.getAlbumStories(peerId, albumId, limit, offsetId);
      }
    });
  }

  public getStoriesArchive(peerId: PeerId, limit: number, offsetId: number = 0): ReturnType<AppStoriesManager['getPinnedStories']> {
    const cache = this.getPeerStoriesCache(peerId);
    const slice = this.getCachedStories(cache, false, limit, offsetId);
    if(slice) {
      return {count: cache.count, stories: slice, pinnedToTop: undefined};
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
        const storyItems = this.saveStoriesStories(storiesStories, cache);
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

  public getStoryViewsList(peerId: PeerId, id: number, limit: number, offset: string = '', q?: string, justContacts?: boolean) {
    return this.apiManager.invokeApiSingleProcess({
      method: 'stories.getStoryViewsList',
      params: {
        peer: this.appPeersManager.getInputPeerById(peerId),
        id,
        limit,
        offset,
        q,
        just_contacts: justContacts
      },
      processResult: (storiesStoryViews) => {
        this.appPeersManager.saveApiPeers(storiesStoryViews);

        storiesStoryViews.views.forEach((storyView) => {
          (storyView as StoryView.storyViewPublicForward).message = this.appMessagesManager.saveMessage((storyView as StoryView.storyViewPublicForward).message);
          (storyView as StoryView.storyViewPublicRepost).story = (storyView as StoryView.storyViewPublicRepost).story && this.appStoriesManager.saveStoryItem(
            (storyView as StoryView.storyViewPublicRepost).story,
            this.appStoriesManager.getPeerStoriesCache(this.appPeersManager.getPeerId((storyView as StoryView.storyViewPublicRepost).peer_id))
          );
        });

        const views = storiesStoryViews.views.filter((storyView) => {
          return storyView._ === 'storyView';
        }) as StoryView.storyView[];

        return {
          count: storiesStoryViews.count,
          views: views,
          nextOffset: storiesStoryViews.next_offset
        };
      }
    });
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
    const isMyStory = !!story.pFlags.out;

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
        this.appNotificationsManager.toggleStoriesMute(peerId, hidden, true);
      }
    });
  }

  protected onUpdateStory = (update: Update.updateStory) => {
    const peerId = this.appPeersManager.getPeerId(update.peer);
    const cache = this.getPeerStoriesCache(peerId);
    let {story} = update;

    if(story._ === 'storyItemDeleted') {
      this.handleDeletedStory(cache, story.id);
      return;
    }

    if(cache.maxReadId === undefined) {
      Promise.resolve(this.getPeerStories(peerId)).then((userStories) => {
        this.rootScope.dispatchEvent('stories_stories', userStories);
      });
      return;
    }

    const cacheType: StoriesCacheType = this.isStoryExpired(story) ? undefined : this.getCacheTypeForPeerId(peerId);
    const hadStoryBefore = cache.storiesMap.has(story.id);
    story = this.saveStoryItems([update.story], cache, cacheType)[0];
    if(!hadStoryBefore && cacheType) {
      this.rootScope.dispatchEvent('story_new', {peerId, story, cacheType, maxReadId: cache.maxReadId});
    }
  };

  protected onUpdateReadStories = (update: Update.updateReadStories) => {
    const peerId = this.appPeersManager.getPeerId(update.peer);
    const cache = this.getPeerStoriesCache(peerId);
    cache.maxReadId = update.max_id;
    this.updateListCachePosition(cache);
    this.rootScope.dispatchEvent('stories_read', {peerId, maxReadId: cache.maxReadId});
  };
}
