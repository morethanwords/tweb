/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import type { MediaSearchContext } from "../components/appMediaPlaybackController";
import type { SearchSuperContext } from "../components/appSearchSuper.";
import type { Message } from "../layer";
import appMessagesIdsManager from "../lib/appManagers/appMessagesIdsManager";
import appMessagesManager from "../lib/appManagers/appMessagesManager";
import rootScope from "../lib/rootScope";
import { forEachReverse } from "./array";
import filterChatPhotosMessages from "./filterChatPhotosMessages";
import ListLoader, { ListLoaderOptions } from "./listLoader";

export default class SearchListLoader<Item extends {mid: number, peerId: number}> extends ListLoader<Item, Message.message> {
  public searchContext: MediaSearchContext;
  public onEmptied: () => void;

  constructor(options: Omit<ListLoaderOptions<Item, Message.message>, 'loadMore'> & {onEmptied?: () => void} = {}) {
    super({
      ...options,
      loadMore: (anchor, older, loadCount) => {
        const backLimit = older ? 0 : loadCount;
        let maxId = this.current?.mid;

        if(anchor) maxId = anchor.mid;
        if(!older) maxId = appMessagesIdsManager.incrementMessageId(maxId, 1);

        return appMessagesManager.getSearch({
          ...this.searchContext,
          peerId: this.searchContext.peerId || anchor?.peerId,
          maxId,
          limit: backLimit ? 0 : loadCount,
          backLimit
        }).then(value => {
          /* if(DEBUG) {
            this.log('loaded more media by maxId:', maxId, value, older, this.reverse);
          } */

          if(this.searchContext.inputFilter._ === 'inputMessagesFilterChatPhotos') {
            filterChatPhotosMessages(value);
          }

          if(value.next_rate) {
            this.searchContext.nextRate = value.next_rate;
          }

          return {count: value.count, items: value.history};
        });
      },
      processItem: (message) => {
        const filtered = this.filterMids([message.mid]);
        if(!filtered.length) {
          return;
        }

        return options.processItem(message);
      }
    });

    rootScope.addEventListener('history_delete', this.onHistoryDelete);
    rootScope.addEventListener('history_multiappend', this.onHistoryMultiappend);
    rootScope.addEventListener('message_sent', this.onMessageSent);
  }

  protected filterMids(mids: number[]) {
    const storage = this.searchContext.isScheduled ? 
      appMessagesManager.getScheduledMessagesStorage(this.searchContext.peerId) : 
      appMessagesManager.getMessagesStorage(this.searchContext.peerId);
     const filtered = appMessagesManager.filterMessagesByInputFilter(this.searchContext.inputFilter._, mids, storage, mids.length) as Message.message[];
     return filtered;
  }

  protected onHistoryDelete = ({peerId, msgs}: {peerId: number, msgs: Set<number>}) => {
    const shouldBeDeleted = (item: Item) => item.peerId === peerId && msgs.has(item.mid);
    const filter = (item: Item, idx: number, arr: Item[]) => {
      if(shouldBeDeleted(item)) {
        arr.splice(idx, 1);
      }
    };

    forEachReverse(this.previous, filter);
    forEachReverse(this.next, filter);

    if(this.current && shouldBeDeleted(this.current)) {
      /* if(this.go(1)) {
        this.previous.splice(this.previous.length - 1, 1);
      } else if(this.go(-1)) {
        this.next.splice(0, 1);
      } else  */if(this.onEmptied) {
        this.onEmptied();
      }
    }
  };

  protected onHistoryMultiappend = (obj: {
    [peerId: string]: Set<number>;
  }) => {
    if(this.searchContext.folderId !== undefined) {
      return;
    }

    // because it's reversed
    if(!this.loadedAllUp || this.loadPromiseUp) {
      return;
    }

    const mids = obj[this.searchContext.peerId];
    if(!mids) {
      return;
    }

    const sorted = Array.from(mids).sort((a, b) => a - b);
    const filtered = this.filterMids(sorted);
    const targets = filtered.map(message => this.processItem(message)).filter(Boolean);
    if(targets.length) {
      this.next.push(...targets);
    }
  };

  protected onMessageSent = ({message}: {message: Message.message}) => {
    this.onHistoryMultiappend({
      [message.peerId]: new Set([message.mid])
    });
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

    if(!this.searchContext.useSearch) {
      this.loadedAllDown = this.loadedAllUp = true;
    }
  }

  public reset() {
    super.reset();
    this.searchContext = undefined;
  }

  public cleanup() {
    this.reset();
    rootScope.removeEventListener('history_delete', this.onHistoryDelete);
    rootScope.removeEventListener('history_multiappend', this.onHistoryMultiappend);
    rootScope.removeEventListener('message_sent', this.onMessageSent);
    this.onEmptied = undefined;
  }
}
