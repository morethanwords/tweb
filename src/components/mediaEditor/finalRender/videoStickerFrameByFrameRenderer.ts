import deferredPromise, {CancellablePromise} from '@helpers/cancellablePromise';
import {getMiddleware} from '@helpers/middleware';
import {Document} from '@layer';
import createVideo from '@helpers/dom/createVideo';
import onMediaLoad from '@helpers/onMediaLoad';
import {ObjectURLScope} from '@helpers/objectUrl';
import handleVideoLeak from '@helpers/dom/handleVideoLeak';
import {IS_FIREFOX} from '@environment/userAgent';

import {delay} from '@components/mediaEditor/utils';

import {StickerFrameByFrameRenderer} from '@components/mediaEditor/finalRender/types';
import {FRAMES_PER_SECOND} from '@components/mediaEditor/finalRender/constants';
import {checkDocumentRendererSource, downloadDocumentRendererBlob, type DocumentRendererSource} from '@components/mediaEditor/finalRender/documentRendererSource';

export default class VideoStickerFrameByFrameRenderer implements StickerFrameByFrameRenderer {
  private duration: number = 0;
  private currentDeferredFrame: CancellablePromise<void>;
  private video: HTMLVideoElement;

  private middleware = getMiddleware();
  private objectURLs = new ObjectURLScope();
  private destroyed = false;

  constructor(private preparedBlob?: Blob, private source?: DocumentRendererSource) {}

  private checkSource() {
    checkDocumentRendererSource(this.source, () => this.destroy());
  }

  async init(doc: Document.document) {
    if(this.destroyed) throw new Error('Video renderer disposed');
    this.checkSource();
    const blob = this.preparedBlob ?? await downloadDocumentRendererBlob(doc, this.source);
    this.checkSource();
    if(this.destroyed) throw new Error('Video renderer disposed');

    const video = (this.video = createVideo({middleware: this.middleware.get()}));
    video.src = this.objectURLs.create(blob);
    // video.autoplay = true;
    video.controls = false;
    video.muted = true;
    // video.loop = true;
    video.preload = 'auto';

    const promise = onMediaLoad(video as HTMLMediaElement);
    await handleVideoLeak(video, promise);
    this.checkSource();
    if(this.destroyed) throw new Error('Video renderer disposed');
    await delay(100); // Necessary
    this.checkSource();
    if(this.destroyed) throw new Error('Video renderer disposed');
    this.duration = video.duration;

    video.addEventListener('seeked', () => {
      this.currentDeferredFrame?.resolve();
    });
  }

  getTotalFrames() {
    return IS_FIREFOX ? 1 : Math.floor(this.duration * FRAMES_PER_SECOND);
  }

  async renderFrame(frame: number) {
    this.checkSource();
    if(IS_FIREFOX) return;
    if(this.destroyed) throw new Error('Video renderer disposed');
    const time = (1 / FRAMES_PER_SECOND) * frame;
    if(this.video.currentTime === time && this.video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) return;
    this.currentDeferredFrame = deferredPromise<void>();
    this.video.currentTime = time;
    await this.currentDeferredFrame;
    this.checkSource();
  }

  getRatio() {
    this.checkSource();
    return this.video.videoWidth / this.video.videoHeight;
  }

  getRenderedFrame() {
    this.checkSource();
    return this.video;
  }

  destroy() {
    if(this.destroyed) return;
    this.destroyed = true;
    this.currentDeferredFrame?.reject(new Error('Video renderer disposed'));
    this.middleware.destroy();
    this.objectURLs.dispose();
    this.preparedBlob = undefined;
    this.video = null;
  }
}
