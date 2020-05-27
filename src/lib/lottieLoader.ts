//import { isInDOM } from "./utils";
import LottiePlayer, { AnimationConfigWithPath, AnimationConfigWithData, AnimationItem } from "lottie-web/build/player/lottie.d";

let convert = (value: number) => {
	return Math.round(Math.min(Math.max(value, 0), 1) * 255);
};

class LottieLoader {
  public lottie: /* any */ typeof LottiePlayer = null;
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
  private static COLORREPLACEMENTS = [
    [
      [0xf77e41, 0xca907a],
			[0xffb139, 0xedc5a5],
			[0xffd140, 0xf7e3c3],
			[0xffdf79, 0xfbefd6],
    ],

    [
      [0xf77e41, 0xaa7c60],
			[0xffb139, 0xc8a987],
			[0xffd140, 0xddc89f],
			[0xffdf79, 0xe6d6b2],
    ],

    [
      [0xf77e41, 0x8c6148],
			[0xffb139, 0xad8562],
			[0xffd140, 0xc49e76],
			[0xffdf79, 0xd4b188],
    ],

    [
      [0xf77e41, 0x6e3c2c],
			[0xffb139, 0x925a34],
			[0xffd140, 0xa16e46],
			[0xffdf79, 0xac7a52],
    ]
  ]; 

  public loadLottie() {
    if(this.loaded) return this.loaded;

    return this.loaded = new Promise((resolve, reject) => {
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

        if(destroy && !container.parentElement/* !isInDOM(container) */) {
          this.debug && console.log('destroy animation');
          animation.destroy();
          animations.splice(i, 1);
          continue;
        }

        /* if(canvas) {
          let c = container.firstElementChild as HTMLCanvasElement;
          if(!c) {
            console.warn('no canvas element for check!', container, animations[i]);
            continue;
          }
          
          if(!c.height && !c.width && isElementInViewport(container)) {
            //console.log('lottie need resize');
            animation.resize();
          }
        } */
  
        if(!autoplay) continue;
        
        /* if(blurred || !isElementInViewport(container)) {
          if(!paused) {
            this.debug && console.log('pause animation', isElementInViewport(container), container);
            animation.pause();
            animations[i].paused = true;
          }
        } else if(paused) {
          this.debug && console.log('play animation', container);
          animation.play();
          animations[i].paused = false;
        } */
      }
    }
  }

  private applyReplacements(object: any, toneIndex: number) {
    const replacements = LottieLoader.COLORREPLACEMENTS[toneIndex - 2];

    const iterateIt = (it: any) => {
      for(let smth of it) {
        switch(smth.ty) {
          case 'st':
          case 'fl':
            let k = smth.c.k;
            let color = convert(k[2]) | (convert(k[1]) << 8) | (convert(k[0]) << 16);

            let foundReplacement = replacements.find(p => p[0] == color);
            if(foundReplacement) {
              k[0] = ((foundReplacement[1] >> 16) & 255) / 255;
              k[1] = ((foundReplacement[1] >> 8) & 255) / 255;
              k[2] = (foundReplacement[1] & 255) / 255;
            }

            //console.log('foundReplacement!', foundReplacement, color.toString(16), k);
            break;
        }

        if(smth.hasOwnProperty('it')) {
          iterateIt(smth.it);
        }
      }
    };

    for(let layer of object.layers) {
      if(!layer.shapes) continue;

      for(let shape of layer.shapes) {
        iterateIt(shape.it);
      }
    }
  }

  public async loadAnimation(params: /* any */AnimationConfigWithPath & AnimationConfigWithData, group = '', toneIndex = -1) {
    //params.autoplay = false;
    //if(group != 'auth') {
      //params.renderer = 'canvas';
      params.renderer = 'svg';
    //}

    if(toneIndex >= 1 && toneIndex <= 5) {
      this.applyReplacements(params.animationData, toneIndex);
    }
    
    let rendererSettings = {
      //context: context, // the canvas context
      //preserveAspectRatio: 'xMinYMin slice', // Supports the same options as the svg element's preserveAspectRatio property
      clearCanvas: true,
      progressiveLoad: true, // Boolean, only svg renderer, loads dom elements when needed. Might speed up initialization for large number of elements.
      hideOnTransparent: true, //Boolean, only svg renderer, hides elements when opacity reaches 0 (defaults to true),
    };

    if(params.rendererSettings) {
      params.rendererSettings = Object.assign(params.rendererSettings, rendererSettings);
    } else {
      params.rendererSettings = rendererSettings;
    }

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
      canvas: false//params.renderer == 'canvas'
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
(window as any).LottieLoader = lottieLoader;
export default lottieLoader;
