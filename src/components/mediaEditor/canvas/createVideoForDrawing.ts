import createVideo from '@helpers/dom/createVideo';
import handleVideoLeak from '@helpers/dom/handleVideoLeak';
import {Middleware} from '@helpers/middleware';
import onMediaLoad from '@helpers/onMediaLoad';


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

export function seekVideoForDrawing(video: HTMLVideoElement, currentTime: number, signal?: AbortSignal) {
  if(signal?.aborted) return Promise.resolve();

  return new Promise<void>((resolve, reject) => {
    const cleanup = () => {
      self.clearTimeout(timeout);
      video.removeEventListener('seeked', onSeeked);
      video.removeEventListener('loadeddata', onSeeked);
      video.removeEventListener('error', onError);
      signal?.removeEventListener('abort', onAbort);
    };
    const finish = (error?: Error) => {
      cleanup();
      if(error) reject(error);
      else resolve();
    };
    const onAbort = () => finish();
    const onError = () => finish(new Error(`Video seek failed (${video.error?.code}): ${video.error?.message}`));
    const onSeeked = () => {
      if(!video.seeking && video.readyState >= video.HAVE_CURRENT_DATA) finish();
    };
    const timeout = self.setTimeout(() => finish(new Error(`Video seek timed out at ${currentTime} (readyState ${video.readyState})`)), 5000);

    if(video.error) {
      onError();
      return;
    }

    // A reused decoder need not emit seeked when it is already at this frame.
    if(video.currentTime === currentTime && !video.seeking && video.readyState >= video.HAVE_CURRENT_DATA) {
      finish();
      return;
    }

    video.addEventListener('seeked', onSeeked);
    video.addEventListener('loadeddata', onSeeked);
    video.addEventListener('error', onError);
    signal?.addEventListener('abort', onAbort, {once: true});
    try {
      video.currentTime = currentTime;
    } catch(error) {
      cleanup();
      reject(error);
    }
  });
}


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

  video.addEventListener('timeupdate', () => {
    video.pause();
  }, {once: true});

  // Theoretically we should not have any errors here as this is handled in the media popup
  try {
    await onMediaLoad(video);
    if(options.middleware && !options.middleware()) return video;
    await handleVideoLeak(video);
    if(options.middleware && !options.middleware()) return video;

    video.pause();
    video.autoplay = false;

    if(waitToSeek) {
      const controller = new AbortController();
      options.middleware?.onClean(() => controller.abort());
      await seekVideoForDrawing(video, video.duration * currentTime, controller.signal);
    }
  } catch(e) {
    if(!options.middleware || options.middleware()) {
      throw e instanceof Error ? e : new Error(`Video load failed (${video.error?.code}): ${video.error?.message || String(e)}`);
    }
  }


  if(!muted) video.muted = false;

  return video;
}
