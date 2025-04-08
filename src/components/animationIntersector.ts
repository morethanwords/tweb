/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import type {LiteModeKey} from '../helpers/liteMode';
import type RLottiePlayer from '../lib/rlottie/rlottiePlayer';
import rootScope from '../lib/rootScope';
import {MOUNT_CLASS_TO} from '../config/debug';
import isInDOM from '../helpers/dom/isInDOM';
import indexOfAndSplice from '../helpers/array/indexOfAndSplice';
import forEachReverse from '../helpers/array/forEachReverse';
import idleController from '../helpers/idleController';
import {fastRaf} from '../helpers/schedulers';
import {Middleware} from '../helpers/middleware';
import safePlay from '../helpers/dom/safePlay';

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
  // onVisibilityChange?: (visible: boolean) => boolean;
};

export class AnimationIntersector {
  private observer: IntersectionObserver;
  private visible: Set<AnimationItem>;

  private overrideIdleGroups: Set<string>;
  private byGroups: {[group in AnimationItemGroup]?: AnimationItem[]};
  private byPlayer: Map<AnimationItem['animation'], AnimationItem>;
  private lockedGroups: {[group in AnimationItemGroup]?: true};
  private onlyOnePlayableGroup: AnimationItemGroup;

  private intersectionLockedGroups: {[group in AnimationItemGroup]?: true};
  private videosLocked: boolean;

  constructor() {
    this.observer = new IntersectionObserver((entries) => {
      // if(rootScope.idle.isIDLE) return;

      for(const entry of entries) {
        const target = entry.target;

        for(const group in this.byGroups) {
          if(this.intersectionLockedGroups[group as AnimationItemGroup]) {
            continue;
          }

          const animation = this.byGroups[group as AnimationItemGroup].find((p) => p.el === target);
          if(!animation) {
            continue;
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
            if(animation.type === 'lottie'/*  && animation.cachingDelta === 2 */) {
              // console.warn('will clear cache', player);
              (_animation as RLottiePlayer).clearCache();
            }/*  else if(animation instanceof HTMLVideoElement && animation.src) {
              animation.dataset.src = animation.src;
              animation.src = '';
              animation.load();
            } */
          }

          break;
        }
      }
    });

    this.visible = new Set();

    this.overrideIdleGroups = new Set();
    this.byGroups = {};
    this.byPlayer = new Map();
    this.lockedGroups = {};
    this.onlyOnePlayableGroup = '';

    this.intersectionLockedGroups = {};
    this.videosLocked = false;

    idleController.addEventListener('change', (idle) => {
      this.checkAnimations2(idle);
    });
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

  public setOverrideIdleGroup(group: string, override: boolean) {
    if(override) this.overrideIdleGroups.add(group);
    else this.overrideIdleGroups.delete(group);
  }

  public getAnimations(element: HTMLElement) {
    const found: AnimationItem[] = [];
    for(const group in this.byGroups) {
      for(const player of this.byGroups[group as AnimationItemGroup]) {
        if(player.el === element) {
          found.push(player);
        }
      }
    }

    return found;
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
      if(!rootScope.settings.stickers.loop && animation.loop) {
        animation.loop = rootScope.settings.stickers.loop;
      }
    }

    (this.byGroups[group as AnimationItemGroup] ??= []).push(item);
    this.observer.observe(item.el);
    this.byPlayer.set(animation, item);
  }

  public checkAnimations(
    blurred?: boolean,
    group?: AnimationItemGroup,
    destroy?: boolean,
    imitateIntersection?: boolean
  ) {
    // if(rootScope.idle.isIDLE) return;

    if(group !== undefined && !this.byGroups[group]) {
      // console.warn('no animation group:', group);
      return;
    }

    const groups = group !== undefined /* && false */ ? [group] : Object.keys(this.byGroups) as AnimationItemGroup[];

    for(const group of groups) {
      if(imitateIntersection && this.intersectionLockedGroups[group]) {
        continue;
      }

      const animations = this.byGroups[group];

      forEachReverse(animations, (animation) => {
        this.checkAnimation(animation, blurred, destroy);
      });
    }
  }

  public checkAnimations2(blurred?: boolean) {
    this.checkAnimations(blurred, undefined, undefined, true);
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
    let changed = false;
    this.byPlayer.forEach((animationItem, animation) => {
      if(animationItem.liteModeKey === liteModeKey) {
        changed = true;
        animation.autoplay = play ? animation._autoplay : false;
        animation.loop = play ? rootScope.settings.stickers.loop && animation._loop : false;
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
