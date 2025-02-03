import {MOUNT_CLASS_TO} from '../config/debug';
import {logger} from '../lib/logger';

import animationIntersector from './animationIntersector';

export default class BluffSpoilerController {
  private static log = logger('bluff-spoiler');

  private static style: HTMLStyleElement;
  private static lastDrawTime: number = 0;
  private static DRAW_INTERVAL = 4 * (1000 / 60); // Once in 4 frames (considering 60fps) to avoid performance issues

  private static reconnectIntervalId: number;
  private static allWeakRefs: WeakRef<HTMLElement>[] = [];
  private static reconnectCallbacks = new WeakMap<HTMLElement, (el: HTMLElement) => void>();
  private static RECONNECT_INTERVAL = 250;

  public static instancesCount = 0;

  private static getStyleSheet() {
    if(this.style) return this.style;

    this.log('Creating style element');

    this.style = document.createElement('style');
    document.head.appendChild(this.style);

    return this.style;
  }

  public static draw(canvas: HTMLCanvasElement) {
    if(this.lastDrawTime + this.DRAW_INTERVAL > performance.now()) return;
    this.lastDrawTime = performance.now();

    const style = this.getStyleSheet();
    const imageURL = canvas.toDataURL();

    style.textContent = `
      .bluff-spoiler {
        mask-image: url(${imageURL});
        opacity: 1;
      }
    `;
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
    this.style?.remove();
    this.style = undefined;

    this.log('Destroying style element');
  }
}

MOUNT_CLASS_TO['BluffSpoilerController'] = BluffSpoilerController;
