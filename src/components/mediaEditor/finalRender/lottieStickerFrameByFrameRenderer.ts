import deferredPromise, {CancellablePromise} from '@helpers/cancellablePromise';
import LottiePlayer from '@lib/lottie/lottiePlayer';
import appDownloadManager from '@lib/appDownloadManager';
import lottieLoader from '@lib/lottie/lottieLoader';
import {Document} from '@layer';

import {StickerFrameByFrameRenderer} from '@components/mediaEditor/finalRender/types';

export default class LottieStickerFrameByFrameRenderer implements StickerFrameByFrameRenderer {
  private frameCount: number = 0;
  private currentDeferredFrame: CancellablePromise<void>;
  private container: HTMLDivElement;
  private animation: LottiePlayer;

  async init(doc: Document.document, size: number) {
    const blob = await appDownloadManager.downloadMedia({
      media: doc
    });
    const container = (this.container = document.createElement('div'));
    container.style.width = size + 'px';
    container.style.height = size + 'px';
    container.style.position = 'absolute';
    container.style.opacity = '0';
    container.style.pointerEvents = 'none';

    document.body.append(container);
    try {
      const animation = (this.animation = await lottieLoader.loadAnimationWorker({
        container: container,
        autoplay: false,
        animationData: blob,
        width: size,
        height: size,
        name: 'doc' + doc.id,
        noOffscreen: true, // getRenderedFrame() reads animation.canvas[0] synchronously
        skipFirstFrameRendering: true // renderFrame() drives every frame; avoid a stale automatic frame 0
      }));

      animation.addEventListener('enterFrame', () => {
        this.currentDeferredFrame?.resolve();
      });

      animation.addEventListener('error', (error) => {
        this.currentDeferredFrame?.reject(error);
      });

      await animation.loadPromise;
      if(animation.hasFailed) {
        throw animation.error;
      }

      this.frameCount = animation.maxFrame + 1;
    } catch(err) {
      this.animation?.remove();
      container.remove();
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
    this.currentDeferredFrame = deferredPromise<void>();
    if(this.animation.hasFailed) {
      this.currentDeferredFrame.reject(this.animation.error);
    } else {
      this.animation.requestFrame(frame);
    }
    await this.currentDeferredFrame;
  }

  getRenderedFrame() {
    return this.animation.canvas[0];
  }

  destroy() {
    this.container?.remove();
    this.animation?.remove();
  }
}
