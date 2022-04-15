/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import { makeMediaSize, MediaSize } from "./mediaSizes";
import pause from "./schedulers/pause";
import { IS_APPLE_MOBILE } from "../environment/userAgent";

export function scaleMediaElement(options: {
  media: CanvasImageSource, 
  mediaSize: MediaSize, 
  boxSize: MediaSize, 
  quality?: number,
  mimeType?: 'image/jpeg' | 'image/png'
}): Promise<{blob: Blob, size: MediaSize}> {
  return new Promise((resolve) => {
    const canvas = document.createElement('canvas');
    const size = options.mediaSize.aspectFitted(options.boxSize);
    canvas.width = size.width * window.devicePixelRatio;
    canvas.height = size.height * window.devicePixelRatio;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(options.media, 0, 0, canvas.width, canvas.height);
    canvas.toBlob(blob => {
      resolve({blob, size});
    }, options.mimeType ?? 'image/jpeg', options.quality ?? 1);
  });
}

export function preloadVideo(url: string): Promise<HTMLVideoElement> {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    video.volume = 0;
    video.addEventListener('loadedmetadata', () => resolve(video), {once: true});
    video.addEventListener('error', reject, {once: true});
    video.src = url;
  });
}

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

export function createPosterFromVideo(video: HTMLVideoElement): ReturnType<typeof scaleMediaElement> {
  return new Promise((resolve, reject) => {
    video.onseeked = () => {
      video.onseeked = () => {
        createPosterFromMedia(video).then(resolve);

        video.onseeked = undefined;
      };

      video.currentTime = 0;
    };
    
    video.onerror = reject;
    video.currentTime = Math.min(video.duration, 1);
  });
}

export async function createPosterForVideo(url: string) {
  const video = await preloadVideo(url);

  return Promise.race([
    pause(2000) as Promise<undefined>,
    createPosterFromVideo(video),
  ]);
}

export function onMediaLoad(media: HTMLMediaElement, readyState = media.HAVE_METADATA, useCanplayOnIos?: boolean) {
  return new Promise<void>((resolve) => {
    if(media.readyState >= readyState) {
      resolve();
      return;
    }

    media.addEventListener(IS_APPLE_MOBILE && !useCanplayOnIos ? 'loadeddata' : 'canplay', () => resolve(), {once: true});
  });
}

export async function getFilesFromEvent(e: ClipboardEvent | DragEvent, onlyTypes = false): Promise<any[]> {
  const files: any[] = [];

  const scanFiles = async(entry: any, item: DataTransferItem) => {
    if(entry.isDirectory) {
      const directoryReader = entry.createReader();
      await new Promise<void>((resolve, reject) => {
        directoryReader.readEntries(async(entries: any) => {
          for(const entry of entries) {
            await scanFiles(entry, item);
          }

          resolve();
        });
      });
    } else if(entry) {
      if(onlyTypes) {
        files.push(entry.type);
      } else {
        const itemFile = item.getAsFile(); // * Safari can't handle entry.file with pasting
        const file = entry instanceof File ? 
          entry : 
          (
            entry instanceof DataTransferItem ? 
              entry.getAsFile() : 
              await new Promise((resolve, reject) => entry.file(resolve, (err: any) => resolve(itemFile)))
          );

        /* if(!onlyTypes) {
          console.log('getFilesFromEvent: got file', item, file);
        } */

        if(!file) return;
        files.push(file);
      }
    }
  };

  if(e instanceof DragEvent && e.dataTransfer.files && !e.dataTransfer.items) {
    for(let i = 0; i < e.dataTransfer.files.length; i++) {
      const file = e.dataTransfer.files[i];
      files.push(onlyTypes ? file.type : file);
    }
  } else {
    // @ts-ignore
    const items = (e.dataTransfer || e.clipboardData || e.originalEvent.clipboardData).items;

    const promises: Promise<any>[] = [];
    for(let i = 0; i < items.length; ++i) {
      const item: DataTransferItem = items[i];
      if(item.kind === 'file') {
        const entry = (onlyTypes ? item : item.webkitGetAsEntry()) || item.getAsFile();
        promises.push(scanFiles(entry, item));
      }
    }
    
    await Promise.all(promises);
  }

  /* if(!onlyTypes) {
    console.log('getFilesFromEvent: got files:', e, files);
  } */
  
  return files;
}

export function requestFile(accept?: string) {
  const input = document.createElement('input');
  input.type = 'file';
  input.style.display = 'none';

  if(accept) {
    input.accept = accept;
  }

  document.body.append(input);

  const promise = new Promise<File>((resolve, reject) => {
    input.addEventListener('change', (e: any) => {
      const file: File = e.target.files[0];
      if(!file) {
        reject('NO_FILE_SELECTED');
        return;
      }
  
      resolve(file);
    }, {once: true});
  }).finally(() => {
    input.remove();
  });

  input.click();

  return promise;
}
