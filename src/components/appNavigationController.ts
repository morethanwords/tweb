/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import {MOUNT_CLASS_TO} from '../config/debug';
import {IS_MOBILE_SAFARI} from '../environment/userAgent';
import {logger} from '../lib/logger';
import blurActiveElement from '../helpers/dom/blurActiveElement';
import cancelEvent from '../helpers/dom/cancelEvent';
import isSwipingBackSafari from '../helpers/dom/isSwipingBackSafari';
import indexOfAndSplice from '../helpers/array/indexOfAndSplice';

export type NavigationItem = {
  type: 'left' | 'right' | 'im' | 'chat' | 'popup' | 'media' | 'menu' |
    'esg' | 'multiselect' | 'input-helper' | 'autocomplete-helper' | 'markup' |
    'global-search' | 'voice' | 'mobile-search' | 'filters' | 'global-search-focus' |
    'toast' | 'dropdown' | 'forum' | 'stories' | 'stories-focus' | 'topbar-search' |
    'settings-popup',
  onPop: (canAnimate: boolean) => boolean | void,
  onEscape?: () => boolean,
  noHistory?: boolean,
  noBlurOnPop?: boolean,
};

export class AppNavigationController {
  private navigations: Array<NavigationItem>;
  private id: number;
  private manual: boolean;
  private log: ReturnType<typeof logger>;
  private debug: boolean;
  private currentHash: string; // have to start with # if not empty
  private overriddenHash: string; // have to start with # if not empty
  private isPossibleSwipe: boolean;
  public onHashChange: () => void;

  constructor() {
    this.navigations = [];
    this.id = Date.now();
    this.manual = false;
    this.log = logger('NC');
    this.debug = true;
    this.currentHash = window.location.hash;
    this.overriddenHash = '';
    this.isPossibleSwipe = false;

    window.addEventListener('popstate', this.onPopState);
    window.addEventListener('keydown', this.onKeyDown, {capture: true, passive: false});

    if(IS_MOBILE_SAFARI) {
      const options = {passive: true};
      window.addEventListener('touchstart', this.onTouchStart, options);
    }

    history.scrollRestoration = 'manual';

    this.pushState(); // * push init state
  }

  private onPopState = (e: PopStateEvent) => {
    const hash = window.location.hash;
    const id: number = e.state;
    this.debug && this.log('popstate', e, this.isPossibleSwipe, hash);
    if(hash !== this.currentHash) {
      this.debug && this.log.warn(`hash changed, new=${hash}, current=${this.currentHash}, overridden=${this.overriddenHash}`);
      // fix for returning to wrong hash (e.g. chat -> archive -> chat -> 3x back)
      if(id === this.id && this.overriddenHash && this.overriddenHash !== hash) {
        this.overrideHash(this.overriddenHash);
      } else if(id/*  === this.id */ && !this.overriddenHash && hash) {
        this.overrideHash();
      } else {
        this.currentHash = hash;
        this.onHashChange && this.onHashChange();
        // this.replaceState();
        return;
      }
    }

    if(id !== this.id/*  && !this.navigations.length */) {
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
    this.handleItem(item, this.navigations.length);
    // this.pushState(); // * prevent adding forward arrow
  };

  private onKeyDown = (e: KeyboardEvent) => {
    const item = this.navigations[this.navigations.length - 1];
    if(!item) return;
    if(e.key === 'Escape' && (item.onEscape ? item.onEscape() : true)) {
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

  public overrideHash(hash: string = '') {
    if(hash && hash[0] !== '#') hash = '#' + hash;
    else if(hash === '#') hash = '';

    if(this.currentHash === hash) {
      return;
    }

    this.overriddenHash = this.currentHash = hash;
    this.replaceState();
    this.pushState();
  }

  private handleItem(item: NavigationItem, wasIndex = this.navigations.indexOf(item)) {
    const good = item.onPop(!this.manual ? false : undefined);
    this.debug && this.log('popstate, navigation:', item, this.navigations);
    if(good === false) { // insert item on the same place, because .push can have different index if new item has appeared
      this.spliceItems(Math.min(this.navigations.length, wasIndex), 0, item);
    } else if(!item.noBlurOnPop) {
      blurActiveElement(); // no better place for it
    }

    this.manual = false;
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
    this.navigations.splice(index, 1);
    this.handleItem(item, index);
    // }
  }

  private onItemAdded(item: NavigationItem) {
    this.debug && this.log('onItemAdded', item, this.navigations);

    if(!item.noHistory) {
      this.pushState();
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
    this.navigations.splice(index, length, ...items);
    items.forEach((item) => {
      this.onItemAdded(item);
    });
  }

  public pushState() {
    this.debug && this.log('push');
    this.manual = false;
    history.pushState(this.id, '');
  }

  public replaceState() {
    this.debug && this.log.warn('replace');

    const url = location.origin + location.pathname + location.search + this.overriddenHash;
    history.replaceState(this.id, '', url);
  }

  public removeItem(item: NavigationItem) {
    if(!item) {
      return;
    }

    indexOfAndSplice(this.navigations, item);
  }

  public removeByType(type: NavigationItem['type'], single = false) {
    for(let i = this.navigations.length - 1; i >= 0; --i) {
      const item = this.navigations[i];
      if(item.type === type) {
        this.navigations.splice(i, 1);

        if(single) {
          break;
        }
      }
    }
  }
}

const appNavigationController = new AppNavigationController();
MOUNT_CLASS_TO.appNavigationController = appNavigationController;
export default appNavigationController;
