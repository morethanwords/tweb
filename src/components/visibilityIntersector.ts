/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

type TargetType = HTMLElement;
export type OnVisibilityChangeItem = {target: TargetType, visible: boolean, entry: IntersectionObserverEntry, index: number};
export type OnVisibilityChange = (item: OnVisibilityChangeItem) => void;

export default class VisibilityIntersector {
  private observer: IntersectionObserver;
  private items: Map<TargetType, boolean> = new Map();
  private locked = false;

  constructor(onVisibilityChange: OnVisibilityChange, options?: IntersectionObserverInit) {
    this.observer = new IntersectionObserver((entries) => {
      if(this.locked) {
        return;
      }

      const changed: OnVisibilityChangeItem[] = [];

      entries.forEach((entry, index) => {
        const target = entry.target as TargetType;

        if(this.items.get(target) === entry.isIntersecting) {
          return;
        } else {
          this.items.set(target, entry.isIntersecting);
        }

        /* if(entry.isIntersecting) {
          console.log('ooo', entry);
        } */

        /* if(this.locked) {
          return;
        } */

        const change: typeof changed[0] = {target, visible: entry.isIntersecting, entry, index};

        // ! order will be incorrect so can't use it
        // changed[entry.isIntersecting ? 'unshift' : 'push'](change);
        changed.push(change);

        // onVisibilityChange(target, entry.isIntersecting);
      });

      changed.forEach((item) => {
        onVisibilityChange(item);
      });
    }, options);
  }

  public getVisible() {
    const items: TargetType[] = [];
    this.items.forEach((value, key) => {
      if(value) {
        items.push(key);
      }
    });

    return items;
  }

  public clearVisible() {
    const visible = this.getVisible();
    for(const target of visible) {
      this.items.set(target, false);
    }
  }

  public isVisible(target: TargetType) {
    return !!this.items.get(target);
  }

  public disconnect() {
    this.observer.disconnect();
    this.items.clear();
  }

  public refresh() {
    this.observer.disconnect();

    // window.requestAnimationFrame(() => {
    const targets = [...this.items.keys()];
    for(const target of targets) {
      // this.items.set(target, false);
      this.observer.observe(target);
    }
    // });
  }

  public refreshVisible() {
    const visible = this.getVisible();
    for(const target of visible) {
      this.observer.unobserve(target);
    }

    for(const target of visible) {
      this.observer.observe(target);
    }
  }

  public observe(target: TargetType) {
    this.items.set(target, false);
    this.observer.observe(target);
  }

  public unobserve(target: TargetType) {
    this.observer.unobserve(target);
    this.items.delete(target);
  }

  public unlock() {
    this.locked = false;
  }

  public unlockAndRefresh() {
    this.unlock();
    this.refresh();
  }

  public lock() {
    this.locked = true;
  }
}
