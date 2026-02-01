/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import {MOUNT_CLASS_TO} from '@config/debug';
import {IS_FIREFOX, IS_MOBILE_SAFARI} from '@environment/userAgent';
import {logger} from '@lib/logger';
import blurActiveElement from '@helpers/dom/blurActiveElement';
import cancelEvent from '@helpers/dom/cancelEvent';
import isSwipingBackSafari from '@helpers/dom/isSwipingBackSafari';
import tabId from '@config/tabId';

export type NavigationItem = {
  type: 'left' | 'right' | 'im' | 'chat' | 'popup' | 'media' | 'menu' |
    'esg' | 'multiselect' | 'input-helper' | 'autocomplete-helper' | 'markup' |
    'global-search' | 'voice' | 'mobile-search' | 'filters' | 'global-search-focus' |
    'toast' | 'dropdown' | 'forum' | 'stories' | 'stories-focus' | 'topbar-search' |
    'settings-popup' | 'monoforum',
  onPop: (canAnimate: boolean) => boolean | void,
  onEscape?: () => boolean,
  noHistory?: boolean,
  noBlurOnPop?: boolean,
  removed?: boolean,
  context?: any
};

export const USE_NAVIGATION_API = 'navigation' in window && !IS_FIREFOX;
const TRY_TO_TRAVERSE = USE_NAVIGATION_API && true; // * not tested for legacy api

export class AppNavigationController {
  private navigations: Array<NavigationItem>;
  private id: number;
  private manual: boolean;
  private log: ReturnType<typeof logger>;
  private debug: boolean;
  private currentHash: string; // have to start with # if not empty
  private overriddenHash: string; // have to start with # if not empty
  private isPossibleSwipe: boolean;
  private escapeHandlers: Array<() => boolean> = [];
  private ignoreNextNavigations: string[];
  private popping: boolean;
  private modificationQueue: Array<() => void>;
  private modificationBusy: boolean;
  private modificationResolve: () => void;
  public onHashChange: () => void;

  constructor() {
    this.navigations = [];
    this.id = tabId;
    this.manual = false;
    this.log = logger('NC');
    this.debug = true;
    this.currentHash = window.location.hash;
    this.overriddenHash = '';
    this.isPossibleSwipe = false;
    this.ignoreNextNavigations = [];
    this.popping = false;
    this.modificationQueue = [];
    this.modificationBusy = false;

    history.scrollRestoration = 'manual';

    if(USE_NAVIGATION_API) {
      // * push init state
      // if(USE_NAVIGATION_API) {
      //   this.debug && this.log('push');
      //   history.pushState(this.id, '', new URL(location.href));
      // }

      navigation.addEventListener('navigate', this.onNavigate);
    } else {
      window.addEventListener('popstate', this.onPopState);

      // * push init state
      if(!USE_NAVIGATION_API/*  || true */) {
        this.pushState();
      }
    }

    window.addEventListener('keydown', this.onKeyDown, {capture: true, passive: false});

    if(IS_MOBILE_SAFARI) {
      const options = {passive: true};
      window.addEventListener('touchstart', this.onTouchStart, options);
    }
  }

  private onNavigate = (event: NavigationEvent) => {
    this.modificationResolve?.();
    const log = this.log.bindPrefix('navigate');
    // debugger;
    log(event, navigation.currentEntry);

    const fixHashIfNeeded = () => {
      const destinationHash = new URL(event.destination.url).hash;
      if(
        event.navigationType === 'traverse' &&
        destinationHash !== this.currentHash
      ) {
        this.modifyHistoryFromEvent(() => { // * fix hash
          log('will fix hash', destinationHash, this.currentHash);
          this.replaceState();
        });
      }
    };

    if(event.destination.index > navigation.currentEntry.index) {
      log('ignoring forward navigation');
      cancelEvent(event);
      event.intercept();
      fixHashIfNeeded();
      return;
    }

    if(event.navigationType === this.ignoreNextNavigations[0]) {
      log('ignoring event', event.navigationType);
      this.ignoreNextNavigations.shift();
      fixHashIfNeeded();
      return;
    }

    if(
      (
        event.navigationType === 'push' ||
        (event.navigationType === 'replace' && !event.destination.sameDocument)
      ) &&
      event.destination.getState() === this.id
    ) {
      event.intercept({
        handler: () => {
          log('push-like intercepted');
        },
        focusReset: 'manual', // * prevent losing focus
        scroll: 'manual'
      });
      return;
    }

    if(
      event.navigationType === 'reload' ||
      event.navigationType === 'replace' ||
      !event.destination.sameDocument
    ) {
      return;
    }

    const url = new URL(event.destination.url);

    if(event.navigationType === 'push') {
      this.overrideHash(url.hash);
      this.onHashChange?.();
      return;
    }

    let hash = url.hash;
    // * don't set old hash if we're going back
    if(event.destination.index < navigation.currentEntry.index) {
      hash = this.currentHash;
      fixHashIfNeeded();
    }
    this._onPopState(hash, 0);

    // ! commented because it will still require a click after every back
    // this.modifyHistoryFromEvent(() => {
    //   const entries = navigation.entries().filter((entry) => entry.getState() === this.id);
    //   const currentEntryIndex = entries.findIndex((entry) => entry.key === navigation.currentEntry.key);
    //   log('entries', entries, currentEntryIndex);
    //   if(currentEntryIndex < 1) {
    //     log('push state because no entry left with this id');
    //     this.pushState();
    //   }
    // });
  };

  private onPopState = (e: PopStateEvent) => {
    this._onPopState(window.location.hash, e.state);
  };

  private _onPopState(hash: string, id: number) {
    this.debug && this.log('popstate', this.isPossibleSwipe, hash, id);
    if(hash !== this.currentHash) {
      this.debug && this.log.warn(`hash changed, new=${hash}, current=${this.currentHash}, overridden=${this.overriddenHash}`);
      // fix for returning to wrong hash (e.g. chat -> archive -> chat -> 3x back)
      if((USE_NAVIGATION_API || id === this.id) && this.overriddenHash && this.overriddenHash !== hash) {
        this.overrideHash(this.overriddenHash, true);
      } else if(id/*  === this.id */ && !this.overriddenHash && hash) {
        this.overrideHash(undefined, true);
      } else {
        this.currentHash = hash;
        this.onHashChange?.();
        // this.replaceState();
        return;
      }
    }

    if(!USE_NAVIGATION_API && id !== this.id/*  && !this.navigations.length */) {
      this.pushState();

      if(!this.navigations.length) {
        return;
      }
    }

    const item = this.navigations.pop();
    if(!item) {
      this.pushState();
      return;
    }

    this.manual = !this.isPossibleSwipe;
    this.popping = true;
    this.handleItem(item, this.navigations.length);
    this.popping = false;
    // this.pushState(); // * prevent adding forward arrow
  }

  private onKeyDown = (e: KeyboardEvent) => {
    const item = this.navigations[this.navigations.length - 1];
    if(!item) return;
    if(e.key === 'Escape' && this.canCloseOnEscape() && (item.onEscape ? item.onEscape() : true)) {
      cancelEvent(e);
      this.back(item.type);
    }
  };

  private onTouchStart = (e: TouchEvent) => {
    if(e.touches.length > 1) return;
    this.debug && this.log('touchstart');

    if(isSwipingBackSafari(e)) {
      this.isPossibleSwipe = true;

      window.addEventListener('touchend', () => {
        setTimeout(() => {
          this.isPossibleSwipe = false;
        }, 100);
      }, {passive: true, once: true});
    }

    /* const detach = () => {
      window.removeEventListener('touchend', onTouchEnd);
      window.removeEventListener('touchmove', onTouchMove);
    };

    let moved = false;
    const onTouchMove = (e: TouchEvent) => {
      this.debug && this.log('touchmove');
      if(e.touches.length > 1) {
        detach();
        return;
      }

      moved = true;
    };

    const onTouchEnd = (e: TouchEvent) => {
      this.debug && this.log('touchend');
      if(e.touches.length > 1 || !moved) {
        detach();
        return;
      }

      isPossibleSwipe = true;
      doubleRaf().then(() => {
        isPossibleSwipe = false;
      });

      detach();
    };

    window.addEventListener('touchend', onTouchEnd, options);
    window.addEventListener('touchmove', onTouchMove, options); */
  };

  public overrideHash(hash: string = '', forceReplace?: boolean) {
    // return;
    if(hash && hash[0] !== '#') hash = '#' + hash;
    else if(hash === '#') hash = '';

    if(this.currentHash === hash && !forceReplace) {
      return;
    }

    this.overriddenHash = this.currentHash = hash;
    this.modifyHistoryFromEvent(() => {
      this.replaceState();
    });
    // this.pushState();
  }

  private handleItem(item: NavigationItem, wasIndex = this.navigations.indexOf(item)) {
    const good = item.onPop(!this.manual ? false : undefined);
    this.debug && this.log('popstate, navigation:', item, this.navigations);
    if(good === false) { // insert item on the same place, because .push can have different index if new item has appeared
      this.spliceItems(Math.min(this.navigations.length, wasIndex), 0, item);
    } else if(!item.noBlurOnPop) {
      blurActiveElement(); // no better place for it
    }

    if(good !== false) {
      this.onItemDeleted(item);
    }

    this.manual = false;
  }

  private onItemDeleted(item: NavigationItem) {
    if(item.removed) {
      return;
    }

    this.log.warn('onItemDeleted', item);
    if(TRY_TO_TRAVERSE && !item.noHistory && !this.popping) {
      // * have to have this timeout,
      // * otherwise browser will eat the event if you do push and back together
      this.modifyHistoryFromEvent(() => {
        this.log('onItemDeleted: back');
        this.ignoreNextNavigations.unshift('traverse');
        if(USE_NAVIGATION_API) {
          navigation.back();
          // const entries = navigation.entries().reverse().filter((entry) => entry.getState() === this.id);
          // const currentEntryIndex = entries.findIndex((entry) => entry.key === navigation.currentEntry.key);
          // if(currentEntryIndex !== -1) entries.splice(0, currentEntryIndex);
          // // navigation.traverseTo((entries[1] || entries[0]).key);
          // navigation.traverseTo(entries[currentEntryIndex === 0 ? 1 : 0].key);
        } else {
          history.back();
        }
      });
    }

    item.removed = true;
  }

  public findItemByType(type: NavigationItem['type']) {
    for(let i = this.navigations.length - 1; i >= 0; --i) {
      const item = this.navigations[i];
      if(item.type === type) {
        return {item, index: i};
      }
    }
  }

  public back(type?: NavigationItem['type']) {
    if(type) {
      const ret = this.findItemByType(type);
      if(ret) {
        this.backByItem(ret.item, ret.index);
        return;
      }
    }

    history.back();
  }

  public backByItem(item: NavigationItem, index = this.navigations.indexOf(item)) {
    if(index === -1) {
      return;
    }

    this.manual = true;
    // ! commented because 'popstate' event will be fired with delay
    // if(index !== (this.navigations.length - 1)) {
    this.spliceItems(index, 1);
    this.handleItem(item, index);
    // }
  }

  private onItemAdded(item: NavigationItem) {
    this.debug && this.log('onItemAdded', item, this.navigations);

    delete item.removed;

    if(!item.noHistory) {
      this.modifyHistoryFromEvent(() => {
        this.log('onItemAdded: push');
        this.pushState();
      });
    }
  }

  public pushItem(item: NavigationItem) {
    this.navigations.push(item);
    this.onItemAdded(item);
  }

  public unshiftItem(item: NavigationItem) {
    this.navigations.unshift(item);
    this.onItemAdded(item);
  }

  public spliceItems(index: number, length: number, ...items: NavigationItem[]) {
    const deleted = this.navigations.splice(index, length, ...items);
    deleted.forEach((item) => {
      this.onItemDeleted(item);
    });
    items.forEach((item) => {
      this.onItemAdded(item);
    });
  }

  public pushState() {
    this.debug && this.log.warn('push');
    this.manual = false;

    if(USE_NAVIGATION_API) {
      navigation.navigate(location.href, {state: this.id, history: 'push'});
    } else {
      history.pushState(this.id, '');
    }
  }

  public replaceState(url?: URL) {
    this.debug && this.log.warn('replace');

    if(!url) {
      url = new URL(location.href);
      url.hash = this.overriddenHash;
    }

    if(USE_NAVIGATION_API) {
      navigation.navigate(url/* url.hash || '#' */, {state: this.id, history: 'replace'});
    } else {
      history.replaceState(this.id, '', url);
    }
  }

  public removeItem(item: NavigationItem) {
    const index = this.navigations.indexOf(item);
    if(index === -1) {
      return;
    }

    this.spliceItems(index, 1);
  }

  public removeByType(type: NavigationItem['type'], single = false) {
    for(let i = this.navigations.length - 1; i >= 0; --i) {
      const item = this.navigations[i];
      if(item.type === type) {
        this.spliceItems(i, 1);

        if(single) {
          break;
        }
      }
    }
  }

  private canCloseOnEscape() {
    return this.escapeHandlers.every((fn) => fn());
  }

  public registerEscapeHandler(handler: () => boolean) {
    this.escapeHandlers.push(handler);

    return () => {
      this.escapeHandlers = this.escapeHandlers.filter((fn) => fn !== handler);
    };
  }

  private modifyHistoryFromEvent(callback?: () => void) {
    if(!USE_NAVIGATION_API) {
      callback?.();
      return;
    }

    if(callback) {
      this.modificationQueue.push(callback);
    }

    if(this.modificationBusy) return;
    this.modificationBusy = true;
    setTimeout(() => {
      const callback = this.modificationQueue.shift();
      if(!callback) {
        return;
      }

      this.modificationResolve = () => {
        this.modificationResolve = undefined;
        this.modificationBusy = false;
        if(this.modificationQueue.length) {
          this.modifyHistoryFromEvent();
        }
      };
      callback();
    }, 0);
  }

  public getNextIndex() {
    return this.navigations.length;
  }

  public findItem(predicate: (item: NavigationItem) => boolean) {
    const index = this.navigations.findIndex(predicate);
    return index === -1 ? undefined : {index, item: this.navigations[index]};
  }

  public reload(urlOrRemoveHash?: boolean | URL) {
    this.spliceItems(0, Infinity); // * clear the stack
    if(typeof(urlOrRemoveHash) === 'boolean') {
      urlOrRemoveHash && this.overrideHash();
    } else {
      this.modifyHistoryFromEvent(() => {
        this.replaceState(urlOrRemoveHash);
      });
    }
    this.modifyHistoryFromEvent(() => {
      location.reload();
    });
  }

  public close() {
    try {
      window.close();
    } catch(e) {}
  }

  /**
   * Better to call from event
   */
  public focus() {
    window.focus();
  }

  public navigateToUrl(url: string) {
    if(USE_NAVIGATION_API) {
      navigation.removeEventListener('navigate', this.onNavigate);
    } else {
      window.removeEventListener('popstate', this.onPopState);
    }

    setTimeout(() => {
      location.href = url;
    }, 100);
  }
}

const appNavigationController = new AppNavigationController();
MOUNT_CLASS_TO.appNavigationController = appNavigationController;
export default appNavigationController;
