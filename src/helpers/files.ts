import { pause } from "./schedulers";

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