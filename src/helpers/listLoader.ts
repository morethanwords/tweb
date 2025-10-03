/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import forEachReverse from './array/forEachReverse';
import safeAssign from './object/safeAssign';

export type ListLoaderOptions<T extends {}, P extends {}> = {
  loadMore: ListLoader<T, P>['loadMore'],
  loadCount?: ListLoader<T, P>['loadCount'],
  loadWhenLeft?: ListLoader<T, P>['loadWhenLeft'],
  processItem?: ListLoader<T, P>['processItem'],
  onJump?: ListLoader<T, P>['onJump'],
  onLoadedMore?: ListLoader<T, P>['onLoadedMore']
};

export type ListLoaderResult<T extends {}> = {count: number, items: any[]};
export default class ListLoader<T extends {}, P extends {}> {
  public current: T;
  public previous: T[] = [];
  public next: T[] = [];
  public count: number;
  public reverse = false; // reverse means next = higher msgid

  protected loadMore: (anchor: T, older: boolean, loadCount: number) => Promise<ListLoaderResult<T>>;
  protected processItem: (item: P) => T | Promise<T>;
  protected loadCount = 50;
  protected loadWhenLeft = 20;

  public onJump: (item: T, older: boolean) => void;
  public onLoadedMore: () => void;

  protected loadedAllUp = false;
  protected loadedAllDown = false;
  protected loadPromiseUp: Promise<void>;
  protected loadPromiseDown: Promise<void>;

  constructor(options: ListLoaderOptions<T, P>) {
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

  /* public filter(callback: (item: T, idx: number, arr: T[]) => boolean) {
    const filter = (item: T, idx: number, arr: T[]) => {
      if(!callback(item, idx, arr)) {
        arr.splice(idx, 1);
      }
    };

    forEachReverse(this.previous, filter);
    forEachReverse(this.next, filter);
  } */

  public reset(loadedAll = false) {
    this.current = undefined;
    this.previous = [];
    this.next = [];
    this.setLoaded(true, loadedAll);
    this.setLoaded(false, loadedAll);
  }

  public go(length: number, dispatchJump = true) {
    let items: T[], item: T;
    if(length > 0) {
      items = this.next.splice(0, length);
      item = items.pop();
      if(!item) {
        return;
      }

      if(this.current !== undefined) items.unshift(this.current);
      this.previous.push(...items);
    } else {
      items = this.previous.splice(Math.max(0, this.previous.length + length), -length);
      item = items.shift();
      if(!item) {
        return;
      }

      if(this.current !== undefined) items.push(this.current);
      this.next.unshift(...items);
    }

    this.current = item;

    if(this.next.length < this.loadWhenLeft) {
      this.load(!this.reverse);
    }

    if(this.previous.length < this.loadWhenLeft) {
      this.load(this.reverse);
    }

    dispatchJump && this.onJump?.(item, length > 0);
    return this.current;
  }

  protected unsetCurrent(toPrevious: boolean) {
    if(toPrevious) this.previous.push(this.current);
    else this.next.unshift(this.current);

    this.current = undefined;
  }

  public goUnsafe(length: number, dispatchJump?: boolean) {
    const leftLength = length > 0 ? Math.max(0, length - this.next.length) : Math.min(0, length + this.previous.length);
    const item = this.go(length, leftLength ? false : dispatchJump);

    /* if(length > 0 ? this.loadedAllUp : this.loadedAllDown) {
      this.unsetCurrent(length > 0);
    } */

    return {
      item: !leftLength ? item : undefined,
      leftLength
    };
  }

  protected setLoaded(down: boolean, value: boolean) {
    const isChanged = (down ? this.loadedAllDown : this.loadedAllUp) !== value;
    if(!isChanged) {
      return false;
    }

    if(down) this.loadedAllDown = value;
    else this.loadedAllUp = value;

    if(!value) {
      if(down) this.loadPromiseDown = null;
      else this.loadPromiseUp = null;
    }

    return true;
  }

  // нет смысла делать проверку для reverse и loadMediaPromise
  public load(older: boolean) {
    if(older ? this.loadedAllDown : this.loadedAllUp) return Promise.resolve();

    let promise = older ? this.loadPromiseDown : this.loadPromiseUp;
    if(promise) return promise;

    let anchor: T;
    if(older) {
      anchor = this.reverse ? this.previous[0] : this.next[this.next.length - 1];
    } else {
      anchor = this.reverse ? this.next[this.next.length - 1] : this.previous[0];
    }

    anchor ??= this.current;
    promise = this.loadMore(anchor, older, this.loadCount).then(async(result) => {
      if((older ? this.loadPromiseDown : this.loadPromiseUp) !== promise) {
        return;
      }

      if(result.items.length < this.loadCount) {
        this.setLoaded(older, true);
      }

      if(this.count === undefined) {
        this.count = result.count || result.items.length;
      }

      const processedArr: (Promise<any> | any)[] = [];
      const method = older && !this.reverse ? result.items.forEach.bind(result.items) : forEachReverse.bind(null, result.items);
      method((item: any) => {
        const processed = this.processItem ? this.processItem(item) : item;

        if(!processed) return;
        processedArr.push(processed);
      });

      const results = (await Promise.all(processedArr)).filter(Boolean);
      if((older ? this.loadPromiseDown : this.loadPromiseUp) !== promise) {
        return;
      }

      if(older) {
        if(this.reverse) this.previous.unshift(...results);
        else this.next.push(...results);
      } else {
        if(this.reverse) this.next.push(...results);
        else this.previous.unshift(...results);
      }

      this.onLoadedMore?.();
    }, () => {}).then(() => {
      if(older) this.loadPromiseDown = null;
      else this.loadPromiseUp = null;
    });

    if(older) this.loadPromiseDown = promise;
    else this.loadPromiseUp = promise;

    return promise;
  }
}
