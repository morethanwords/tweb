/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import { MOUNT_CLASS_TO } from "../config/debug";
import { IS_MOBILE_SAFARI } from "../environment/userAgent";
import { logger } from "../lib/logger";
import blurActiveElement from "../helpers/dom/blurActiveElement";
import cancelEvent from "../helpers/dom/cancelEvent";
import isSwipingBackSafari from "../helpers/dom/isSwipingBackSafari";
import indexOfAndSplice from "../helpers/array/indexOfAndSplice";

export type NavigationItem = {
  type: 'left' | 'right' | 'im' | 'chat' | 'popup' | 'media' | 'menu' | 
    'esg' | 'multiselect' | 'input-helper' | 'autocomplete-helper' | 'markup' | 
    'global-search' | 'voice' | 'mobile-search' | 'filters' | 'global-search-focus',
  onPop: (canAnimate: boolean) => boolean | void,
  onEscape?: () => boolean,
  noHistory?: boolean,
  noBlurOnPop?: boolean,
};

export class AppNavigationController {
  private navigations: Array<NavigationItem> = [];
  private id = Date.now();
  private manual = false;
  private log = logger('NC');
  private debug = true;
  private currentHash = window.location.hash;
  public onHashChange: () => void;

  constructor() {
    let isPossibleSwipe = false;
    window.addEventListener('popstate', (e) => {
      this.debug && this.log('popstate', e, isPossibleSwipe);

      if(window.location.hash !== this.currentHash) {
        this.onHashChange && this.onHashChange();
        this.replaceState();
        return;
      }
      this.currentHash = window.location.hash;

      const id: number = e.state;
      if(id !== this.id/*  && !this.navigations.length */) {
        this.pushState();
        return;
      }

      const item = this.navigations.pop();
      if(!item) {
        this.pushState();
        return;
      }

      this.manual = !isPossibleSwipe;
      this.handleItem(item);
      //this.pushState(); // * prevent adding forward arrow
    });

    window.addEventListener('keydown', (e) => {
      const item = this.navigations[this.navigations.length - 1];
      if(!item) return;
      if(e.key === 'Escape' && (item.onEscape ? item.onEscape() : true)) {
        cancelEvent(e);
        this.back(item.type);
      }
    }, {capture: true, passive: false});

    if(IS_MOBILE_SAFARI) {
      const options = {passive: true};
      window.addEventListener('touchstart', (e) => {
        if(e.touches.length > 1) return;
        this.debug && this.log('touchstart');

        if(isSwipingBackSafari(e)) {
          isPossibleSwipe = true;

          window.addEventListener('touchend', () => {
            setTimeout(() => {
              isPossibleSwipe = false;
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
      }, options);
    }

    history.scrollRestoration = 'manual';

    this.pushState(); // * push init state
  }

  private handleItem(item: NavigationItem) {
    const good = item.onPop(!this.manual ? false : undefined);
    this.debug && this.log('popstate, navigation:', item, this.navigations);
    if(good === false) {
      this.pushItem(item);
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
    this.manual = true;
    // ! commented because 'popstate' event will be fired with delay
    //if(index !== (this.navigations.length - 1)) {
      this.navigations.splice(index, 1);
      this.handleItem(item);
    //}
  }

  private onItemAdded(item: NavigationItem) {
    this.debug && this.log('pushstate', item, this.navigations);

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

  private pushState() {
    this.manual = false;
    history.pushState(this.id, '');
  }

  public replaceState() {
    history.replaceState(this.id, '', location.origin + location.pathname);
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
