/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import type {VIDEO_MIME_TYPE} from '../../environment/videoMimeTypesSupport';

export default function canvasToVideo({
  canvas,
  timeslice,
  duration,
  // mimeType = 'video/webm; codecs="vp8"',
  mimeType = 'video/webm; codecs="vp8"',
  audioBitsPerSecond = 0,
  videoBitsPerSecond = 25000000
}: {
  canvas: HTMLCanvasElement
  timeslice: number,
  duration: number,
  mimeType?: string,
  audioBitsPerSecond?: number,
  videoBitsPerSecond?: number
}) {
  return new Promise<Blob>((resolve, reject) => {
    try {
      const stream = canvas.captureStream();
      const blobs: Blob[] = [];
      const recorder = new MediaRecorder(stream, {
        mimeType,
        audioBitsPerSecond,
        videoBitsPerSecond
      });

      recorder.ondataavailable = (event) => {
        if(event.data && event.data.size > 0) {
          blobs.push(event.data);
        }

        if(blobs.length === duration / timeslice) {
          stream.getTracks()[0].stop();
          recorder.stop();

          resolve(new Blob(blobs, {type: mimeType}));
        }
      };

      recorder.start(timeslice);
    } catch(e) {
      reject(e);
    }
  });
}

(window as any).canvasToVideo = canvasToVideo;
