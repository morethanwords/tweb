/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import RLottieWorker from 'worker-loader!./rlottie.worker';
import animationIntersector from "../../components/animationIntersector";
import { MOUNT_CLASS_TO } from '../../config/debug';
import { pause } from '../../helpers/schedulers/pause';
import { logger, LogTypes } from "../logger";
import apiManager from "../mtproto/mtprotoworker";
import RLottiePlayer, { RLottieOptions } from './rlottiePlayer';
import QueryableWorker from './queryableWorker';
import blobConstruct from '../../helpers/blob/blobConstruct';

export type LottieAssetName = 'EmptyFolder' | 'Folders_1' | 'Folders_2' | 
  'TwoFactorSetupMonkeyClose' | 'TwoFactorSetupMonkeyCloseAndPeek' | 
  'TwoFactorSetupMonkeyCloseAndPeekToIdle' | 'TwoFactorSetupMonkeyIdle' | 
  'TwoFactorSetupMonkeyPeek' | 'TwoFactorSetupMonkeyTracking' | 
  'voice_outlined2' | 'voip_filled' | 'voice_mini';

export class LottieLoader {
  private isWebAssemblySupported = typeof(WebAssembly) !== 'undefined';
  private loadPromise: Promise<void> = !this.isWebAssemblySupported ? Promise.reject() : undefined;
  private loaded = false;

  private workersLimit = 4;
  private players: {[reqId: number]: RLottiePlayer} = {};

  private workers: QueryableWorker[] = [];
  private curWorkerNum = 0;

  private log = logger('LOTTIE', LogTypes.Error);

  public getAnimation(element: HTMLElement) {
    for(const i in this.players) {
      if(this.players[i].el === element) {
        return this.players[i];
      }
    }

    return null;
  }

  public setLoop(loop: boolean) {
    for(const i in this.players) {
      const player = this.players[i];
      player.loop = loop;
      player.autoplay = player._autoplay;
    }
  }

  public loadLottieWorkers() {
    if(this.loadPromise) {
      return this.loadPromise;
    }

    return this.loadPromise = new Promise((resolve, reject) => {
      let remain = this.workersLimit;
      for(let i = 0; i < this.workersLimit; ++i) {
        const worker = this.workers[i] = new QueryableWorker(new RLottieWorker());

        worker.addEventListener('ready', () => {
          this.log('worker #' + i + ' ready');

          worker.addEventListener('frame', this.onFrame);
          worker.addEventListener('loaded', this.onPlayerLoaded);
          worker.addEventListener('error', this.onPlayerError);

          --remain;
          if(!remain) {
            this.log('workers ready');
            resolve();
            this.loaded = true;
          }
        }, {once: true});

        worker.addEventListener('workerError', (error) => {
          reject('rlottie load error: ' + error.message);
          this.loaded = false;
        }, {once: true});
      }
    });
  }

  public loadAnimationAsAsset(params: Omit<RLottieOptions, 'animationData' | 'name'>, name: LottieAssetName) {
    (params as RLottieOptions).name = name;
    return this.loadAnimationFromURL(params, 'assets/tgs/' + name + '.json');
  }

  public loadAnimationFromURL(params: Omit<RLottieOptions, 'animationData'>, url: string): Promise<RLottiePlayer> {
    if(!this.isWebAssemblySupported) {
      return this.loadPromise as any;
    }
    
    if(!this.loaded) {
      this.loadLottieWorkers();
    }

    return fetch(url)
    .then(res => {
      if(!res.headers || res.headers.get('content-type') === 'application/octet-stream') {
        return res.arrayBuffer().then(data => apiManager.invokeCrypto('gzipUncompress', data)).then(arr => blobConstruct([arr], ''))
      } else {
        return res.blob();
      }
    })
    /* .then(str => {
      return new Promise<string>((resolve) => setTimeout(() => resolve(str), 2e3));
    }) */
    .then(blob => {
      const newParams = Object.assign(params, {animationData: blob, needUpscale: true});
      if(!newParams.name) newParams.name = url;
      return this.loadAnimationWorker(newParams);
    });
  }

  public waitForFirstFrame(player: RLottiePlayer) {
    return Promise.race([
      /* new Promise<void>((resolve) => {
        player.addEventListener('firstFrame', () => {
          setTimeout(() => resolve(), 1500);
        }, true);
      }) */
      new Promise<void>((resolve) => {
        player.addEventListener('firstFrame', resolve, {once: true});
      }),
      pause(2500)
    ]).then(() => player);
  }

  public async loadAnimationWorker(params: RLottieOptions, group = params.group || '', middleware?: () => boolean): Promise<RLottiePlayer> {
    if(!this.isWebAssemblySupported) {
      return this.loadPromise as any;
    }
    //params.autoplay = true;

    if(!this.loaded) {
      await this.loadLottieWorkers();
    }

    if(middleware && !middleware()) {
      throw new Error('middleware');
    }

    if(!params.width || !params.height) {
      params.width = parseInt(params.container.style.width);
      params.height = parseInt(params.container.style.height);
    }

    if(!params.width || !params.height) {
      throw new Error('No size for sticker!');
    }

    params.group = group;

    const player = this.initPlayer(params.container, params);

    if(group !== 'none') {
      animationIntersector.addAnimation(player, group);
    }

    return player;
  }

  private onPlayerLoaded = (reqId: number, frameCount: number, fps: number) => {
    const rlPlayer = this.players[reqId];
    if(!rlPlayer) {
      this.log.warn('onPlayerLoaded on destroyed player:', reqId, frameCount);
      return;
    }

    this.log.debug('onPlayerLoaded');
    rlPlayer.onLoad(frameCount, fps);
    //rlPlayer.addListener('firstFrame', () => {
      //animationIntersector.addAnimation(player, group);
    //}, true);
  };

  private onFrame = (reqId: number, frameNo: number, frame: Uint8ClampedArray) => {
    const rlPlayer = this.players[reqId];
    if(!rlPlayer) {
      this.log.warn('onFrame on destroyed player:', reqId, frameNo);
      return;
    }

    if(rlPlayer.clamped !== undefined) {
      rlPlayer.clamped = frame;
    }
    
    rlPlayer.renderFrame(frame, frameNo);
  };

  private onPlayerError = (reqId: number, error: Error) => {
    const rlPlayer = this.players[reqId];
    if(rlPlayer) {
      // ! will need refactoring later, this is not the best way to remove the animation
      const animations = animationIntersector.getAnimations(rlPlayer.el);
      animations.forEach(animation => {
        animationIntersector.checkAnimation(animation, true, true);
      });
    }
  };

  public onDestroy(reqId: number) {
    delete this.players[reqId];
  }

  public destroyWorkers() {
    this.workers.forEach((worker, idx) => {
      worker.terminate();
      this.log('worker #' + idx + ' terminated');
    });

    this.log('workers destroyed');
    this.workers.length = 0;
  }

  private initPlayer(el: HTMLElement, options: RLottieOptions) {
    const rlPlayer = new RLottiePlayer({
      el, 
      worker: this.workers[this.curWorkerNum++],
      options
    });

    this.players[rlPlayer.reqId] = rlPlayer;
    if(this.curWorkerNum >= this.workers.length) {
      this.curWorkerNum = 0;
    }

    rlPlayer.loadFromData(options.animationData);

    return rlPlayer;
  }
}

const lottieLoader = new LottieLoader();
MOUNT_CLASS_TO.lottieLoader = lottieLoader;
export default lottieLoader;
