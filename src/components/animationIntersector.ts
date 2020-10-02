import { isInDOM, $rootScope } from "../lib/utils";
import { RLottiePlayer } from "../lib/lottieLoader";
import { MOUNT_CLASS_TO } from "../lib/mtproto/mtproto_config";

export interface AnimationItem {
  el: HTMLElement,
  group: string,
  animation: RLottiePlayer | HTMLVideoElement
};

export class AnimationIntersector {
  public observer: IntersectionObserver;
  private visible: Set<AnimationItem> = new Set();

  private byGroups: {[group: string]: AnimationItem[]} = {};
  private lockedGroups: {[group: string]: true} = {};
  private onlyOnePlayableGroup: string = '';
  
  private intersectionLockedGroups: {[group: string]: true} = {};

  constructor() {
    this.observer = new IntersectionObserver((entries) => {
      if($rootScope.idle.isIDLE) return;

      for(const entry of entries) {
        const target = entry.target;

        for(const group in this.byGroups) {
          if(this.intersectionLockedGroups[group]) {
            continue;
          }

          const player = this.byGroups[group].find(p => p.el == target);
          if(player) {
            if(entry.isIntersecting) {
              this.visible.add(player);
              this.checkAnimation(player, false);
            } else {
              this.visible.delete(player);
              this.checkAnimation(player, true);

              if(player.animation instanceof RLottiePlayer/*  && player.animation.cachingDelta == 2 */) {
                //console.warn('will clear cache', player);
                player.animation.clearCache();
              }
            }

            break;
          }
        }
      }
    });
  }

  public getAnimations(element: HTMLElement) {
    const found: AnimationItem[] = [];
    for(const group in this.byGroups) {
      for(const player of this.byGroups[group]) {
        if(player.el == element) {
          found.push(player);
        }
      }
    }

    return found;
  }

  public removeAnimation(player: AnimationItem) {
    //console.log('destroy animation');
    const {el, animation} = player;
    animation.remove();

    if(animation instanceof HTMLVideoElement) {
      animation.src = '';
      animation.load();
    }

    for(const group in this.byGroups) {
      this.byGroups[group].findAndSplice(p => p == player);
    }
  
    this.observer.unobserve(el);
    this.visible.delete(player);
  }

  public addAnimation(animation: RLottiePlayer | HTMLVideoElement, group = '') {
    const player = {
      el: animation instanceof RLottiePlayer ? animation.el : animation, 
      animation: animation, 
      group
    };

    (this.byGroups[group] ?? (this.byGroups[group] = [])).push(player);
    this.observer.observe(player.el);
  }

  public checkAnimations(blurred?: boolean, group?: string, destroy = false) {
    if($rootScope.idle.isIDLE) return;
    
    const groups = group /* && false */ ? [group] : Object.keys(this.byGroups);

    if(group && !this.byGroups[group]) {
      //console.warn('no animation group:', group);
      this.byGroups[group] = [];
      return;
    }

    for(const group of groups) {
      const animations = this.byGroups[group];

      animations.forEach(player => {
        this.checkAnimation(player, blurred, destroy);
      });
    }
  }

  public checkAnimation(player: AnimationItem, blurred = false, destroy = false) {
    const {el, animation, group} = player;
    //return;
    if((destroy || (!isInDOM(el) && !this.lockedGroups[group]))/*  && false */) {
      this.removeAnimation(player);
      return;
    }

    if(blurred) {
      if(!animation.paused) {
        //console.warn('pause animation:', animation);
        animation.pause();
      }
    } else if(animation.paused && this.visible.has(player) && animation.autoplay && (!this.onlyOnePlayableGroup || this.onlyOnePlayableGroup == group)) {
      //console.warn('play animation:', animation);
      animation.play();
    }
  }

  public setOnlyOnePlayableGroup(group: string) {
    this.onlyOnePlayableGroup = group;
  }

  public lockGroup(group: string) {
    this.lockedGroups[group] = true;
  }

  public unlockGroup(group: string) {
    delete this.lockedGroups[group];
    this.checkAnimations(undefined, group);
  }

  public refreshGroup(group: string) {
    const animations = this.byGroups[group];
    if(animations && animations.length) {
      animations.forEach(animation => {
        this.observer.unobserve(animation.el);
      });

      window.requestAnimationFrame(() => {
        animations.forEach(animation => {
          this.observer.observe(animation.el);
        });
      });
    }
  }

  public lockIntersectionGroup(group: string) {
    this.intersectionLockedGroups[group] = true;
  }

  public unlockIntersectionGroup(group: string) {
    delete this.intersectionLockedGroups[group];
    this.refreshGroup(group);
  }
}

const animationIntersector = new AnimationIntersector();
if(MOUNT_CLASS_TO) {
  MOUNT_CLASS_TO.animationIntersector = animationIntersector;
}
export default animationIntersector;