import deferredPromise, {CancellablePromise} from '../../../helpers/cancellablePromise';
import appDownloadManager from '../../../lib/appManagers/appDownloadManager';
import {Document} from '../../../layer';

import {StickerFrameByFrameRenderer} from './types';

export default class ImageStickerFrameByFrameRenderer implements StickerFrameByFrameRenderer {
  private image: HTMLImageElement;

  async init(doc: Document.document) {
    const blob = await appDownloadManager.downloadMedia({
      media: doc
    });

    const image = (this.image = new Image());
    image.src = URL.createObjectURL(blob);

    const deferred = deferredPromise<void>();

    image.addEventListener('load', () => {
      deferred.resolve();
    });

    await deferred;
  }

  getTotalFrames() {
    return 1;
  }

  getRatio() {
    return this.image.naturalWidth / this.image.naturalHeight;
  }

  async renderFrame() {}

  getRenderedFrame() {
    return this.image;
  }

  destroy() {
    this.image = null;
  }
}
