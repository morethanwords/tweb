import deferredPromise, {CancellablePromise} from '../../../helpers/cancellablePromise';
import RLottiePlayer from '../../../lib/rlottie/rlottiePlayer';
import appDownloadManager from '../../../lib/appManagers/appDownloadManager';
import lottieLoader from '../../../lib/rlottie/lottieLoader';
import {Document} from '../../../layer';

import {StickerFrameByFrameRenderer} from './types';

export default class LottieStickerFrameByFrameRenderer implements StickerFrameByFrameRenderer {
  private frameCount: number = 0;
  private currentDeferredFrame: CancellablePromise<void>;
  private container: HTMLDivElement;
  private animation: RLottiePlayer;

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
    const animation = (this.animation = await lottieLoader.loadAnimationWorker({
      container: container,
      autoplay: false,
      animationData: blob,
      width: size,
      height: size,
      name: 'doc' + doc.id
    }));

    const deferred = deferredPromise<void>();

    animation.addEventListener('ready', () => {
      this.frameCount = animation.maxFrame + 1;
      deferred.resolve();
    });

    animation.addEventListener('enterFrame', () => {
      this.currentDeferredFrame?.resolve();
    });

    await deferred;
  }

  getTotalFrames() {
    return this.frameCount;
  }

  getRatio() {
    return 1 / 1;
  }

  async renderFrame(frame: number) {
    this.currentDeferredFrame = deferredPromise<void>();
    this.animation.requestFrame(frame);
    await this.currentDeferredFrame;
  }

  getRenderedFrame() {
    return this.animation.canvas[0];
  }

  destroy() {
    this.container.remove();
    this.animation.remove();
  }
}
