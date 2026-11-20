import deferredPromise, {CancellablePromise} from '@helpers/cancellablePromise';
import noop from '@helpers/noop';
import LottiePlayer from '@lib/lottie/lottiePlayer';
import lottieLoader from '@lib/lottie/lottieLoader';
import {getAccountSession, isSessionLeaving, type AccountSession} from '@lib/accounts/getCurrentAccount';
import {getMiddleware} from '@helpers/middleware';
import {checkDocumentRendererSource, downloadDocumentRendererBlob, type DocumentRendererSource} from '@components/mediaEditor/finalRender/documentRendererSource';
import {Document} from '@layer';

import {StickerFrameByFrameRenderer} from '@components/mediaEditor/finalRender/types';

export default class LottieStickerFrameByFrameRenderer implements StickerFrameByFrameRenderer {
  private frameCount: number = 0;
  private currentDeferredFrame: CancellablePromise<void>;
  private container: HTMLDivElement;
  private animation: LottiePlayer;
  private destroyed = false;
  private started = false;
  private disposed = deferredPromise<never>();
  private disposedError = new Error('Lottie renderer disposed');
  private session: AccountSession;
  private middleware = getMiddleware();

  constructor(private source?: DocumentRendererSource) {}

  private isSourceAlive() {
    return !this.destroyed && (!this.session || !isSessionLeaving(this.session)) && (!this.source || this.source.isAlive());
  }

  private checkAlive() {
    if(!this.isSourceAlive()) this.destroy();
    if(this.destroyed) throw this.disposedError;
  }

  private async wait<T>(promise: Promise<T>) {
    this.checkAlive();
    const value = await Promise.race([promise, this.disposed]);
    this.checkAlive();
    return value;
  }

  async init(doc: Document.document, size: number) {
    this.checkAlive();
    if(this.started) throw new Error('Lottie renderer already initialized');
    this.started = true;
    this.session = this.source ? undefined : getAccountSession();
    try {
      this.checkAlive();
      const blob = await this.wait(downloadDocumentRendererBlob(doc, this.source));
      checkDocumentRendererSource(this.source);
      this.checkAlive();
      const container = (this.container = document.createElement('div'));
      container.style.width = size + 'px';
      container.style.height = size + 'px';
      container.style.position = 'absolute';
      container.style.opacity = '0';
      container.style.pointerEvents = 'none';

      document.body.append(container);
      const animation = await this.wait(lottieLoader.loadAnimationWorker({
        container: container,
        autoplay: false,
        animationData: blob,
        middleware: this.middleware.get(() => this.isSourceAlive()),
        width: size,
        height: size,
        name: 'doc' + doc.id,
        noOffscreen: true, // getRenderedFrame() reads animation.canvas[0] synchronously
        skipFirstFrameRendering: true // renderFrame() drives every frame; avoid a stale automatic frame 0
      }).then(animation => {
        // The loader can finish after wait() was cancelled. Adopt its resources
        // here, not after the race, so the late player still has an owner.
        animation.loadPromise.catch(noop);
        this.animation = animation;
        if(!this.isSourceAlive()) {
          if(this.destroyed) this.releaseResources();
          else this.destroy();
          throw this.disposedError;
        }
        return animation;
      }));
      this.checkAlive();

      animation.addEventListener('enterFrame', () => {
        if(!this.destroyed) this.currentDeferredFrame?.resolve();
      });

      animation.addEventListener('error', (error) => {
        this.currentDeferredFrame?.reject(error);
      });

      await this.wait(animation.loadPromise);
      checkDocumentRendererSource(this.source);
      this.checkAlive();
      if(animation.hasFailed) {
        throw animation.error;
      }

      this.frameCount = animation.maxFrame + 1;
    } catch(err) {
      // Cleanup reports its own failure, but never replaces the load error.
      try { this.destroy(); } catch{}
      throw err;
    }
  }

  getTotalFrames() {
    return this.frameCount;
  }

  getRatio() {
    return 1 / 1;
  }

  async renderFrame(frame: number) {
    this.checkAlive();
    const pending = (this.currentDeferredFrame = deferredPromise<void>());
    try {
      if(this.animation.hasFailed) throw this.animation.error;
      this.animation.requestFrame(frame);
      await pending;
      this.checkAlive();
    } finally {
      if(this.currentDeferredFrame === pending) this.currentDeferredFrame = undefined;
    }
  }

  getRenderedFrame() {
    this.checkAlive();
    return this.animation.canvas[0];
  }

  destroy() {
    if(this.destroyed) return;
    this.destroyed = true;
    // Consume the disposal signal even if init() has never started.
    this.disposed.catch(noop);
    this.disposed.reject(this.disposedError);
    this.currentDeferredFrame?.reject(this.disposedError);
    try {
      this.middleware.destroy();
    } catch(error) {
      console.error('Failed to clean up media editor Lottie renderer', error);
      throw error;
    } finally {
      this.releaseResources();
    }
  }

  private releaseResources() {
    const animation = this.animation;
    const container = this.container;
    this.animation = undefined;
    this.container = undefined;
    try {
      if(animation && !animation.destroyed) animation.remove();
    } catch(error) {
      console.error('Failed to clean up media editor Lottie renderer', error);
      throw error;
    } finally {
      container?.remove();
    }
  }
}
