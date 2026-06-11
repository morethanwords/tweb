import {MOUNT_CLASS_TO} from '@config/debug';
import {logger} from '@lib/logger';

import animationIntersector from '@components/animationIntersector';

export default class BluffSpoilerController {
  private static log = logger('bluff-spoiler');

  private static latestMaskURL: string;
  private static maskImageURLs: string[] = [];
  private static maskImagePins = new Map<string, HTMLImageElement>(); // keeps the decoded images cached
  private static appliedMaskURLs = new WeakMap<HTMLElement, string>();
  private static encoderWorker: Worker | false; // false = unsupported, encode on the main thread
  private static encoding = false;
  private static lastDrawTime: number = 0;
  private static DRAW_INTERVAL = 4 * (1000 / 60); // Once in 4 frames (considering 60fps) to avoid performance issues

  private static reconnectIntervalId: number;
  private static allWeakRefs: WeakRef<HTMLElement>[] = [];
  private static reconnectCallbacks = new WeakMap<HTMLElement, (el: HTMLElement) => void>();
  private static RECONNECT_INTERVAL = 250;

  public static instancesCount = 0;

  public static draw(element: HTMLElement, canvas: HTMLCanvasElement) {
    this.encodeMaskFrame(canvas);

    // The mask is a group effect masking the whole subtree, so one inline update on
    // the wrapper is enough — the style invalidation is scoped to this very element
    // (a global rule update would make the browser walk the whole document on every frame)
    const url = this.latestMaskURL;
    if(url && this.appliedMaskURLs.get(element) !== url) {
      this.appliedMaskURLs.set(element, url);
      element.style.setProperty('mask-image', `url(${url})`);
      element.style.setProperty('-webkit-mask-image', `url(${url})`);
      element.classList.add('is-visible');
    }
  }

  private static getEncoderWorker() {
    if(this.encoderWorker !== undefined) return this.encoderWorker;

    if(typeof(OffscreenCanvas) === 'undefined' || typeof(createImageBitmap) !== 'function') {
      return this.encoderWorker = false;
    }

    this.log('Creating encoder worker');

    const worker = new Worker(new URL('./bluffSpoilerMask.worker.ts', import.meta.url), {type: 'module'});
    worker.addEventListener('message', (event: MessageEvent<Blob>) => {
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
      // toBlob still encodes asynchronously off the main thread, unlike toDataURL
      canvas.toBlob((blob) => this.applyNewMask(blob));
    }
  }

  private static applyNewMask(blob: Blob) {
    this.encoding = false;
    if(!blob || !this.instancesCount) return;

    const url = URL.createObjectURL(blob);

    // Publish the URL only once the image is decoded and cached, otherwise the next
    // paint can happen before the blob loads and the mask flickers to transparent
    const image = new Image();
    image.src = url;
    image.decode().then(() => {
      if(!this.instancesCount) {
        URL.revokeObjectURL(url);
        return;
      }

      this.latestMaskURL = url;
      this.maskImageURLs.push(url);
      this.maskImagePins.set(url, image);
      this.pruneMaskURLs();
    }, () => {
      URL.revokeObjectURL(url);
    });
  }

  /**
   * Revokes old mask URLs, except the ones still applied on a connected element
   * (its animation might be paused while others keep producing new masks — revoking
   * its mask would blank it on the next repaint)
   */
  private static pruneMaskURLs() {
    const KEEP_TAIL = 3; // recent masks might still be loading for an in-flight paint
    if(this.maskImageURLs.length <= KEEP_TAIL) return;

    const pinned = new Set<string>();
    for(const weakRef of this.allWeakRefs) {
      const el = weakRef.deref();
      if(el?.isConnected) {
        const applied = this.appliedMaskURLs.get(el);
        if(applied) pinned.add(applied);
      }
    }

    const keepFrom = this.maskImageURLs.length - KEEP_TAIL;
    this.maskImageURLs = this.maskImageURLs.filter((url, i) => {
      if(i >= keepFrom || pinned.has(url)) return true;
      URL.revokeObjectURL(url);
      this.maskImagePins.delete(url);
      return false;
    });
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

    this.maskImageURLs.forEach((url) => URL.revokeObjectURL(url));
    this.maskImageURLs.length = 0;
    this.maskImagePins.clear();

    if(this.encoderWorker) {
      this.encoderWorker.terminate();
      this.encoderWorker = undefined;
    }
    this.encoding = false;

    this.log('Destroying mask resources');
  }
}

MOUNT_CLASS_TO['BluffSpoilerController'] = BluffSpoilerController;
