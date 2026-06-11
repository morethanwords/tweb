import {MOUNT_CLASS_TO} from '@config/debug';
import {logger} from '@lib/logger';

import animationIntersector from '@components/animationIntersector';
import type {BluffSpoilerSimInitMessage} from '@components/bluffSpoilerMask.worker';

export default class BluffSpoilerController {
  private static log = logger('bluff-spoiler');

  private static latestMaskURL: string; // a data: URL — self-contained, no revocation lifecycle
  private static maskProperty = CSS.supports('mask-image', 'none') ? 'mask-image' : '-webkit-mask-image';
  private static appliedMaskURLs = new WeakMap<HTMLElement, string>();
  private static encoderWorker: Worker | false; // false = unsupported, encode on the main thread
  private static encoding = false;
  private static lastDrawTime: number = 0;
  private static DRAW_INTERVAL = 4 * (1000 / 60); // Once in 4 frames (considering 60fps) to avoid performance issues

  private static workerSimSupported: boolean;
  private static workerSimInited = false;
  private static activeElements = new Set<HTMLElement>();

  private static reconnectIntervalId: number;
  private static allWeakRefs: WeakRef<HTMLElement>[] = [];
  private static reconnectCallbacks = new WeakMap<HTMLElement, (el: HTMLElement) => void>();
  private static RECONNECT_INTERVAL = 250;

  public static instancesCount = 0;

  public static draw(element: HTMLElement, canvas: HTMLCanvasElement) {
    this.encodeMaskFrame(canvas);
    this.applyMask(element);
  }

  /**
   * The mask is a group effect masking the whole subtree, so one inline update on
   * the wrapper is enough — the style invalidation is scoped to this very element
   * (a global rule update would make the browser walk the whole document on every frame)
   */
  private static applyMask(element: HTMLElement) {
    const url = this.latestMaskURL;
    if(url && this.appliedMaskURLs.get(element) !== url) {
      this.appliedMaskURLs.set(element, url);
      element.style.setProperty(this.maskProperty, `url(${url})`);
      element.classList.add('is-visible');
    }
  }

  public static isWorkerSimSupported() {
    return this.workerSimSupported ??= typeof(OffscreenCanvas) !== 'undefined' && !!new OffscreenCanvas(1, 1).getContext('webgl2');
  }

  public static setupWorkerSim(options: Omit<BluffSpoilerSimInitMessage, 'type'>) {
    if(this.workerSimInited) return;
    this.workerSimInited = true;

    this.log('Initializing the worker simulation');
    const worker = this.getEncoderWorker();
    if(worker) worker.postMessage({type: 'init', ...options});
  }

  public static activate(element: HTMLElement) {
    this.activeElements.add(element);
    this.applyMask(element);

    const worker = this.getEncoderWorker();
    if(worker) worker.postMessage({type: 'play'});
  }

  public static deactivate(element: HTMLElement) {
    this.activeElements.delete(element);

    if(!this.activeElements.size) {
      const worker = this.getEncoderWorker();
      if(worker) worker.postMessage({type: 'pause'});
    }
  }

  private static getEncoderWorker() {
    if(this.encoderWorker !== undefined) return this.encoderWorker;

    if(typeof(OffscreenCanvas) === 'undefined' || typeof(createImageBitmap) !== 'function') {
      return this.encoderWorker = false;
    }

    this.log('Creating encoder worker');

    const worker = new Worker(new URL('./bluffSpoilerMask.worker.ts', import.meta.url), {type: 'module'});
    worker.addEventListener('message', (event: MessageEvent<string>) => {
      this.applyNewMask(event.data);
    });
    worker.addEventListener('error', (error) => {
      this.log.error('Encoder worker failed, falling back to the main thread', error);
      worker.terminate();
      this.encoderWorker = false;
      this.encoding = false;
    });

    return this.encoderWorker = worker;
  }

  private static encodeMaskFrame(canvas: HTMLCanvasElement) {
    if(this.encoding || this.lastDrawTime + this.DRAW_INTERVAL > performance.now()) return;
    this.lastDrawTime = performance.now();
    this.encoding = true;

    const worker = this.getEncoderWorker();
    if(worker) {
      // createImageBitmap is a GPU-side copy, the readback + PNG encoding happen in the worker
      createImageBitmap(canvas).then((bitmap) => {
        worker.postMessage(bitmap, [bitmap]);
      }, () => {
        this.encoding = false;
      });
    } else {
      this.applyNewMask(canvas.toDataURL()); // legacy fallback, encodes on the main thread
    }
  }

  private static applyNewMask(maskURL: string) {
    this.encoding = false;
    if(!maskURL || !this.instancesCount) return;

    this.latestMaskURL = maskURL;
    this.activeElements.forEach((element) => this.applyMask(element));
  }

  /**
   * Observe if the element is reconnected to the DOM, in case there is still a reference to it
   */
  public static observeReconnection(element: HTMLElement, onReconnect: (el: HTMLElement) => void) {
    const weakRef = new WeakRef(element);
    if(!this.allWeakRefs.find((ref) => ref.deref() === element)) this.allWeakRefs.push(weakRef);

    this.reconnectCallbacks.set(element, onReconnect);

    this.initReconnectionInterval();
  }

  private static initReconnectionInterval() {
    if(this.reconnectIntervalId) return;

    this.log('Initializing reconnection interval');

    this.reconnectIntervalId = window.setInterval(() => {
      // animationIntersector.checkAnimations(undefined, 'BLUFF-SPOILER');

      this.allWeakRefs = this.allWeakRefs.filter((weakRef) => {
        const el = weakRef.deref();
        if(!el) return false;

        const animations = animationIntersector.getAnimations(el);
        const reconnectCallback = this.reconnectCallbacks.get(el);
        if(!animations?.length && el.isConnected) {
          reconnectCallback(el);
          this.log('Reconnected element');
        }

        return true;
      });
      if(!this.allWeakRefs.length) {
        window.clearInterval(this.reconnectIntervalId);
        this.reconnectIntervalId = undefined;

        this.log('Removing reconnection interval');
      }
    }, this.RECONNECT_INTERVAL);
  }

  public static destroy() {
    this.latestMaskURL = undefined;
    this.activeElements.clear();
    this.workerSimInited = false;

    if(this.encoderWorker) {
      this.encoderWorker.terminate();
      this.encoderWorker = undefined;
    }
    this.encoding = false;

    this.log('Destroying mask resources');
  }
}

MOUNT_CLASS_TO['BluffSpoilerController'] = BluffSpoilerController;
