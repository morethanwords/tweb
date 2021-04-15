/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import { pause } from "./schedulers";
import { isAppleMobile } from "./userAgent";

export function preloadVideo(url: string): Promise<HTMLVideoElement> {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    video.volume = 0;
    video.onloadedmetadata = () => resolve(video);
    video.onerror = reject;
    video.src = url;
  });
}

export function createPosterFromVideo(video: HTMLVideoElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    video.onseeked = () => {
      const canvas = document.createElement('canvas');
      canvas.width = Math.min(1280, video.videoWidth);
      canvas.height = Math.min(720, video.videoHeight);
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(video, 0, 0);
      canvas.toBlob(blob => {
        resolve(blob);
      }, 'image/jpeg', 1);
    };

    video.onerror = reject;
    video.currentTime = Math.min(video.duration, 1);
  });
}

export async function createPosterForVideo(url: string): Promise<Blob | undefined> {
  const video = await preloadVideo(url);

  return Promise.race([
    pause(2000) as Promise<undefined>,
    createPosterFromVideo(video),
  ]);
}

export function onVideoLoad(video: HTMLVideoElement) {
  return new Promise<void>((resolve) => {
    if(video.readyState >= video.HAVE_METADATA) {
      resolve();
      return;
    }

    video.addEventListener(isAppleMobile ? 'loadeddata' : 'canplay', () => resolve(), {once: true});
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
