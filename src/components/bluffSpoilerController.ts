import {MOUNT_CLASS_TO} from '@config/debug';
import {logger} from '@lib/logger';

import animationIntersector from '@components/animationIntersector';
import {hasSpoilerRendererFailed} from '@components/spoilerRendererConnection';

export default class BluffSpoilerController {
  private static log = logger('bluff-spoiler');

  private static workerSimSupported: boolean;

  private static reconnectIntervalId: number;
  private static allWeakRefs: WeakRef<HTMLElement>[] = [];
  private static reconnectCallbacks = new WeakMap<HTMLElement, (el: HTMLElement) => void>();
  private static RECONNECT_INTERVAL = 250;

  public static isWorkerSimSupported() {
    if(hasSpoilerRendererFailed()) return false;
    return this.workerSimSupported ??= typeof(OffscreenCanvas) !== 'undefined' && !!new OffscreenCanvas(1, 1).getContext('webgl2');
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
}

MOUNT_CLASS_TO['BluffSpoilerController'] = BluffSpoilerController;
