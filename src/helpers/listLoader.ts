/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import { forEachReverse } from "./array";
import { safeAssign } from "./object";

export type ListLoaderOptions<T extends {}> = {
  loadMore: ListLoader<T>['loadMore'],
  loadCount?: ListLoader<T>['loadCount'],
  loadWhenLeft?: ListLoader<T>['loadWhenLeft'],
  processItem?: ListLoader<T>['processItem'],
  onJump?: ListLoader<T>['onJump'],
  onLoadedMore?: ListLoader<T>['onLoadedMore']
};

export type ListLoaderResult<T extends {}> = {count: number, items: any[]};
export default class ListLoader<T extends {}> {
  public current: T;
  public previous: T[] = [];
  public next: T[] = [];
  public count: number;
  public reverse = false; // reverse means next = higher msgid

  protected loadMore: (anchor: T, older: boolean, loadCount: number) => Promise<ListLoaderResult<T>>;
  protected processItem: (item: any) => T;
  protected loadCount = 50;
  protected loadWhenLeft = 20;
  
  public onJump: (item: T, older: boolean) => void;
  public onLoadedMore: () => void;

  protected loadedAllUp = false;
  protected loadedAllDown = false;
  protected loadPromiseUp: Promise<void>;
  protected loadPromiseDown: Promise<void>;

  constructor(options: ListLoaderOptions<T>) {
    safeAssign(this, options);
  }

  public setTargets(previous: T[], next: T[], reverse: boolean) {
    this.previous = previous;
    this.next = next;
    this.reverse = reverse;
  }

  public get index() {
    return this.count !== undefined ? this.previous.length : -1;
  }

  public reset() {
    this.current = undefined;
    this.previous = [];
    this.next = [];
    this.loadedAllUp = this.loadedAllDown = false;
    this.loadPromiseUp = this.loadPromiseDown = null;
  }

  public go(length: number) {
    let items: T[], item: T;
    if(length > 0) {
      items = this.next.splice(0, length);
      item = items.pop();
      if(!item) {
        return;
      }

      this.previous.push(this.current, ...items);
    } else {
      items = this.previous.splice(this.previous.length + length, -length);
      item = items.shift();
      if(!item) {
        return;
      }

      this.next.unshift(...items, this.current);
    }

    if(this.next.length < this.loadWhenLeft) {
      this.load(!this.reverse);
    }

    if(this.previous.length < this.loadWhenLeft) {
      this.load(this.reverse);
    }

    this.current = item;
    this.onJump && this.onJump(item, length > 0);
  }

  // нет смысла делать проверку для reverse и loadMediaPromise
  public load(older: boolean) {
    if(older && this.loadedAllDown) return Promise.resolve();
    else if(!older && this.loadedAllUp) return Promise.resolve();

    if(older && this.loadPromiseDown) return this.loadPromiseDown;
    else if(!older && this.loadPromiseUp) return this.loadPromiseUp;

    let anchor: T;
    if(older) {
      anchor = this.reverse ? this.previous[0] : this.next[this.next.length - 1];
    } else {
      anchor = this.reverse ? this.next[this.next.length - 1] : this.previous[0];
    }

    const promise = this.loadMore(anchor, older, this.loadCount).then(result => {
      if((older && this.loadPromiseDown !== promise) || (!older && this.loadPromiseUp !== promise)) {
        return;
      }

      if(result.items.length < this.loadCount) {
        if(older) this.loadedAllDown = true;
        else this.loadedAllUp = true;
      }

      if(this.count === undefined) {
        this.count = result.count || result.items.length;
      }

      const method = older ? result.items.forEach.bind(result.items) : forEachReverse.bind(null, result.items);
      method((item: any) => {
        const processed = this.processItem ? this.processItem(item) : item;

        if(!processed) return;

        if(older) {
          if(this.reverse) this.previous.unshift(processed);
          else this.next.push(processed);
        } else {
          if(this.reverse) this.next.push(processed);
          else this.previous.unshift(processed);
        }
      });

      this.onLoadedMore && this.onLoadedMore();
    }, () => {}).then(() => {
      if(older) this.loadPromiseDown = null;
      else this.loadPromiseUp = null;
    });

    if(older) this.loadPromiseDown = promise;
    else this.loadPromiseUp = promise;

    return promise;
  }
}
