/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import forEachReverse from '../../helpers/array/forEachReverse';
import indexOfAndSplice from '../../helpers/array/indexOfAndSplice';
import insertInDescendSortedArray from '../../helpers/array/insertInDescendSortedArray';
import assumeType from '../../helpers/assumeType';
import callbackify from '../../helpers/callbackify';
import deferredPromise, {CancellablePromise} from '../../helpers/cancellablePromise';
import deepEqual from '../../helpers/object/deepEqual';
import safeReplaceObject from '../../helpers/object/safeReplaceObject';
import pause from '../../helpers/schedulers/pause';
import tsNow from '../../helpers/tsNow';
import {ReportReason, StoriesAllStories, StoriesStories, StoriesUserStories, StoryItem, Update, UserStories} from '../../layer';
import {MTAppConfig} from '../mtproto/appConfig';
import {SERVICE_PEER_ID, TEST_NO_STORIES} from '../mtproto/mtproto_config';
import {ReferenceContext} from '../mtproto/referenceDatabase';
import {AppManager} from './manager';
import StoriesCacheType from './utils/stories/cacheType';
import insertStory from './utils/stories/insertStory';

type MyStoryItem = Exclude<StoryItem, StoryItem.storyItemDeleted>;

export type StoriesListType = 'stories' | 'archive';
export type StoriesListPosition = {type: StoriesListType, index: number};
export type StoriesSegment = {length: number, type: 'unread' | 'close' | 'read'};
export type StoriesSegments = StoriesSegment[];
type StoriesPeerCache = {
  peerId: PeerId,
  stories: StoryItem['id'][],
  pinnedStories: StoriesPeerCache['stories'],
  archiveStories: StoriesPeerCache['stories'],
  storiesMap: Map<MyStoryItem['id'], MyStoryItem>,
  deleted: Set<number>,
  maxReadId?: number,
  getStoriesPromises: Map<StoryItem['id'], CancellablePromise<StoryItem.storyItem>>,
  getStoriesPromise?: CancellablePromise<void>,
  dispatchStoriesEvent?: boolean,
  pinnedLoadedAll?: boolean,
  archiveLoadedAll?: boolean,
  position?: StoriesListPosition
};

const TEST_SKIPPED = false;
const TEST_READ = false;

export default class AppStoriesManager extends AppManager {
  private cache: {[userId: UserId]: StoriesPeerCache};
  private lists: {[type in StoriesListType]: PeerId[]};
  private changelogPeerId: PeerId;

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
      const peerId = userId.toPeerId(false);
      const user = this.appUsersManager.getUser(userId);
      const isContact = this.appUsersManager.isContact(userId);
      const hasStories = user.stories_max_id !== undefined;
      const cache = this.getPeerStoriesCache(peerId, false);
      if(!cache) {
        if(isContact && hasStories) {
          Promise.resolve(this.getUserStories(peerId.toUserId())).then((userStories) => {
            this.rootScope.dispatchEvent('stories_stories', userStories);
          });
        }

        return;
      }

      const position = cache.position;
      this.updateListCachePosition(cache);
      if(!position && cache.position) { // added to list
        this.rootScope.dispatchEvent('stories_stories', this.convertPeerStoriesCache(cache));
      }
    });

    this.rootScope.addEventListener('user_stories_hidden', ({userId}) => {
      const peerId = userId.toPeerId(false);
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
  }

  public clear = (init?: boolean) => {
    this.cache = {};
    this.lists = {
      stories: [],
      archive: []
    };
  };

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
    const isPremium = this.appUsersManager.isPremium(cache.peerId.toUserId());
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

    const user = this.appUsersManager.getUser(cache.peerId.toUserId());
    const position: StoriesListPosition = {
      type: user.pFlags.stories_hidden ? 'archive' : 'stories',
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
      storiesMap: new Map(),
      getStoriesPromises: new Map(),
      deleted: new Set()
    } : undefined;
  }

  public convertPeerStoriesCache(cache: StoriesPeerCache): UserStories {
    return {
      _: 'userStories',
      user_id: cache.peerId.toUserId(),
      stories: cache.stories.map((storyId) => cache.storiesMap.get(storyId)),
      max_read_id: cache.maxReadId
    };
  }

  public saveStoryItem(storyItem: StoryItem, cache: StoriesPeerCache, cacheType?: StoriesCacheType): MyStoryItem {
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
    }

    let modifiedPinned: boolean;
    if(cacheType !== StoriesCacheType.Pinned) {
      const wasPinned = !!(oldStoryItem as StoryItem.storyItem)?.pFlags?.pinned;
      const newPinned = !!(storyItem as StoryItem.storyItem).pFlags?.pinned;
      if(wasPinned !== newPinned) {
        if(newPinned) {
          if(cache.pinnedLoadedAll ||
            (cache.pinnedStories.length && storyItem.id > cache.pinnedStories[cache.pinnedStories.length - 1])) {
            insertStory(cache.pinnedStories, storyItem.id, StoriesCacheType.Pinned);
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
        insertStory(cache.archiveStories, storyItem.id, StoriesCacheType.Archive);
        modifiedArchive = true;
      }
    }

    if(cacheType) {
      const array = cache[cacheType];
      insertStory(array, storyItem.id, cacheType);
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

    if(oldStoryItem || modifiedPinned || modifiedArchive) {
      this.rootScope.dispatchEvent('story_update', {
        peerId: cache.peerId,
        story: oldStoryItem || storyItem,
        modifiedPinned,
        modifiedArchive
      });
    }

    return oldStoryItem || storyItem;
  }

  public saveStoryItems(storyItems: StoryItem[], cache: StoriesPeerCache, cacheType?: StoriesCacheType) {
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
      const user = this.appUsersManager.getUser(cache.peerId.toUserId());
      if(!user.stories_max_id) {
        this.appUsersManager.saveApiUsers([{
          ...user,
          stories_max_id: cache.storiesMap.get(cache.stories[cache.stories.length - 1]).id
        }]);
      }
    }

    this.updateListCachePosition(cache);

    return newStoryItems;
  }

  public saveStoriesStories(storiesStories: StoriesStories, cache: StoriesPeerCache, cacheType?: StoriesCacheType) {
    this.appUsersManager.saveApiUsers(storiesStories.users);
    const storyItems = this.saveStoryItems(storiesStories.stories, cache, cacheType) as StoryItem.storyItem[];

    if(TEST_NO_STORIES) {
      storyItems.splice(0, Infinity);
    }

    return storyItems;
  }

  public saveUserStories(userStories: UserStories) {
    const peerId = userStories.user_id.toPeerId(false);
    const cache = this.getPeerStoriesCache(peerId);

    if(TEST_NO_STORIES) {
      userStories.stories = [];
    }

    if(TEST_SKIPPED) {
      userStories.stories = userStories.stories.map((storyItem) => {
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
    cache.maxReadId = userStories.max_read_id ?? 0;
    userStories.stories = this.saveStoryItems(userStories.stories, cache, cacheType);

    if(cache.dispatchStoriesEvent) {
      delete cache.dispatchStoriesEvent;
      this.rootScope.dispatchEvent('user_stories', {
        userId: userStories.user_id,
        available: cache.stories.length > 0
      });
    }

    return userStories;
  }

  public getUnreadType(peerId: PeerId, storyId?: number, cache = this.getPeerStoriesCache(peerId)): StoriesSegment['type'] {
    storyId ??= cache.stories[cache.stories.length - 1];
    if(!storyId && !cache.dispatchStoriesEvent) {
      cache.dispatchStoriesEvent = true;
      this.getUserStories(peerId.toUserId());
    }

    if(!storyId) {
      return;
    }

    return storyId > cache.maxReadId ? (cache.storiesMap.get(storyId).pFlags.close_friends ? 'close' : 'unread') : 'read';
  }

  public getPeerStoriesSegments(peerId: PeerId): StoriesSegments | Promise<StoriesSegments> {
    const cache = this.getPeerStoriesCache(peerId);
    if(cache.maxReadId === undefined) {
      return callbackify(this.getUserStories(peerId.toUserId()), () => this.getPeerStoriesSegments(peerId));
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

  public deleteStories(ids: StoryItem['id'][]) {
    return this.apiManager.invokeApiSingleProcess({
      method: 'stories.deleteStories',
      params: {
        id: ids
      },
      processResult: (ids) => {
        ids.forEach((id) => {
          this.apiUpdatesManager.processLocalUpdate({
            _: 'updateStory',
            user_id: this.appPeersManager.peerId.toUserId(),
            story: {
              _: 'storyItemDeleted',
              id
            }
          });
        });
      }
    });
  }

  public togglePinned(storyId: StoryItem['id'] | StoryItem['id'][], pinned: boolean) {
    if(!Array.isArray(storyId)) storyId = [storyId];
    return this.apiManager.invokeApiSingleProcess({
      method: 'stories.togglePinned',
      params: {
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
        this.appUsersManager.saveApiUsers(storiesAllStories.users);
        storiesAllStories.user_stories = storiesAllStories.user_stories
        .map((userStories) => this.saveUserStories(userStories))
        .filter((userStories) => userStories.stories.length);
        return storiesAllStories;
      }
    });
  }

  public getUserStories(userId: UserId) {
    const cache = this.getPeerStoriesCache(userId.toPeerId(false));
    if(cache.maxReadId !== undefined) {
      return this.convertPeerStoriesCache(cache);
    }

    return this.apiManager.invokeApiSingleProcess({
      method: 'stories.getUserStories',
      params: {
        user_id: this.appUsersManager.getUserInput(userId)
      },
      processResult: (userStories) => {
        this.appUsersManager.saveApiUsers(userStories.users);
        return this.saveUserStories(userStories.stories);
      }
    });
  }

  private getCachedStories(cache: StoriesPeerCache, pinned: boolean, limit: number, offsetId: number) {
    const array = pinned ? cache.pinnedStories : cache.archiveStories;
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
    const length = storiesStories.stories.length;
    const storyItems = this.saveStoriesStories(
      storiesStories,
      cache,
      pinned ? StoriesCacheType.Pinned : StoriesCacheType.Archive
    );
    const array = pinned ? cache.pinnedStories : cache.archiveStories;
    if(array.length === storiesStories.count || length < limit) {
      if(pinned) cache.pinnedLoadedAll = true;
      else cache.archiveLoadedAll = true;
    }

    return storyItems;
  }

  public getPinnedStories(userId: UserId, limit: number, offsetId: number = 0) {
    const cache = this.getPeerStoriesCache(userId.toPeerId(false));
    const slice = this.getCachedStories(cache, true, limit, offsetId);
    if(slice) {
      return slice;
    }

    return this.apiManager.invokeApiSingleProcess({
      method: 'stories.getPinnedStories',
      params: {
        user_id: this.appUsersManager.getUserInput(userId),
        limit,
        offset_id: offsetId
      },
      processResult: this.processLoadedStoriesStories.bind(this, cache, true, limit)
    });
  }

  public getStoriesArchive(limit: number, offsetId: number = 0) {
    const cache = this.getPeerStoriesCache(this.appPeersManager.peerId);
    const slice = this.getCachedStories(cache, false, limit, offsetId);
    if(slice) {
      return slice;
    }

    return this.apiManager.invokeApiSingleProcess({
      method: 'stories.getStoriesArchive',
      params: {
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
        user_id: this.appUsersManager.getUserInput(cache.peerId.toUserId()),
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
      user_id: peerId.toUserId(),
      max_id: maxId
    });

    if(TEST_READ) {
      return;
    }

    return this.apiManager.invokeApiSingleProcess({
      method: 'stories.readStories',
      params: {
        user_id: this.appUsersManager.getUserInput(peerId.toUserId()),
        max_id: maxId
      },
      processResult: () => {
      }
    });
  }

  public incrementStoryViews(peerId: PeerId, ids: StoryItem['id'][]) {
    return this.apiManager.invokeApiSingleProcess({
      method: 'stories.incrementStoryViews',
      params: {
        user_id: this.appUsersManager.getUserInput(peerId.toUserId()),
        id: ids
      },
      processResult: () => {
      }
    });
  }

  public getStoryViewsList(id: number, limit: number, offset: string = '', q?: string, justContacts?: boolean) {
    return this.apiManager.invokeApiSingleProcess({
      method: 'stories.getStoryViewsList',
      params: {
        id,
        limit,
        offset,
        q,
        just_contacts: justContacts
      },
      processResult: (storiesStoryViews) => {
        this.appUsersManager.saveApiUsers(storiesStoryViews.users);

        return {
          count: storiesStoryViews.count,
          views: storiesStoryViews.views,
          nextOffset: storiesStoryViews.next_offset
        };
      }
    });
  }

  public getStoriesViews(ids: number[]) {
    return this.apiManager.invokeApiSingleProcess({
      method: 'stories.getStoriesViews',
      params: {
        id: ids
      },
      processResult: (storiesStoryViews) => {
        this.appUsersManager.saveApiUsers(storiesStoryViews.users);

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

  public report(peerId: PeerId, id: number[], reason: ReportReason['_'], message?: string) {
    return this.apiManager.invokeApiSingleProcess({
      method: 'stories.report',
      params: {
        user_id: this.appUsersManager.getUserInput(peerId.toUserId()),
        id,
        reason: {_: reason},
        message
      },
      processResult: () => {
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

  public getCacheTypeForPeerId(peerId: PeerId, ignoreNoContact?: boolean) {
    if(
      !this.appUsersManager.isContact(peerId.toUserId()) &&
      peerId !== this.changelogPeerId &&
      !ignoreNoContact
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

  public toggleStoriesHidden(peerId: PeerId, hidden: boolean) {
    const userId = peerId.toUserId();
    return this.apiManager.invokeApiSingleProcess({
      method: 'contacts.toggleStoriesHidden',
      params: {
        id: this.appUsersManager.getUserInput(userId),
        hidden
      },
      processResult: () => {
        const user = this.appUsersManager.getUser(userId);
        const pFlags = {...user.pFlags};
        if(hidden) pFlags.stories_hidden = true;
        else delete pFlags.stories_hidden;
        this.appUsersManager.saveApiUsers([{
          ...user,
          pFlags
        }]);
        this.appNotificationsManager.toggleStoriesMute(peerId, hidden, true);
      }
    });
  }

  protected onUpdateStory = (update: Update.updateStory) => {
    const peerId = update.user_id.toPeerId(false);
    const cache = this.getPeerStoriesCache(peerId);
    let {story} = update;

    if(story._ === 'storyItemDeleted') {
      this.handleDeletedStory(cache, story.id);
      return;
    }

    if(cache.maxReadId === undefined) {
      Promise.resolve(this.getUserStories(peerId.toUserId())).then((userStories) => {
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
    const peerId = update.user_id.toPeerId(false);
    const cache = this.getPeerStoriesCache(peerId);
    cache.maxReadId = update.max_id;
    this.updateListCachePosition(cache);
    this.rootScope.dispatchEvent('stories_read', {peerId, maxReadId: cache.maxReadId});
  };
}
