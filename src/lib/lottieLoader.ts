import { isInDOM } from "./utils";

let convert = (value: number) => {
	return Math.round(Math.min(Math.max(value, 0), 1) * 255);
};

type RLottiePlayerListeners = 'enterFrame' | 'ready';

export class RLottiePlayer {
  public static reqId = 0;

  public reqId = 0;
  public curFrame: number;
  public frameCount: number;
  public fps: number;

  public worker: QueryableWorker;
  
  public width: number;
  public height: number;

  public listeners: Partial<{
    [k in RLottiePlayerListeners]: (res: any) => void
  }> = {};
  public listenerResults: Partial<{
    [k in RLottiePlayerListeners]: any
  }> = {};

  public el: HTMLElement;
  public canvas: HTMLCanvasElement;
  public context: CanvasRenderingContext2D;

  public paused = true;
  public direction = 1;
  public speed = 1;
  public autoplay = true;
  public loop = true;

  private frInterval: number;
  private frThen: number;
  private rafId: number;

  private playedTimes = 0;

  constructor({el, width, height, worker}: {
    el: HTMLElement,
    width: number,
    height: number,
    worker: QueryableWorker
  }) {
    this.reqId = ++RLottiePlayer['reqId'];
    this.el = el;
    this.width = width;
    this.height = height;
    this.worker = worker;

    this.canvas = document.createElement('canvas');
    this.canvas.width = this.width;
    this.canvas.height = this.height;
    this.context = this.canvas.getContext('2d');
  }

  public addListener(name: RLottiePlayerListeners, callback: (res?: any) => void) {
    if(this.listenerResults.hasOwnProperty(name)) return Promise.resolve(this.listenerResults[name]);
    this.listeners[name] = callback;
  }

  public setListenerResult(name: RLottiePlayerListeners, value?: any) {
    this.listenerResults[name] = value;
    if(this.listeners[name]) {
      this.listeners[name](value);
    }
  }

  public sendQuery(methodName: string, ...args: any[]) {
    this.worker.sendQuery(methodName, this.reqId, ...args);
  }

  public loadFromData(json: any) {
    this.sendQuery('loadFromData', json, this.width, this.height, {
      paused: this.paused,
      direction: this.direction,
      speed: this.speed
    });
  }

  public play() {
    if(!this.paused) return;

    this.paused = false;
    this.setMainLoop();
  }

  public pause() {
    if(this.paused) return;

    this.paused = true;
    window.cancelAnimationFrame(this.rafId);
  }

  public stop() {
    this.pause();

    this.curFrame = this.direction == 1 ? 0 : this.frameCount;
    this.sendQuery('renderFrame', this.curFrame);
  }

  public restart() {
    this.stop();
    this.play();
  }

  public setSpeed(speed: number) {
    this.speed = speed;

    if(!this.paused) {
      this.setMainLoop();
    }
  }

  public setDirection(direction: number) {
    this.direction = direction;
    
    if(!this.paused) {
      this.setMainLoop();
    }
  }

  public destroy() {
    lottieLoader.onDestroy(this.reqId);
    this.pause();
    this.sendQuery('destroy');
  }

  public renderFrame(frame: Uint8ClampedArray, frameNo: number) {
    try {
      this.context.putImageData(new ImageData(frame, this.width, this.height), 0, 0);
    } catch(err) {
      console.error('RLottiePlayer renderFrame error:', err, frame, this.width, this.height);
      this.autoplay = false;
      this.stop();
    }
    
    this.setListenerResult('enterFrame', frameNo);
  }

  private mainLoop(method: RLottiePlayer['mainLoopForwards'] | RLottiePlayer['mainLoopBackwards']) {
    let r = () => {
      if(this.paused) {
        return;
      }

      const now = Date.now(), delta = now - this.frThen;
      if(delta > this.frInterval) {
        this.frThen = now - (delta % this.frInterval);
        
        const canContinue = method();
        if(!canContinue && !this.loop && this.autoplay) {
          this.autoplay = false;
        }
      }

      this.rafId = window.requestAnimationFrame(r);
    };

    //this.rafId = window.requestAnimationFrame(r);
    r();
  }

  private mainLoopForwards() {
    this.sendQuery('renderFrame', this.curFrame++);
    if(this.curFrame >= this.frameCount) {
      this.playedTimes++;

      if(!this.loop) return false;

      this.curFrame = 0;
    }

    return true;
  };
  
  private mainLoopBackwards() {
    this.sendQuery('renderFrame', this.curFrame--);
    if(this.curFrame < 0) {
      this.playedTimes++;

      if(!this.loop) return false;

      this.curFrame = this.frameCount - 1;
    }

    return true;
  };

  public setMainLoop() {
    window.cancelAnimationFrame(this.rafId);

    this.frInterval = 1000 / this.fps / this.speed;
    this.frThen = Date.now();

    //console.trace('setMainLoop', this.frInterval, this.direction, this);
  
    const method = (this.direction == 1 ? this.mainLoopForwards : this.mainLoopBackwards).bind(this);
    this.mainLoop(method);
  };
}

class QueryableWorker {
  private worker: Worker;
  private listeners: {[name: string]: (...args: any[]) => void} = {};

  constructor(url: string, private defaultListener: (data: any) => void = () => {}, onError?: (error: any) => void) {
    this.worker = new Worker(url);
    if(onError) {
      this.worker.onerror = onError;
    }

    this.worker.onmessage = (event) => {
      if(event.data instanceof Object &&
        event.data.hasOwnProperty('queryMethodListener') &&
        event.data.hasOwnProperty('queryMethodArguments')) {
        this.listeners[event.data.queryMethodListener].apply(this, event.data.queryMethodArguments);
      } else {
        this.defaultListener.call(this, event.data);
      }
    }
  }

  public postMessage(message: any) {
    this.worker.postMessage(message);
  }

  public terminate() {
    this.worker.terminate();
  }

  public addListener(name: string, listener: (...args: any[]) => void) {
    this.listeners[name] = listener;
  }

  public removeListener(name: string) {
    delete this.listeners[name];
  }

  public sendQuery(queryMethod: string, ...args: any[]) {
    this.worker.postMessage({
      'queryMethod': queryMethod,
      'queryMethodArguments': args
    });
  }
}

class LottieLoader {
  public loadPromise: Promise<void>;
  public loaded = false;

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

  private workersLimit = 4;
  private players: {[reqId: number]: RLottiePlayer} = {};
  private byGroups: {[group: string]: RLottiePlayer[]} = {};

  private workers: QueryableWorker[] = [];
  private curWorkerNum = 0;

  private observer: IntersectionObserver;
  private visible: Set<RLottiePlayer> = new Set();

  private debug = true;

  constructor() {
    this.observer = new IntersectionObserver((entries) => {
      for(const entry of entries) {
        const target = entry.target;

        for(const group in this.byGroups) {
          const player = this.byGroups[group].find(p => p.el == target);
          if(player) {
            if(entry.isIntersecting) {
              this.visible.add(player);
              this.checkAnimation(player, false);
            } else {
              this.visible.delete(player);
              this.checkAnimation(player, true);
            }

            break;
          }
        }
      }
    });
  }

  public loadLottieWorkers() {
    if(this.loadPromise) return this.loadPromise;

    const onFrame = this.onFrame.bind(this);
    const onPlayerLoaded = this.onPlayerLoaded.bind(this);

    return this.loadPromise = new Promise((resolve, reject) => {
      let remain = this.workersLimit;
      for(let i = 0; i < this.workersLimit; ++i) {
        const worker = this.workers[i] = new QueryableWorker('rlottie.worker.js');

        worker.addListener('ready', () => {
          console.log('worker #' + i + ' ready');

          worker.addListener('frame', onFrame);
          worker.addListener('loaded', onPlayerLoaded);

          --remain;
          if(!remain) {
            console.log('workers ready');
            resolve();
            this.loaded = true;
          }
        });
      }
    });
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

  public async loadAnimationWorker(params: {
    container: HTMLElement, 
    autoplay?: boolean, 
    animationData: any, 
    loop?: boolean, 
    width?: number,
    height?: number
  }, group = '', toneIndex = -1) {
    params.autoplay = true;

    if(toneIndex >= 1 && toneIndex <= 5) {
      this.applyReplacements(params.animationData, toneIndex);
    }

    if(!this.loaded) {
      await this.loadLottieWorkers();
    }

    const width = params.width || parseInt(params.container.style.width);
    const height = params.height || parseInt(params.container.style.height);

    if(!width || !height) {
      throw new Error('No size for sticker!');
    }

    const player = this.initPlayer(params.container, params.animationData, width, height);
    for(let i in params) {
      // @ts-ignore
      if(player.hasOwnProperty(i)) {
        // @ts-ignore
        player[i] = params[i];
      }
    }

    (this.byGroups[group] ?? (this.byGroups[group] = [])).push(player);

    return player;
  }

  public checkAnimations(blurred?: boolean, group?: string, destroy = false) {
    const groups = group && false ? [group] : Object.keys(this.byGroups);

    if(group && !this.byGroups[group]) {
      console.warn('no animation group:', group);
      this.byGroups[group] = [];
      //return;
    }

    for(const group of groups) {
      const animations = this.byGroups[group];

      animations.forEach(player => {
        this.checkAnimation(player, blurred, destroy);

        //if(!autoplay) continue;
        
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
      });
    }
  }

  public checkAnimation(player: RLottiePlayer, blurred = false, destroy = false) {
    if(destroy || (!isInDOM(player.el) && player.listenerResults.hasOwnProperty('ready'))) {
      //console.log('destroy animation');
      player.destroy();
      return;
    }

    if(blurred) {
      if(!player.paused) {
        this.debug && console.log('pause animation', player);
        player.pause();
      }
    } else if(player.paused && this.visible.has(player) && player.autoplay) {
      this.debug && console.log('play animation', player);
      player.play();
    }
  }

  private onPlayerLoaded(reqId: number, frameCount: number, fps: number) {
    const rlPlayer = this.players[reqId];
    if(!rlPlayer) {
      this.debug && console.warn('onPlayerLoaded on destroyed player:', reqId, frameCount);
      return;
    }

    rlPlayer.el.appendChild(rlPlayer.canvas);
    
    rlPlayer.curFrame = rlPlayer.direction == 1 ? 0 : frameCount - 1;
    rlPlayer.frameCount = frameCount;
    rlPlayer.fps = fps;
    rlPlayer.sendQuery('renderFrame', 0);
    rlPlayer.setListenerResult('ready');

    this.observer.observe(rlPlayer.el);
  }

  private onFrame(reqId: number, frameNo: number, frame: Uint8ClampedArray) {
    const rlPlayer = this.players[reqId];
    if(!rlPlayer) {
      this.debug && console.warn('onFrame on destroyed player:', reqId, frameNo);
      return;
    }

    rlPlayer.renderFrame(frame, frameNo);
  }

  public onDestroy(reqId: number) {
    let player = this.players[reqId];
    for(let group in this.byGroups) {
      this.byGroups[group].findAndSplice(p => p == player);
    }

    delete this.players[player.reqId];
    this.observer.unobserve(player.el);
    this.visible.delete(player);
  }

  public destroyWorkers() {
    this.workers.forEach((worker, idx) => {
      worker.terminate();
      console.log('worker #' + idx + ' terminated');
    });

    console.log('workers destroyed');
    this.workers.length = 0;
  }

  private initPlayer(el: HTMLElement, json: any, width: number, height: number) {
    const rlPlayer = new RLottiePlayer({
      el, 
      width, 
      height,
      worker: this.workers[this.curWorkerNum++]
    });

    this.players[rlPlayer.reqId] = rlPlayer;
    if(this.curWorkerNum >= this.workers.length) {
      this.curWorkerNum = 0;
    }

    rlPlayer.loadFromData(json);

    return rlPlayer;
  }
}

const lottieLoader = new LottieLoader();
(window as any).LottieLoader = lottieLoader;
export default lottieLoader;
