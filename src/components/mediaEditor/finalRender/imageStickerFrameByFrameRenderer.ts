import deferredPromise from '@helpers/cancellablePromise';
import {ObjectURLScope} from '@helpers/objectUrl';
import appDownloadManager from '@lib/appDownloadManager';
import {Document} from '@layer';

import {StickerFrameByFrameRenderer} from '@components/mediaEditor/finalRender/types';

export default class ImageStickerFrameByFrameRenderer implements StickerFrameByFrameRenderer {
  private image: HTMLImageElement;
  private objectURLs = new ObjectURLScope();
  private destroyed = false;

  async init(doc: Document.document) {
    const blob = await appDownloadManager.downloadMedia({
      media: doc
    });
    if(this.destroyed) return;

    const image = (this.image = new Image());
    image.src = this.objectURLs.create(blob);

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
    this.destroyed = true;
    this.objectURLs.dispose();
    this.image = null;
  }
}
