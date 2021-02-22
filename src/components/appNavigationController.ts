import { MOUNT_CLASS_TO } from "../config/debug";
import { isMobileSafari } from "../helpers/userAgent";
import { blurActiveElement, cancelEvent } from "../helpers/dom";
import { logger } from "../lib/logger";
import { doubleRaf } from "../helpers/schedulers";

export type NavigationItem = {
  type: 'left' | 'right' | 'im' | 'chat' | 'popup' | 'media' | 'menu' | 'esg',
  onPop: (canAnimate: boolean) => boolean | void,
  onEscape?: () => boolean,
  noHistory?: boolean,
};

export class AppNavigationController {
  private navigations: Array<NavigationItem> = [];
  private id = Date.now();
  private manual = false;
  private log = logger('NC');
  private debug = true;

  constructor() {
    let isPossibleSwipe = false;
    window.addEventListener('popstate', (e) => {
      this.debug && this.log('popstate', e, isPossibleSwipe);

      const id: number = e.state;
      if(id !== this.id) {
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
        this.back();
      }
    }, {capture: true});

    if(isMobileSafari) {
      const options = {passive: true};
      window.addEventListener('touchstart', (e) => {
        if(e.touches.length > 1) return;
        this.debug && this.log('touchstart');

        const detach = () => {
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
        window.addEventListener('touchmove', onTouchMove, options);
      }, options);
    }

    this.pushState(); // * push init state
  }

  private handleItem(item: NavigationItem) {
    const good = item.onPop(!this.manual ? false : undefined);
    this.debug && this.log('popstate, navigation:', item, this.navigations);
    if(good === false) {
      this.pushItem(item);
    } else {
      blurActiveElement(); // no better place for it
    }

    this.manual = false;
  }

  public back(type?: NavigationItem['type']) {
    if(type) {
      let item: NavigationItem;
      let i = this.navigations.length - 1;
      for(; i >= 0; --i) {
        const _item = this.navigations[i];
        if(_item.type === type) {
          item = _item;
          break;
        }
      }

      if(item) {
        this.manual = true;
        if(i !== (this.navigations.length - 1)) {
          this.navigations.splice(i, 1);
          this.handleItem(item);
          return;
        }
      }
    }

    history.back();
  }

  public pushItem(item: NavigationItem) {
    this.navigations.push(item);
    this.debug && this.log('pushstate', item, this.navigations);

    if(!item.noHistory) {
      this.pushState();
    }
  }

  private pushState() {
    this.manual = false;
    history.pushState(this.id, '');
  }

  public replaceState() {
    history.replaceState(this.id, '');
  }

  public removeItem(item: NavigationItem) {
    this.navigations.findAndSplice(i => i === item);
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
MOUNT_CLASS_TO && (MOUNT_CLASS_TO.appNavigationController = appNavigationController);
export default appNavigationController;
