import deferredPromise, {CancellablePromise} from '../../../helpers/cancellablePromise';
import appDownloadManager from '../../../lib/appManagers/appDownloadManager';
import {Document} from '../../../layer';

import {StickerFrameByFrameRenderer} from './types';
import {FRAMES_PER_SECOND} from './constants';

export default class VideoStickerFrameByFrameRenderer implements StickerFrameByFrameRenderer {
  private duration: number = 0;
  private currentDeferredFrame: CancellablePromise<void>;
  private video: HTMLVideoElement;

  async init(doc: Document.document) {
    const blob = await appDownloadManager.downloadMedia({
      media: doc
    });

    const video = (this.video = document.createElement('video'));
    video.src = URL.createObjectURL(blob);
    video.preload = 'auto';

    const deferred = deferredPromise<void>();

    video.addEventListener('canplaythrough', () => {
      this.duration = video.duration;
      deferred.resolve();
    });

    video.addEventListener('seeked', () => {
      this.currentDeferredFrame?.resolve();
    });

    await deferred;
  }

  getTotalFrames() {
    return Math.floor(this.duration * 60);
  }

  async renderFrame(frame: number) {
    this.currentDeferredFrame = deferredPromise<void>();
    this.video.currentTime = (1 / FRAMES_PER_SECOND) * frame;
    await this.currentDeferredFrame;
  }

  getRatio() {
    return this.video.videoWidth / this.video.videoHeight;
  }

  getRenderedFrame() {
    return this.video;
  }

  destroy() {
    this.video = null;
  }
}
