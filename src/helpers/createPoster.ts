/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import pause from './schedulers/pause';
import {makeMediaSize} from './mediaSize';
import scaleMediaElement from './canvas/scaleMediaElement';
import preloadVideo from './preloadVideo';
import setCurrentTime from './dom/setCurrentTime';

export function createPosterFromMedia(media: HTMLVideoElement | HTMLImageElement) {
  let width: number, height: number;
  if(media instanceof HTMLVideoElement) {
    width = media.videoWidth;
    height = media.videoHeight;
  } else {
    width = media.naturalWidth;
    height = media.naturalHeight;
  }

  return scaleMediaElement({
    media,
    mediaSize: makeMediaSize(width, height),
    boxSize: makeMediaSize(320, 240),
    quality: .9
  });
}

export function createPosterFromVideo(video: HTMLVideoElement): ReturnType<typeof createPosterFromMedia> {
  return new Promise((resolve, reject) => {
    video.onseeked = () => {
      video.onseeked = () => {
        createPosterFromMedia(video).then(resolve);

        video.onseeked = undefined;
      };

      setCurrentTime(video, 0);
    };

    video.onerror = reject;
    setCurrentTime(video, Math.min(video.duration, 1));
  });
}

export async function createPosterForVideo(url: string) {
  const video = await preloadVideo(url);

  return Promise.race([
    pause(2000) as Promise<undefined>,
    createPosterFromVideo(video)
  ]);
}


