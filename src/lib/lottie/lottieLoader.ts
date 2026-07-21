import animationIntersector from '@components/animationIntersector';
import {MOUNT_CLASS_TO} from '@config/debug';
import {bindActiveWindowListener, getAppWindow} from '@helpers/appWindow';
import pause from '@helpers/schedulers/pause';
import noop from '@helpers/noop';
import {logger, LogTypes} from '@lib/logger';
import LottiePlayer, {LottieOptions} from '@lib/lottie/lottiePlayer';
import blobConstruct from '@helpers/blob/blobConstruct';
import apiManagerProxy from '@lib/apiManagerProxy';
import IS_WEB_ASSEMBLY_SIMD_SUPPORTED from '@environment/webAssemblySimdSupport';
import makeError from '@helpers/makeError';
import rootScope from '@lib/rootScope';
import toArray from '@helpers/array/toArray';
import lottieMessagePort from '@lib/lottie/lottieMessagePort';
import SHOULD_RENDER_OFFSCREEN from '@lib/lottie/shouldRenderOffscreen';
import tlottieWasmAssetUrl from '@vendor/tlottie/tlottie.wasm?url';

const TLOTTIE_WASM_URL = new URL(tlottieWasmAssetUrl, location.href).href;

export type LottieAssetName =
  | 'EmptyFolder'
  | 'Folders_1'
  | 'Folders_2'
  | 'TwoFactorSetupMonkeyClose'
  | 'TwoFactorSetupMonkeyCloseAndPeek'
  | 'TwoFactorSetupMonkeyCloseAndPeekToIdle'
  | 'TwoFactorSetupMonkeyIdle'
  | 'TwoFactorSetupMonkeyPeek'
  | 'TwoFactorSetupMonkeyTracking'
  | 'voice_outlined2'
  | 'voip_filled'
  | 'voice_mini'
  | 'jolly_roger'
  | 'Gift3'
  | 'Gift6'
  | 'Gift12'
  | 'Folders_Shared'
  | 'UtyanSearch'
  | 'UtyanDiscussion'
  | 'UtyanLinks'
  | 'UtyanStories'
  | 'ReactionGeneric'
  | 'StatsEmoji'
  | 'Congratulations'
  | 'large_lastseen'
  | 'large_readtime'
  | 'StarReaction'
  | 'StarReactionAppear'
  | 'StarReactionSelect'
  | 'StarReactionEffect1'
  | 'StarReactionEffect2'
  | 'StarReactionEffect3'
  | 'UtyanPasscode'
  | 'Diamond'
  | 'UtyanRestricted'
  | 'UtyanBirthday'
  | 'Cake'
  | 'Mailbox'
  | 'LoveLetter'
  | 'key'
  | 'UtyanDisappear'
  | 'hand_stop'
;

export class LottieLoader {
  private loadPromise: Promise<void>;
  private loaded = false;

  private players: {[reqId: number]: LottiePlayer} = {};
  private playersByCacheName: {[cacheName: string]: Set<LottiePlayer>} = {};

  private log = logger('LOTTIE', LogTypes.Error);

  constructor() {
    rootScope.addEventListener('theme_changed', () => {
      for(const reqId in this.players) {
        this.players[reqId].applyColorForAllContexts();
      }
    });

    lottieMessagePort.addEventListener('freeRunStopped', ({reqId, curFrame, error}) => {
      this.players[reqId]?.onFreeRunStopped(curFrame, error);
    });

    lottieMessagePort.addEventListener('freeRunEnded', ({reqId, curFrame}) => {
      this.players[reqId]?.onFreeRunEnded(curFrame);
    });
  }

  public getAnimation(element: HTMLElement) {
    for(const i in this.players) {
      if(this.players[i].el.includes(element)) {
        return this.players[i];
      }
    }

    return null;
  }

  public nudgeOffscreenPlayers() {
    for(const reqId in this.players) {
      this.players[reqId].nudgePresent();
    }
  }

  // a transferred placeholder canvas loses its displayed frame on a DOM move
  // (detach+reattach) - re-present every offscreen player inside the moved root
  public nudgePresentWithin(root: HTMLElement) {
    for(const reqId in this.players) {
      const player = this.players[reqId];
      if(player.el?.some((el) => el && root.contains(el))) {
        player.nudgePresent();
      }
    }
  }

  public loadLottieWorkers() {
    if(!IS_WEB_ASSEMBLY_SIMD_SUPPORTED) {
      // This method is also used as a fire-and-forget preload. Unsupported
      // browsers should stay on their static fallback without an unhandled
      // rejection; actual animation loads still reject with NO_WASM below.
      return Promise.resolve();
    }

    if(this.loadPromise) {
      return this.loadPromise;
    }

    return this.loadPromise = this.registerLottieWorkers();
  }

  private async registerLottieWorkers() {
    await apiManagerProxy.registerThreadedWorker({
      type: 'lottie',
      createWorker: () => {
        return new Worker(
          new URL('./tlottie.worker.ts', import.meta.url),
          {type: 'module'}
        );
      },
      superMessagePort: lottieMessagePort
    });

    if(SHOULD_RENDER_OFFSCREEN) {
      // hidden-tab belt: SharedWorker timers are NOT tab-throttled - fully pause free-run clocks while
      // hidden. Follow the active window: while popped out into a Document PiP window the PiP stays
      // visible, so the players must keep running even though the tab we left is hidden.
      bindActiveWindowListener((w) => w.document, 'visibilitychange', () => {
        lottieMessagePort.suspendAllTabPlayers(getAppWindow().document.hidden);
      });
    }
  }

  public makeAssetUrl(name: LottieAssetName) {
    return 'assets/tgs/' + name + '.json';
  }

  public loadAnimationAsAsset(params: Omit<LottieOptions, 'animationData' | 'name'>, name: LottieAssetName) {
    // (params as LottieOptions).name = name;
    return this.loadAnimationFromURL(params, this.makeAssetUrl(name));
  }

  public loadAnimationDataFromURL(url: string, method: 'json'): Promise<any>;
  public loadAnimationDataFromURL(url: string, method?: 'blob'): Promise<Blob>;
  public loadAnimationDataFromURL(url: string, method: 'json' | 'blob' = 'blob'): Promise<Blob | any> {
    if(!IS_WEB_ASSEMBLY_SIMD_SUPPORTED) {
      return Promise.reject(makeError('NO_WASM'));
    }

    this.loadLottieWorkers().catch(noop);

    return fetch(url)
    .then((res) => {
      if(!res.headers || res.headers.get('content-type') === 'application/octet-stream') {
        return res.arrayBuffer()
        .then((data) => apiManagerProxy.invokeCrypto('gzipUncompress', data))
        .then((arr) => blobConstruct(arr as Uint8Array, ''));
      } else {
        return res[method]();
      }
    });
    /* .then((str) => {
      return new Promise<string>((resolve) => setTimeout(() => resolve(str), 2e3));
    }) */
  }

  public loadAnimationFromURLManually(name: LottieAssetName) {
    const url = this.makeAssetUrl(name);
    return this.loadAnimationDataFromURL(url).then((blob) => {
      return (params: Omit<LottieOptions, 'animationData'>) => this.loadAnimationFromURLNext(blob, params, url);
    });
  }

  public loadAnimationFromURL(params: Omit<LottieOptions, 'animationData'>, url: string) {
    return this.loadAnimationDataFromURL(url).then((blob) => {
      return this.loadAnimationFromURLNext(blob, params, url);
    });
  }

  public loadAnimationFromURLNext(blob: Blob, params: Omit<LottieOptions, 'animationData'>, url: string) {
    const newParams = Object.assign(params, {animationData: blob, needUpscale: true});
    newParams.name ||= url;
    return this.loadAnimationWorker(newParams);
  }

  public waitForFirstFrame(player: LottiePlayer) {
    if(player.hasFailed) {
      return Promise.reject(player.error);
    }

    const firstFrameOrError = Promise.race([
      new Promise<void>((resolve) => {
        player.addEventListener('firstFrame', resolve, {once: true});
      }),
      new Promise<void>((resolve, reject) => {
        player.addEventListener('error', reject, {once: true});
      }),
      pause(2500)
    ]);

    return Promise.all([player.loadPromise, firstFrameOrError]).then(() => player);
  }

  public async loadAnimationWorker(params: LottieOptions): Promise<LottiePlayer> {
    if(!IS_WEB_ASSEMBLY_SIMD_SUPPORTED) {
      throw makeError('NO_WASM');
    }

    if(!this.loaded) {
      await this.loadLottieWorkers();
    }

    const {middleware, group = ''} = params;
    if(middleware && !middleware()) {
      throw makeError('MIDDLEWARE');
    }

    if(params.sync) {
      const cacheName = LottiePlayer.CACHE.generateName(
        params.name,
        params.width,
        params.height,
        params.color,
        params.toneIndex
      );
      const players = this.playersByCacheName[cacheName];
      if(players?.size) {
        for(const player of players) {
          // a compositorDelivery request must match an 'emoji' player exactly, and a legacy sync
          // consumer must never adopt an offscreen 'canvas' player (its renderFrame2 never feeds
          // overrideRender - the consumer would stay permanently blank)
          if(params.compositorDelivery ? player.offscreen === 'emoji' : !player.offscreen) {
            return Promise.resolve(player);
          }
        }
        // delivery-mismatched players only - fall through and create a matching one
      }
    }

    const containers = toArray(params.container);
    if(!params.width || !params.height) {
      params.width = parseInt(containers[0].style.width);
      params.height = parseInt(containers[0].style.height);
    }

    if(!params.width || !params.height) {
      throw new Error('No size for sticker!');
    }

    params.group = group;

    const player = this.initPlayer(containers, params);

    animationIntersector.addAnimation({
      animation: player,
      group,
      observeElement: player.el[0],
      controlled: middleware,
      liteModeKey: params.liteModeKey,
      type: 'lottie'
    });

    if(!params.sync) {
      // * have to use onClean here, SuperStickerRenderer relies on it
      middleware?.onClean(() => {
        player.remove();
      });
    }

    return player;
  }

  // private onPlayerError = (reqId: number, error: Error) => {
  //   const player = this.players[reqId];
  //   if(!player) {
  //     return;
  //   }

  //   // ! will need refactoring later, this is not the best way to remove the animation
  //   const animations = animationIntersector.getAnimations(player.el[0]);
  //   animations.forEach((animation) => {
  //     animationIntersector.removeAnimation(animation);
  //   });
  // };

  public onDestroy(reqId: number) {
    delete this.players[reqId];
  }

  public destroyWorkers() {
    if(!IS_WEB_ASSEMBLY_SIMD_SUPPORTED) {
      return;
    }

    lottieMessagePort.terminateAll();

    this.log('workers destroyed');
    this.loaded = false;
    this.loadPromise = undefined;
  }

  private initPlayer(el: LottiePlayer['el'], options: LottieOptions) {
    const player = new LottiePlayer({
      el,
      options
    });

    let {reqId} = player;
    const {cacheName} = player;
    this.players[reqId] = player;

    const playersByCacheName = cacheName ? this.playersByCacheName[cacheName] ??= new Set() : undefined;
    if(cacheName) {
      playersByCacheName.add(player);
    }

    // an offscreen-load failure downgrades to legacy and mints a fresh reqId (lottiePlayer.loadFromData
    // fallback); re-key so freeRunStopped/freeRunEnded for the new id still reach this player
    player.addEventListener('reqIdChanged', ({previousReqId, reqId: newReqId}) => {
      delete this.players[previousReqId];
      this.players[newReqId] = player;
      reqId = newReqId;
    });

    player.addEventListener('destroy', () => {
      this.onDestroy(reqId);
      if(playersByCacheName.delete(player) && !playersByCacheName.size) {
        delete this.playersByCacheName[cacheName];
      }
    });

    player.addEventListener('error', (err) => {
      this.log.error('animation failed', err);
      animationIntersector.removeAnimationByPlayer(player);
      player.remove();
    });

    const loadPromise = player.loadFromData(options.animationData, TLOTTIE_WASM_URL);
    player.loadPromise = loadPromise;
    loadPromise.catch((err: unknown) => player.fail(err));

    return player;
  }
}

const lottieLoader = new LottieLoader();
MOUNT_CLASS_TO.lottieLoader = lottieLoader;
export default lottieLoader;
