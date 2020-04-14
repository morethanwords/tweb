import { isElementInViewport, isInDOM } from "./utils";
import LottiePlayer, { AnimationConfigWithPath, AnimationConfigWithData, AnimationItem } from "lottie-web/build/player/lottie.d";

class LottieLoader {
  private lottie: /* any */ typeof LottiePlayer = null;
  private animations: {
    [group: string]: {
      animation: /* any */AnimationItem, 
      container: HTMLDivElement, 
      paused: boolean,
      autoplay: boolean,
      canvas: boolean
    }[]
  } = {};
  private debug = false;
  public loaded: Promise<void>;
  private lastTimeLoad = 0;
  private waitingTimeouts = 0;

  public loadLottie() {
    if(this.loaded) return this.loaded;

    this.loaded = new Promise((resolve, reject) => {
      (window as any).lottieLoaded = () => {
        console.log('lottie loaded');
        this.lottie = (window as any).lottie;
        resolve();
      };
    
      let sc = document.createElement('script');
      sc.src = 'npm.lottie-web.chunk.js';
      sc.async = true;
      sc.onload = (window as any).lottieLoaded;
    
      document.body.appendChild(sc);
    });
  }

  public checkAnimations(blurred?: boolean, group?: string, destroy = false) {
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
        let {animation, container, paused, autoplay, canvas} = animations[i];

        if(destroy && !isInDOM(container)) {
          this.debug && console.log('destroy animation');
          animation.destroy();
          animations.splice(i, 1);
          continue;
        }

        if(canvas) {
          let c = container.firstElementChild as HTMLCanvasElement;
          if(!c.height && !c.width && isElementInViewport(container)) {
            //console.log('lottie need resize');
            animation.resize();
          }
        }
  
        if(!autoplay) continue;
        
        if(blurred || !isElementInViewport(container)) {
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
    //params.autoplay = false;
    params.renderer = 'canvas';
    params.rendererSettings = {
      //context: context, // the canvas context
      //preserveAspectRatio: 'xMinYMin slice', // Supports the same options as the svg element's preserveAspectRatio property
      clearCanvas: true,
      progressiveLoad: true, // Boolean, only svg renderer, loads dom elements when needed. Might speed up initialization for large number of elements.
      hideOnTransparent: true, //Boolean, only svg renderer, hides elements when opacity reaches 0 (defaults to true)
    };

    if(!this.lottie) {
      if(!this.loaded) this.loadLottie();
      await this.loaded;

      this.lottie.setQuality('low');
      //this.lottie.setQuality(10);
    }

    let time = Date.now();
    let diff = time - this.lastTimeLoad;
    let delay = 150;
    if(diff < delay) {
      delay *= ++this.waitingTimeouts;
      console.log('lottieloader delay:', delay);
      //await new Promise((resolve) => setTimeout(resolve, delay));
      this.waitingTimeouts--;
    }

    let animation = this.lottie.loadAnimation(params);

    this.lastTimeLoad = Date.now();

    if(!this.animations[group]) this.animations[group] = [];
    this.animations[group].push({
      animation, 
      container: params.container as HTMLDivElement, 
      paused: !params.autoplay,
      autoplay: params.autoplay,
      canvas: params.renderer == 'canvas'
    });

    if(params.autoplay) {
      this.checkAnimations();
    }

    return animation;
  }

  public getAnimation(el: HTMLElement, group = '') {
    let groups = group ? [group] : Object.keys(this.animations);
    //console.log('getAnimation', groups, this.animations);
    for(let group of groups) {
      let animations = this.animations[group];

      
      let animation = animations.find(a => a.container === el);
      if(animation) return animation.animation;
    }

    return null;
  }
}

const lottieLoader = new LottieLoader();

//(window as any).LottieLoader = lottieLoader;

export default lottieLoader;
