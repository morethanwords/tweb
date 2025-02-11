import deferredPromise, {CancellablePromise} from '../../../helpers/cancellablePromise';
import appDownloadManager from '../../../lib/appManagers/appDownloadManager';
import {getMiddleware} from '../../../helpers/middleware';
import {Document} from '../../../layer';
import createVideo from '../../../helpers/dom/createVideo';
import onMediaLoad from '../../../helpers/onMediaLoad';
import apiManagerProxy from '../../../lib/mtproto/mtprotoworker';
import handleVideoLeak from '../../../helpers/dom/handleVideoLeak';
import {IS_FIREFOX} from '../../../environment/userAgent';

import {delay} from '../utils';

import {StickerFrameByFrameRenderer} from './types';
import {FRAMES_PER_SECOND} from './constants';

export default class VideoStickerFrameByFrameRenderer implements StickerFrameByFrameRenderer {
  private duration: number = 0;
  private currentDeferredFrame: CancellablePromise<void>;
  private video: HTMLVideoElement;

  private middleware = getMiddleware();

  async init(doc: Document.document) {
    const blob = await appDownloadManager.downloadMedia({
      media: doc
    });

    const video = (this.video = createVideo({middleware: this.middleware.get()}));
    video.src = await apiManagerProxy.invoke('createObjectURL', blob);
    // video.autoplay = true;
    video.controls = false;
    video.muted = true;
    // video.loop = true;
    video.preload = 'auto';

    const promise = onMediaLoad(video as HTMLMediaElement);
    await handleVideoLeak(video, promise);
    await delay(100); // Necessary
    this.duration = video.duration;

    video.addEventListener('seeked', () => {
      this.currentDeferredFrame?.resolve();
    });
  }

  getTotalFrames() {
    return IS_FIREFOX ? 1 : Math.floor(this.duration * 60);
  }

  async renderFrame(frame: number) {
    if(IS_FIREFOX) return;
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
    this.middleware.destroy();
    this.video = null;
  }
}
