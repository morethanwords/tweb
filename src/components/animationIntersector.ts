import type {LiteModeKey} from '@helpers/liteMode';
import type RLottiePlayer from '@lib/rlottie/rlottiePlayer';
import {useAppSettings} from '@stores/appSettings';
import {MOUNT_CLASS_TO} from '@config/debug';
import isInDOM from '@helpers/dom/isInDOM';
import indexOfAndSplice from '@helpers/array/indexOfAndSplice';
import forEachReverse from '@helpers/array/forEachReverse';
import idleController from '@helpers/idleController';
import {fastRaf} from '@helpers/schedulers';
import {Middleware} from '@helpers/middleware';
import safePlay from '@helpers/dom/safePlay';
import {getAppWindow, onAppWindowChange} from '@helpers/appWindow';

export type AnimationItemGroup = '' | 'none' | 'chat' | 'lock' |
  'STICKERS-POPUP' | 'emoticons-dropdown' | 'STICKERS-SEARCH' | 'GIFS-SEARCH' |
  `CHAT-MENU-REACTIONS-${number}` | 'INLINE-HELPER' | 'GENERAL-SETTINGS' | 'STICKER-VIEWER' | 'EMOJI' |
  'EMOJI-STATUS' | `chat-${number}` | 'PREMIUM-PROMO' | 'NEW-MEDIA' | 'BLUFF-SPOILER';
export interface AnimationItem {
  el: HTMLElement,
  group: AnimationItemGroup,
  animation: AnimationItemWrapper,
  liteModeKey?: LiteModeKey,
  controlled?: boolean | Middleware,
  type: AnimationItemType,
  locked?: boolean
};

export type AnimationItemType = 'lottie' | 'dots' | 'video' | 'emoji';

export interface AnimationItemWrapper {
  remove: () => void;
  paused: boolean;
  pause: () => any;
  play: () => any;
  autoplay: boolean;
  _autoplay?: boolean;
  loop: boolean | number;
  _loop?: boolean | number;
  onPlaybackParamsMutated?: () => void;
  // onVisibilityChange?: (visible: boolean) => boolean;
};

export class AnimationIntersector {
  private observer: IntersectionObserver;
  private onObserve: (entries: IntersectionObserverEntry[]) => void;
  private visible: Set<AnimationItem>;

  private overrideIdleGroups: Set<string>;
  private byGroups: {[group in AnimationItemGroup]?: AnimationItem[]};
  private byPlayer: Map<AnimationItem['animation'], AnimationItem>;
  // Element → its AnimationItems, kept in lockstep with byGroups/byPlayer (see add/removeAnimation).
  // The IntersectionObserver callback (onObserve) and getAnimations() resolve target → item via this
  // O(1) lookup instead of an O(groups × items) nested scan on every scroll callback.
  private byElement: Map<HTMLElement, AnimationItem[]>;
  private lockedGroups: {[group in AnimationItemGroup]?: true};
  private onlyOnePlayableGroup: AnimationItemGroup;

  private intersectionLockedGroups: {[group in AnimationItemGroup]?: true};
  private videosLocked: boolean;

  constructor() {
    this.onObserve = (entries) => {
      // if(rootScope.idle.isIDLE) return;

      for(const entry of entries) {
        const target = entry.target;

        const items = this.byElement.get(target as HTMLElement);
        if(!items) {
          continue;
        }

        // Same semantics as the previous byGroups scan: act on the first item whose group is not
        // intersection-locked, then stop (the old loop `break`ed after the first match).
        const animation = items.find((p) => !this.intersectionLockedGroups[p.group]);
        if(animation) {
          if(entry.isIntersecting) {
            this.visible.add(animation);
            this.checkAnimation(animation, false);

            /* if(animation instanceof HTMLVideoElement && animation.dataset.src) {
              animation.src = animation.dataset.src;
              animation.load();
            } */
          } else {
            this.visible.delete(animation);
            this.checkAnimation(animation, true);

            const _animation = animation.animation;
            if(
              animation.type === 'lottie' &&
              (_animation as RLottiePlayer).paused
              /*  && animation.cachingDelta === 2 */
            ) {
              // console.warn('will clear cache', player);
              (_animation as RLottiePlayer).clearCacheWhenSafe();
            }/*  else if(animation instanceof HTMLVideoElement && animation.src) {
              animation.dataset.src = animation.src;
              animation.src = '';
              animation.load();
            } */
          }
        }
      }
    };

    this.createObserver();

    this.visible = new Set();

    this.overrideIdleGroups = new Set();
    this.byGroups = {};
    this.byPlayer = new Map();
    this.byElement = new Map();
    this.lockedGroups = {};
    this.onlyOnePlayableGroup = '';

    this.intersectionLockedGroups = {};
    this.videosLocked = false;

    // An IntersectionObserver's implicit root is the viewport of the realm that constructed it. When
    // the client pops into a Document PiP window the whole app DOM (incl. every observed sticker / gif
    // / media-spoiler canvas) moves there, so a main-realm observer reports them all as off-screen and
    // pauses them — most visibly, media spoilers (worker-rendered) freeze blank because they never get
    // a `play`. Rebuild the observer against the active window and re-observe everything on every
    // pop-in/out. When the app window never changes (no PiP) this never fires.
    onAppWindowChange(() => {
      this.observer.disconnect();
      this.createObserver();
      for(const group in this.byGroups) {
        for(const item of this.byGroups[group as AnimationItemGroup]) {
          this.observer.observe(item.el);
        }
      }
    });

    idleController.addEventListener('change', (idle) => {
      this.checkAnimations2(idle);
    });
  }

  private createObserver() {
    // Active window's constructor → its viewport is the observer's implicit root (see onAppWindowChange).
    const IO = (getAppWindow() as Window & typeof globalThis).IntersectionObserver;
    this.observer = new IO(this.onObserve);
  }

  public toggleMediaPause(paused: boolean) {
    if(paused) {
      if(this.videosLocked) {
        this.videosLocked = false;
        this.checkAnimations2();
      }
    } else {
      this.videosLocked = true;
      this.checkAnimations2();
    }
  }

  // Pause (or resume) every registered video whose observed element is inside
  // `element`, and lock/unlock it so the IntersectionObserver can't flip the
  // state back while it's meant to stay paused. The right sidebar is hidden with
  // a transform — the column stays mounted and the observer keeps reporting its
  // contents as "visible" (it only re-reads on the initial observe, not on an
  // ancestor transform), so off-screen detection alone never stops avatar videos
  // animating inside the closed panel. Driven by 'right_sidebar_toggle'.
  public toggleVideosUnder(element: HTMLElement, paused: boolean) {
    if(!element) {
      return;
    }

    this.byPlayer.forEach((item) => {
      if(item.type !== 'video' || !element.contains(item.el)) {
        return;
      }

      this.toggleItemLock(item, paused);
      if(paused) {
        item.animation.pause();
      } else {
        this.checkAnimation(item);
      }
    });
  }

  public setOverrideIdleGroup(group: string, override: boolean) {
    if(override) this.overrideIdleGroups.add(group);
    else this.overrideIdleGroups.delete(group);
  }

  public getAnimations(element: HTMLElement) {
    const items = this.byElement.get(element);
    // Copy to preserve the previous contract (a fresh array each call, safe for callers to keep).
    return items ? items.slice() : [];
  }

  public removeAnimation(player: AnimationItem) {
    const {el, animation} = player;
    if(player.controlled !== true && player.type !== 'video') {
      animation.remove();
    }

    const group = this.byGroups[player.group];
    if(group) {
      indexOfAndSplice(group, player);
      if(!group.length) {
        delete this.byGroups[player.group];
      }
    }

    const elementItems = this.byElement.get(el);
    if(elementItems) {
      indexOfAndSplice(elementItems, player);
      if(!elementItems.length) {
        this.byElement.delete(el);
      }
    }

    this.observer.unobserve(el);
    this.visible.delete(player);
    this.byPlayer.delete(animation);
  }

  public removeAnimationByPlayer(player: AnimationItemWrapper) {
    const item = this.byPlayer.get(player);
    if(item) {
      this.removeAnimation(item);
    }
  }

  public isVisible(animation: AnimationItem['animation']) {
    const item = this.byPlayer.get(animation);
    return !!item && this.visible.has(item);
  }

  public addAnimation(options: {
    animation: AnimationItem['animation'],
    group?: AnimationItemGroup,
    observeElement: HTMLElement,
    controlled?: AnimationItem['controlled'],
    liteModeKey?: LiteModeKey
    type: AnimationItemType,
    locked?: boolean
  }) {
    const {animation, group = '', observeElement, controlled, liteModeKey, type, locked} = options;
    if(group === 'none' || this.byPlayer.has(animation)) {
      return;
    }

    const item: AnimationItem = {
      el: observeElement,
      animation: animation,
      group,
      controlled,
      liteModeKey,
      type,
      locked
    };

    if(controlled && typeof(controlled) !== 'boolean') {
      controlled.onClean(() => {
        this.removeAnimationByPlayer(animation);
      });
    }

    if(item.type === 'lottie') {
      const [appSettings] = useAppSettings();
      if(!appSettings.stickers.loop && animation.loop) {
        animation.loop = appSettings.stickers.loop;
      }
    }

    (this.byGroups[group as AnimationItemGroup] ??= []).push(item);
    let elementItems = this.byElement.get(item.el);
    if(!elementItems) {
      this.byElement.set(item.el, elementItems = []);
    }
    elementItems.push(item);
    this.observer.observe(item.el);
    this.byPlayer.set(animation, item);
  }

  public checkAnimations(
    blurred?: boolean,
    group?: AnimationItemGroup,
    destroy?: boolean,
    imitateIntersection?: boolean,
    exceptGroup?: AnimationItemGroup
  ) {
    // if(rootScope.idle.isIDLE) return;

    if(group !== undefined && !this.byGroups[group]) {
      // console.warn('no animation group:', group);
      return;
    }

    const groups = group !== undefined /* && false */ ? [group] : Object.keys(this.byGroups) as AnimationItemGroup[];

    for(const group of groups) {
      if(group === exceptGroup) {
        continue;
      }

      if(imitateIntersection && this.intersectionLockedGroups[group]) {
        continue;
      }

      const animations = this.byGroups[group];

      forEachReverse(animations, (animation) => {
        this.checkAnimation(animation, blurred, destroy);
      });
    }
  }

  public checkAnimations2(blurred?: boolean, exceptGroup?: AnimationItemGroup) {
    this.checkAnimations(blurred, undefined, undefined, true, exceptGroup);
  }

  public checkAnimation(player: AnimationItem, blurred?: boolean, destroy?: boolean) {
    const {el, animation, group, locked} = player;
    if(locked) {
      return;
    }

    // return;
    if(destroy || (!this.lockedGroups[group] && !isInDOM(el))) {
      if(!player.controlled || destroy) {
        this.removeAnimation(player);
      }

      return;
    }

    if(
      blurred ||
      (this.onlyOnePlayableGroup && this.onlyOnePlayableGroup !== group) ||
      (player.type === 'video' && this.videosLocked)
    ) {
      if(!animation.paused) {
        // console.warn('pause animation:', animation);
        animation.pause();
      }
    } else if(
      animation.paused &&
      this.visible.has(player) &&
      animation.autoplay &&
      (!this.onlyOnePlayableGroup || this.onlyOnePlayableGroup === group) &&
      (!idleController.isIdle || this.overrideIdleGroups.has(player.group))
    ) {
      // console.warn('play animation:', animation);
      safePlay(animation);
    }
  }

  public getOnlyOnePlayableGroup() {
    return this.onlyOnePlayableGroup;
  }

  public setOnlyOnePlayableGroup(group: AnimationItemGroup = '') {
    this.onlyOnePlayableGroup = group;
  }

  public lockGroup(group: AnimationItemGroup) {
    this.lockedGroups[group] = true;
  }

  public unlockGroup(group: AnimationItemGroup) {
    delete this.lockedGroups[group];
    this.checkAnimations(undefined, group);
  }

  public refreshGroup(group: AnimationItemGroup) {
    const animations = this.byGroups[group];
    if(!animations?.length) {
      return;
    }

    animations.forEach((animation) => {
      this.observer.unobserve(animation.el);
    });

    fastRaf(() => {
      animations.forEach((animation) => {
        this.observer.observe(animation.el);
      });
    });
  }

  public lockIntersectionGroup(group: AnimationItemGroup) {
    this.intersectionLockedGroups[group] = true;
  }

  public unlockIntersectionGroup(group: AnimationItemGroup) {
    delete this.intersectionLockedGroups[group];
    this.refreshGroup(group);
  }

  public toggleIntersectionGroup(group: AnimationItemGroup, lock: boolean) {
    if(lock) this.lockIntersectionGroup(group);
    else this.unlockIntersectionGroup(group);
  }

  public setAutoplay(play: boolean, liteModeKey: LiteModeKey) {
    const [appSettings] = useAppSettings();
    let changed = false;
    this.byPlayer.forEach((animationItem, animation) => {
      if(animationItem.liteModeKey === liteModeKey) {
        changed = true;
        animation.autoplay = play ? animation._autoplay : false;
        animation.loop = play ? appSettings.stickers.loop && animation._loop : false;
        animation.onPlaybackParamsMutated?.();
      }
    });

    return changed;
  }

  public setLoop(loop: boolean) {
    let changed = false;
    this.byPlayer.forEach((animationItem, animation) => {
      if(
        animation._loop &&
        animation.loop !== loop &&
        (animationItem.type === 'lottie' || animationItem.type === 'video')
      ) {
        changed = true;
        animation.loop = loop;

        // if(animation._autoplay && animation.autoplay !== animation._autoplay) {
        animation.autoplay = animation._autoplay;
        // }
        animation.onPlaybackParamsMutated?.();
      }
    });

    return changed;
  }

  public toggleItemLock(animationItem: AnimationItem, lock: boolean) {
    // const wasLocked = animationItem.locked;
    animationItem.locked = lock;

    // if(!!wasLocked !== lock) {
    //   this.checkAnimation(animationItem);
    // }
  }
}

const animationIntersector = new AnimationIntersector();
MOUNT_CLASS_TO && (MOUNT_CLASS_TO.animationIntersector = animationIntersector);
export default animationIntersector;
