import deferredPromise from '../../../helpers/cancellablePromise';
import createVideo from '../../../helpers/dom/createVideo';
import handleVideoLeak from '../../../helpers/dom/handleVideoLeak';
import {Middleware} from '../../../helpers/middleware';
import onMediaLoad from '../../../helpers/onMediaLoad';


type Options = {
  /**
   * [0, 1] will be multiplied by duration
   */
  currentTime?: number;
  muted?: boolean;
  waitToSeek?: boolean;
  middleware?: Middleware;
};

const weakRefs: WeakRef<any>[] = [];


// TODO: The video nodes themselves remain references somewhere, but they're src is cleaned up WTF
(window as any).derefMediaEditorVideos = () => {
  console.log('Dereffed weak refs ::>> ', weakRefs.map(r => r.deref()));
}

export default async function createVideoForDrawing(mediaSrc: string, options: Options = {}) {
  const currentTime = options.currentTime ?? 0;
  const waitToSeek = options.waitToSeek ?? true;
  const muted = options.muted ?? true;

  const video = createVideo({pip: false, middleware: options.middleware});
  video.src = mediaSrc;
  video.autoplay = true;
  video.controls = false;
  video.muted = true; // prevent sound playing while we're waiting for metadata

  weakRefs.push(new WeakRef(video));

  let timeout: number;

  video.addEventListener('timeupdate', () => {
    video.pause();
  }, {once: true});

  // Theoretically we should not have any errors here as this is handled in the media popup
  try {
    const promise = onMediaLoad(video);
    await handleVideoLeak(video, promise);

    if(waitToSeek) {
      const deferred = deferredPromise<void>();
      video.addEventListener('seeked', () => void deferred.resolve(), {once: true});
      timeout = self.setTimeout(() => deferred.resolve(), 500); // just in case

      video.currentTime = video.duration * currentTime;

      await deferred;
      self.clearTimeout(timeout);
    }
  } catch(e) {
    console.error(e);
  }


  if(!muted) video.muted = false;

  return video;
}
