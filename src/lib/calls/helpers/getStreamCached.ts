/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import getScreenStream from './getScreenStream';
import getStream from './getStream';

/**
 * ! Use multiple constraints together only with first invoke
 */
export default function getStreamCached() {
  const _cache: {
    main: Partial<{
      audio: Promise<MediaStream>,
      video: Promise<MediaStream>
    }>,
    screen: Partial<{
      audio: Promise<MediaStream>,
      video: Promise<MediaStream>
    }>
  } = {
    main: {},
    screen: {}
  };

  return async(options: {
    isScreen: true,
    constraints: DisplayMediaStreamOptions,
  } | {
    isScreen?: false,
    constraints: MediaStreamConstraints,
    muted: boolean
  }) => {
    const {isScreen, constraints} = options;
    const cache = _cache[isScreen ? 'screen' : 'main'];
    let promise: Promise<MediaStream> = cache[constraints.audio ? 'audio' : 'video'];

    if(!promise) {
      promise = (isScreen ? getScreenStream : getStream)(constraints, (options as any).muted);
      if(constraints.audio && !cache.audio) cache.audio = promise.finally(() => cache.audio = undefined);
      if(constraints.video && !cache.video) cache.video = promise.finally(() => cache.video = undefined);
    }

    try {
      return await promise;
      /* let out: Partial<{
        audio: MediaStream,
        video: MediaStream
      }> = {};

      await Promise.all([
        constraints.audio && cache.audio.then((stream) => out.audio = stream),
        constraints.video && cache.video.then((stream) => out.video = stream)
      ].filter(Boolean));

      return out; */
    } catch(err) {
      throw err;
    }
  };
}

(window as any).getStreamCached = getStreamCached;
