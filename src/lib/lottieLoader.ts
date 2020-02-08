import LottiePlayer, { AnimationConfigWithPath, AnimationConfigWithData, AnimationItem } from "lottie-web";
import { isElementInViewport, isInDOM } from "./utils";

class LottieLoader {
  private lottie: /* any */ typeof LottiePlayer = null;
  private animations: {
    [group: string]: {
      animation: AnimationItem, 
      container: HTMLDivElement, 
      paused: boolean,
      autoplay: boolean
    }[]
  } = {};
  private debug = false;

  public checkAnimations(blurred?: boolean, group?: string) {
    let groups = group ? [group] : Object.keys(this.animations);

    if(group && !this.animations[group]) {
      console.warn('no animation group:', group);
      this.animations[group] = [];
      //return;
    }

    for(let group of groups) {
      let animations = this.animations[group];

      let length = animations.length;
      for(let i = length - 1; i >= 0; --i) {
        let {animation, container, paused, autoplay} = animations[i];
  
        if(!isInDOM(container)) {
          this.debug && console.log('destroy animation');
          animation.destroy();
          animations.splice(i, 1);
          continue;
        }
  
        if(!autoplay) continue;
        
        if(!isElementInViewport(container) || blurred) {
          if(!paused) {
            this.debug && console.log('pause animation', isElementInViewport(container), container);
            animation.pause();
            animations[i].paused = true;
          }
        } else if(paused) {
          this.debug && console.log('play animation', container);
          animation.play();
          animations[i].paused = false;
        }
      }
    }
  }

  public async loadAnimation(params: /* any */AnimationConfigWithPath | AnimationConfigWithData, group = '') {
    /* if(!this.lottie) {
      this.lottie = (await import(
        'lottie-web')).default;
      this.lottie.setQuality('low');
    } */

    //params.autoplay = false;
    //params.renderer = 'canvas';
    params.rendererSettings = {
      //context: canvasContext, // the canvas context
      //preserveAspectRatio: 'xMinYMin slice', // Supports the same options as the svg element's preserveAspectRatio property
      clearCanvas: true,
      progressiveLoad: true, // Boolean, only svg renderer, loads dom elements when needed. Might speed up initialization for large number of elements.
      hideOnTransparent: true, //Boolean, only svg renderer, hides elements when opacity reaches 0 (defaults to true)
    };

    if(!this.lottie) {
      this.lottie = LottiePlayer;
      //this.lottie.setQuality('low');
      this.lottie.setQuality(10);
    }

    let animation = this.lottie.loadAnimation(params);
    if(!this.animations[group]) this.animations[group] = [];
    this.animations[group].push({
      animation, 
      container: params.container as HTMLDivElement, 
      paused: !params.autoplay,
      autoplay: params.autoplay
    });

    if(params.autoplay) {
      this.checkAnimations();
    }
    
    return animation;
  }

  public getAnimation(el: HTMLElement, group = '') {
    let groups = group ? [group] : Object.keys(this.animations);
    console.log('getAnimation', groups, this.animations);
    for(let group of groups) {
      let animations = this.animations[group];

      
      let animation = animations.find(a => a.container === el);
      if(animation) return animation.animation;
    }

    return null;
  }
}

const lottieLoader = new LottieLoader();

(window as any).LottieLoader = lottieLoader;

export default lottieLoader;
