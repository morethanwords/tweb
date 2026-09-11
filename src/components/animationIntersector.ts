import type {LiteModeKey} from '@helpers/liteMode';
import type LottiePlayer from '@lib/lottie/lottiePlayer';
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
  locked?: boolean,
  // Out-of-DOM reclaim state (see checkAnimation): an item registered before its element is
  // inserted must not be reclaimed on the observer's first "not intersecting" report.
  wasInDOM?: boolean,
  neverShownExpired?: boolean,
  staleTimer?: ReturnType<typeof setTimeout>
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

// How long an animation whose element has never been inserted is kept before the out-of-DOM reclaim
// takes it anyway - bounds the leak for a subtree that is built and then dropped without ever showing.
const NEVER_SHOWN_RECLAIM_TIMEOUT = 60000;

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

        // Every item on this element, not just the first one: several players can share a single
        // observed container (the login monkey puts its idle and its tracking player into one
        // `.media-sticker-wrapper`), and acting only on the first left the others never played,
        // never paused and never reclaimed. Reverse order because checkAnimation can reclaim an
        // item and splice it out of this very array.
        forEachReverse(items, (animation) => {
          if(this.intersectionLockedGroups[animation.group]) {
            return;
          }

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
              (_animation as LottiePlayer).paused
              /*  && animation.cachingDelta === 2 */
            ) {
              // console.warn('will clear cache', player);
              (_animation as LottiePlayer).clearCacheWhenSafe();
            }/*  else if(animation instanceof HTMLVideoElement && animation.src) {
              animation.dataset.src = animation.src;
              animation.src = '';
              animation.load();
            } */
          }
        });
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
    }

    // One element can carry several items (the login monkey puts its idle and its tracking player
    // into one wrapper) - keep observing it until the last of them is gone, or the survivors would
    // stop getting callbacks entirely.
    if(!elementItems?.length) {
      this.byElement.delete(el);
      this.observer.unobserve(el);
    }

    clearTimeout(player.staleTimer);
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
      locked,
      wasInDOM: isInDOM(observeElement)
    };

    if(controlled && typeof(controlled) !== 'boolean') {
      controlled.onClean(() => {
        this.removeAnimationByPlayer(animation);
      });
    }

    if(item.type === 'lottie') {
      // The auth cards load their stickers during the bootstrap, before the settings store is filled -
      // reading `.stickers.loop` off an empty store threw right here, and the throw travelled out of
      // loadAnimationWorker, rejecting the caller's load promise (the login monkey lost its input
      // wiring). Leave playback params alone until the settings are actually there.
      const [appSettings] = useAppSettings();
      const stickers = appSettings?.stickers;
      if(stickers && !stickers.loop && animation.loop) {
        animation.loop = stickers.loop;
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

    // * Reclaim BEFORE honouring `locked`. That flag means "playback is under manual control right
    // * now" - the hover-to-play logic locks whichever video it stops driving, and sound-capable
    // * videos are added locked - and it used to bail out above this branch, so a locked item was
    // * never reclaimed again. Its element left the DOM with its bubble and this registry kept the
    // * whole subtree: 4 047 detached nodes hung off animationIntersector in a day-old tab. An
    // * element that is out of the DOM has no playback left to control, and `controlled` still
    // * protects the items an owner deliberately keeps for re-insertion.
    // * An animation can be registered BEFORE its element is inserted: <Transition mode="outin"> (auth
    // * cards) creates the incoming card and runs its onMount while the outgoing one is still leaving,
    // * so the player loads into a detached subtree. The observer reports that element as "not
    // * intersecting" right away, and reclaiming there destroyed the sticker before it was ever shown
    // * (Safari lost that race - the code card came up with no monkey until a reload). Only reclaim an
    // * element that has been in the DOM at least once; one that never made it there is reclaimed on
    // * its own NEVER_SHOWN_RECLAIM_TIMEOUT deadline below, so a dropped subtree still can't pile up.
    const inDOM = isInDOM(el);
    if(inDOM) {
      player.wasInDOM = true;
    }

    const canReclaim = player.wasInDOM || player.neverShownExpired;
    if(!inDOM && !canReclaim && player.staleTimer === undefined) {
      // the observer reports a detached element once and then goes quiet, so the deadline needs its
      // own timer - otherwise a subtree that is never inserted would sit here until the next sweep
      player.staleTimer = setTimeout(() => {
        player.staleTimer = undefined;
        player.neverShownExpired = true;
        this.checkAnimation(player);
      }, NEVER_SHOWN_RECLAIM_TIMEOUT);
    }

    if(destroy || (!this.lockedGroups[group] && !inDOM && canReclaim)) {
      if(player.type === 'video') {
        animation.pause();
      }

      if(!player.controlled || destroy) {
        this.removeAnimation(player);
      }

      return;
    }

    if(locked) {
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
