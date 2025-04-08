import DEBUG from '../../config/debug';
import {Middleware} from '../../helpers/middleware';

import {log} from './common';
import {hlsInstancesByVideo} from './hlsInstancesByVideo';

type InitVideoHlsParameters = {
  video: HTMLVideoElement;
  src: string;
  middleware: Middleware;
};

export async function initVideoHls({video, src, middleware}: InitVideoHlsParameters) {
  const {default: Hls} = await import('hls.js');

  log('initing video hls', src);

  const hls = new Hls({
    debug: DEBUG,
    startLevel: 0,
    testBandwidth: false,
    // autoStartLoad: false
    backBufferLength: 30,
    maxBufferLength: 60,
    maxMaxBufferLength: 60,
    maxFragLookUpTolerance: 0.001,
    maxBufferHole: 1,
    nudgeMaxRetry: 10000
  });

  hlsInstancesByVideo.set(video, hls);

  hls.loadSource(src);
  hls.attachMedia(video as HTMLMediaElement);

  middleware?.onDestroy(() => {
    log('destroying Hls instance for video', src);
    hls.destroy();
  });
}
